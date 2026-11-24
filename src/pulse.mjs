// Cœur du Pulse Drive, sans réseau : qu'est-ce qui a bougé sous le dossier racine, et comment le
// rendre en un Markdown court que le hook SessionStart de wappe injecte dans chaque session Claude Code.

const FOLDER = "application/vnd.google-apps.folder";
const DAY = 24 * 3600 * 1000;

export function rootPathResolver({ getMeta, rootId, maxDepth = 30 }) {
  const cache = new Map([[rootId, Promise.resolve([])]]);
  function pathOf(id, depth) {
    if (cache.has(id)) return cache.get(id);
    const p = (async () => {
      if (depth > maxDepth) return null;
      const meta = await getMeta(id);
      for (const parent of meta?.parents ?? []) {
        const up = await pathOf(parent, depth + 1);
        if (up) return [...up, meta.name];
      }
      return null;
    })();
    cache.set(id, p);
    return p;
  }
  return async (file) => {
    for (const parent of file.parents ?? []) {
      const up = await pathOf(parent, 0);
      if (up) return up;
    }
    return null;
  };
}

export function isNoise(file, ignoreAuthors = []) {
  if (file.mimeType === FOLDER || file.mimeType?.startsWith("image/") || file.mimeType?.startsWith("video/")) return true;
  const email = file.lastModifyingUser?.emailAddress?.toLowerCase();
  return Boolean(email && ignoreAuthors.includes(email));
}

export function toEntry(file, path) {
  return {
    id: file.id,
    title: file.name,
    at: file.modifiedTime,
    by: file.lastModifyingUser?.displayName || file.lastModifyingUser?.emailAddress || "?",
    path: path.join(" / "),
    link: file.webViewLink || `https://drive.google.com/open?id=${file.id}`,
  };
}

export function mergeEntries(prev, fresh, { now = Date.now(), keepDays = 7, cap = 300 } = {}) {
  const byId = new Map();
  for (const e of [...prev, ...fresh]) {
    const cur = byId.get(e.id);
    if (!cur || cur.at < e.at) byId.set(e.id, e);
  }
  const floor = new Date(now - keepDays * DAY).toISOString();
  return [...byId.values()].filter((e) => e.at >= floor).sort((a, b) => b.at.localeCompare(a.at)).slice(0, cap);
}

export function tailOf(text, max = 3000) {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(-max);
  const para = cut.indexOf("\n\n");
  return (para >= 0 && para < max / 2 ? cut.slice(para + 2) : cut).trim();
}

const fmt = (iso, opts) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts }).format(new Date(iso));
const day = (iso) => fmt(iso, { weekday: "short", day: "2-digit", month: "2-digit" });
const hour = (iso) => fmt(iso, { hour: "2-digit", minute: "2-digit" });

export function renderPulse({ rootName, entries, pinned = [], updatedAt, keepDays = 7 }) {
  const out = [
    `# Drive Pulse · ${rootName}`,
    "",
    `Mis à jour le ${day(updatedAt)} à ${hour(updatedAt)} (Paris) · ${entries.length} fichier(s) modifié(s) sur ${keepDays} jours.`,
    "Lecture seule : le Drive décrit le plan, le code fait foi sur ce qui existe.",
  ];
  for (const p of pinned) {
    out.push("", `## Fin de « ${p.title} » (modifié le ${day(p.at)} à ${hour(p.at)})`, "", ...p.tail.split("\n").map((l) => `> ${l}`.trimEnd()), "", `[ouvrir](${p.link})`);
  }
  out.push("", "## Changements, plus récents d'abord");
  if (!entries.length) out.push("", "Rien n'a bougé.");
  let current = null;
  for (const e of entries) {
    const d = day(e.at);
    if (d !== current) out.push("", `### ${d}`, "");
    current = d;
    out.push(`- ${hour(e.at)} · [${e.title}](${e.link}) · ${e.by}${e.path ? ` · _${e.path}_` : ""}`);
  }
  return out.join("\n") + "\n";
}
