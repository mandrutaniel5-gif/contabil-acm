// Cod QR pentru asocierea dispozitivelor: generare (SVG) și scanare cu camera.
import qrcode from '../vendor/qrcode.mjs';

export function qrSVG(text, px = 240) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), m = 4, s = n + m * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Cod QR de asociere"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function incarcaJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/jsQR.js';
    s.onload = () => res(window.jsQR);
    s.onerror = () => rej(new Error('Scanerul QR nu s-a putut încărca.'));
    document.head.appendChild(s);
  });
}

/** Pornește camera în elementul <video> și întoarce primul cod QR citit. stop() oprește camera. */
export async function scaneaza(video, { semnal } = {}) {
  const jsQR = await incarcaJsQR();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    throw new Error('Nu am acces la cameră. Permite accesul la cameră sau introdu codul de asociere de mână.');
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try {
    return await new Promise((res, rej) => {
      const pas = () => {
        if (semnal && semnal.aborted) return rej(new Error('anulat'));
        if (video.videoWidth) {
          const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
          c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
          ctx.drawImage(video, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const r = jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
          if (r && r.data) return res(r.data);
        }
        requestAnimationFrame(pas);
      };
      pas();
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
