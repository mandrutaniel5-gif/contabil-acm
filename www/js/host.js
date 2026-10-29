// Cereri HTTP native: ANAF și BNR nu permit apeluri din browser (CORS), dar aplicația instalată le poate face.
//  - Windows (Electron): prin procesul principal (preload expune window.acmHost.fetch)
//  - Android / iOS (Capacitor): prin pluginul CapacitorHttp
//  - browser: fetch obișnuit (merge doar pentru serviciile care permit CORS)

const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export const platforma = () => {
  if (window.acmHost) return 'windows';
  const c = window.Capacitor;
  if (c && c.isNativePlatform && c.isNativePlatform()) return c.getPlatform(); // 'android' | 'ios'
  return 'web';
};
export const areHttpNativ = () => platforma() !== 'web';

/**
 * nativeFetch(url, { method, headers, body (string | Uint8Array) })
 * → { ok, status, headers, bytes: Uint8Array, text(): string, json(): any }
 */
export async function nativeFetch(url, opts = {}) {
  const method = opts.method || 'GET';
  const headers = opts.headers || {};
  let status, hdrs = {}, bytes;

  if (window.acmHost && window.acmHost.fetch) {
    const body = opts.body == null ? null : (typeof opts.body === 'string' ? { text: opts.body } : { b64: bytesToB64(opts.body) });
    const r = await window.acmHost.fetch(url, { method, headers, body });
    if (r.error) throw new Error(r.error);
    status = r.status; hdrs = r.headers || {}; bytes = b64ToBytes(r.b64 || '');
  } else if (platforma() === 'android' || platforma() === 'ios') {
    const H = window.Capacitor.Plugins.CapacitorHttp;
    const req = { url, method, headers, responseType: 'arraybuffer', connectTimeout: 30000, readTimeout: 60000 };
    if (opts.body != null) {
      if (typeof opts.body === 'string') req.data = opts.body;
      else { req.data = bytesToB64(opts.body); req.dataType = 'file'; }
    }
    const r = await H.request(req);
    status = r.status; hdrs = r.headers || {};
    bytes = typeof r.data === 'string' ? b64ToBytes(r.data) : new TextEncoder().encode(JSON.stringify(r.data ?? ''));
  } else {
    const r = await fetch(url, { method, headers, body: opts.body ?? undefined });
    status = r.status; r.headers.forEach((v, k) => { hdrs[k] = v; });
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  return {
    ok: status >= 200 && status < 300, status, headers: hdrs, bytes,
    text: () => new TextDecoder().decode(bytes),
    json: () => JSON.parse(new TextDecoder().decode(bytes)),
  };
}

export { bytesToB64, b64ToBytes };
