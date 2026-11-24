// Jeton Google Drive fourni par le Nango auto-hébergé : l'OAuth vit dans Nango, jamais ici.
// Repo public : aucun message d'erreur ne cite l'identifiant de connexion.

export function nangoTokenProvider({ host, secretKey, connectionId, providerConfigKey, fetchImpl = fetch, retries = 3 }) {
  let cached = null;
  return async function getToken({ force = false } = {}) {
    if (cached && !force) return cached;
    const url = new URL(`/connection/${encodeURIComponent(connectionId)}`, host);
    url.searchParams.set("provider_config_key", providerConfigKey);
    if (force) url.searchParams.set("force_refresh", "true");

    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetchImpl(url, { headers: { authorization: `Bearer ${secretKey}` } });
        break;
      } catch (err) {
        if (attempt >= retries) throw new Error(`Nango injoignable (${err.cause?.code ?? "réseau"})`);
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      }
    }
    if (!res.ok) throw new Error(`Nango a refusé la connexion : HTTP ${res.status}`);
    const { credentials } = await res.json();
    cached = credentials?.access_token ?? credentials?.accessToken;
    if (!cached) throw new Error("Nango n'a renvoyé aucun access_token");
    return cached;
  };
}
