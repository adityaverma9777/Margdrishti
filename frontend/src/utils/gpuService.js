const DEFAULT_URL = import.meta.env.VITE_GPU_SERVER_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : 'https://streetiq-gov-api.onrender.com');
let cachedHealth = null;
let lastCheckTime = 0;
let isWakingUp = false;
export async function checkGpuServerHealth(force = false) {
  const now = Date.now();
  if (!force && cachedHealth && now - lastCheckTime < 4000) {
    return cachedHealth;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isWakingUp ? 15000 : 4000);
    const res = await fetch(`${DEFAULT_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error('Bad response');
    const data = await res.json();
    cachedHealth = { online: true, ...data };
    isWakingUp = false;
    lastCheckTime = now;
    return cachedHealth;
  } catch (err) {
    isWakingUp = true;
    cachedHealth = { online: false, wakingUp: true, error: err.message };
    lastCheckTime = now;
    return cachedHealth;
  }
}
const offscreenCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
export async function predictFrameGpu(videoOrCanvas, conf = 0.15) {
  if (!offscreenCanvas) return null;
  offscreenCanvas.width = 640;
  offscreenCanvas.height = 360;
  const ctx = offscreenCanvas.getContext('2d');
  ctx.drawImage(videoOrCanvas, 0, 0, 640, 360);
  const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.82);
  const res = await fetch(`${DEFAULT_URL}/predict/tri_layer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, confidence: conf }),
  });
  if (!res.ok) throw new Error(`GPU inference failed: ${res.statusText}`);
  return await res.json();
}
export async function predictTriLayerGpu(videoOrCanvas, conf = 0.15) {
  return predictFrameGpu(videoOrCanvas, conf);
}
