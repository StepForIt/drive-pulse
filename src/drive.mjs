// Appel Drive v3 authentifié, en fetch nu. 401 → jeton rafraîchi une fois ; 429/5xx ou réseau
// coupé → retenté avec un délai croissant. Les erreurs ne gardent que le code HTTP (repo public).

export function driveClient({ getToken, baseUrl = "https://www.googleapis.com", fetchImpl = fetch, retries = 3 }) {
  return async function call(method, path, { query = {}, text = false } = {}) {
    const url = new URL(path, baseUrl);
    url.searchParams.set("supportsAllDrives", "true");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    let forced = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getToken({ force: forced });
      let res;
      try {
        res = await fetchImpl(url, { method, headers: { authorization: `Bearer ${token}` } });
      } catch (err) {
        if (attempt < retries) { await new Promise((r) => setTimeout(r, 500 * 2 ** attempt)); continue; }
        throw new Error(`Drive : réseau injoignable (${err.cause?.code ?? "réseau"})`);
      }
      if (res.ok) return res.status === 204 ? null : text ? res.text() : res.json();
      if (res.status === 401 && !forced) { forced = true; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Drive ${method} : HTTP ${res.status}`);
    }
  };
}
