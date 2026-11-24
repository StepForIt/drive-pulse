#!/usr/bin/env node
// Met à jour le Pulse Drive dans PULSE_DIR (la branche `drive-pulse` de wappe, extraite par le
// workflow). Rien de modifié = rien d'écrit : le workflow ne commite pas.
// Repo PUBLIC : ne jamais afficher de nom de fichier, de dossier ni d'identifiant. Compteurs seulement.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nangoTokenProvider } from "./nango.mjs";
import { driveClient } from "./drive.mjs";
import { isNoise, mergeEntries, renderPulse, rootPathResolver, tailOf, toEntry } from "./pulse.mjs";

const REQUIRED = ["NANGO_HOST", "NANGO_SECRET_KEY", "NANGO_CONNECTION_ID", "PULSE_ROOT_ID", "PULSE_DIR"];
const FIELDS = "id, name, mimeType, modifiedTime, parents, webViewLink, lastModifyingUser(displayName, emailAddress)";
const KEEP_DAYS = 7;
const OVERLAP = 5 * 60 * 1000; // une modif enregistrée pendant le run précédent n'est pas perdue
const ids = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const list = (v) => (v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function main(env) {
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Secrets manquants : ${missing.join(", ")} (cf. README)`);

  const getToken = nangoTokenProvider({
    host: env.NANGO_HOST,
    secretKey: env.NANGO_SECRET_KEY,
    connectionId: env.NANGO_CONNECTION_ID,
    providerConfigKey: env.NANGO_PROVIDER_CONFIG_KEY || "google-drive",
  });
  const call = driveClient({ getToken });
  const getMeta = (id) => call("GET", `/drive/v3/files/${id}`, { query: { fields: "id, name, parents" } });

  const root = await getMeta(env.PULSE_ROOT_ID).catch((err) => {
    const access = /HTTP (403|404)/.test(err.message) ? " (accès au dossier ? scope drive ou drive.readonly ?)" : "";
    throw new Error(`Dossier racine illisible par la connexion Nango${access}`);
  });

  const statePath = join(env.PULSE_DIR, "state.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { entries: [], pinned: {} };
  const startedAt = Date.now();
  const floor = new Date(startedAt - KEEP_DAYS * 24 * 3600 * 1000).toISOString();
  const since = !state.since ? new Date(startedAt - 24 * 3600 * 1000).toISOString() : state.since > floor ? state.since : floor;

  const modified = [];
  let pageToken;
  do {
    const page = await call("GET", "/drive/v3/files", {
      query: {
        q: `modifiedTime > '${since}' and trashed = false`,
        fields: `nextPageToken, files(${FIELDS})`,
        orderBy: "modifiedTime desc",
        pageSize: "1000",
        corpora: "allDrives",
        includeItemsFromAllDrives: "true",
        ...(pageToken ? { pageToken } : {}),
      },
    });
    modified.push(...page.files);
    pageToken = page.nextPageToken;
  } while (pageToken);

  const ignore = list(env.PULSE_IGNORE_AUTHORS);
  const pathOf = rootPathResolver({ getMeta, rootId: env.PULSE_ROOT_ID });
  const watched = new Set(ids(env.PULSE_WATCH));
  const skipDirs = list(env.PULSE_IGNORE_DIRS || "Wappe - Screenshots");
  const fresh = [];
  for (const f of modified) {
    if (isNoise(f, ignore)) continue;
    const path = watched.has(f.id) ? [] : await pathOf(f);
    if (path && !skipDirs.includes(path[0]?.toLowerCase())) fresh.push(toEntry(f, path));
  }
  state.entries = state.entries.filter((e) => !skipDirs.includes(e.path.split(" / ")[0].toLowerCase()));
  const seen = new Set(state.entries.map((e) => `${e.id}@${e.at}`));
  const news = fresh.filter((e) => !seen.has(`${e.id}@${e.at}`));

  let pinnedChanged = false;
  const pinned = {};
  for (const id of ids(env.PULSE_PINNED)) {
    const meta = await call("GET", `/drive/v3/files/${id}`, { query: { fields: "id, name, modifiedTime, webViewLink" } });
    const prev = state.pinned?.[id];
    if (prev && prev.at === meta.modifiedTime) { pinned[id] = prev; continue; }
    const text = await call("GET", `/drive/v3/files/${id}/export`, { query: { mimeType: "text/plain" }, text: true });
    pinned[id] = { title: meta.name, at: meta.modifiedTime, link: meta.webViewLink, tail: tailOf(text) };
    pinnedChanged = true;
  }

  const changed = news.length > 0 || pinnedChanged || !existsSync(join(env.PULSE_DIR, "pulse.md"));
  if (changed) {
    const entries = mergeEntries(state.entries, fresh, { now: startedAt, keepDays: KEEP_DAYS });
    writeFileSync(statePath, JSON.stringify({ since: new Date(startedAt - OVERLAP).toISOString(), entries, pinned }, null, 2) + "\n");
    writeFileSync(join(env.PULSE_DIR, "pulse.md"), renderPulse({ rootName: root.name, entries, pinned: Object.values(pinned), updatedAt: new Date(startedAt).toISOString(), keepDays: KEEP_DAYS }));
  }

  // Compteurs seulement : les logs d'un repo public sont lisibles par tous.
  const summary = `Drive Pulse : ${fresh.length} fichier(s) suivi(s) modifié(s), ${news.length} nouveau(x)${pinnedChanged ? ", document épinglé mis à jour" : ""}.`;
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary + "\n");
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

main(process.env).catch((err) => {
  // Le message d'erreur Drive brut peut citer des noms : on ne garde que le code HTTP.
  const code = /HTTP (\d{3})/.exec(err.message)?.[1];
  console.error(`✖ ${code ? `Échec (HTTP ${code})` : err.message.replace(/https?:\/\/\S+/g, "<url>")}`);
  process.exit(1);
});
