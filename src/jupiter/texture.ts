import * as THREE from "three";

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function hash(ix: number, iy: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Longitude-periodic noise. lon is radians. */
function pnoise(lon: number, lat: number, fLon: number, fLat: number): number {
  const sx = Math.sin(lon) * fLon;
  const cx = Math.cos(lon) * fLon;
  return vnoise(sx + 8.2, lat * fLat) * 0.55 + vnoise(cx + 2.4, lat * fLat * 1.6 + 5.0) * 0.45;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Equirectangular cloud deck. North is at the top of the canvas.
 * u = lon / τ + 0.5 matches the cloud shader.
 */
export function createCloudTexture(): THREE.CanvasTexture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * Math.PI * 2;
      const latDeg = lat * (180 / Math.PI);
      const deg = Math.abs(latDeg);
      const streak = pnoise(lon, lat, 1.6, 34);
      const grain = pnoise(lon + 1.3, lat, 3.4, 9);

      const g = (center: number, width: number) => {
        const d = (latDeg - center) / width;
        return Math.exp(-d * d);
      };
      let r = 228;
      let gc = 206;
      let b = 164;
      const paint = (m: number, cr: number, cg: number, cb: number) => {
        r = lerp(r, cr, m);
        gc = lerp(gc, cg, m);
        b = lerp(b, cb, m);
      };
      paint(Math.min(1, g(32, 3.4) + g(-33, 3.2) * 0.9), 146, 64, 28);
      paint(Math.min(1, g(44, 3.1) + g(-44, 3.0) * 0.85), 132, 58, 30);
      paint(g(12, 5.4), 168, 62, 24);
      paint(g(-15, 4.8), 156, 52, 20);
      paint(Math.min(1, g(0, 5.2)), 242, 226, 196);
      const fest = grain;
      if (Math.abs(latDeg) < 7 && fest > 0.57) {
        const k = Math.min(1, (fest - 0.57) / 0.22);
        paint(k * 0.75, 138, 158, 168);
      }
      const pole = smoothstep(50, 72, deg);
      const polarN = grain;
      r = lerp(r, lerp(168, 122, polarN), pole);
      gc = lerp(gc, lerp(176, 132, polarN), pole);
      b = lerp(b, lerp(186, 146, polarN), pole);

      const s = (streak - 0.5) * 36;
      r += s;
      gc += s * 0.75;
      b += s * 0.4;

      const i = (y * w + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(gc);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function createEarthTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const img = ctx.createImageData(w, h);
  const data = img.data;

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * Math.PI * 2;
      const n = pnoise(lon, lat, 1.3, 1.1);
      const n2 = pnoise(lon + 1.7, lat, 2.4, 2.2);
      const land = n * 0.65 + n2 * 0.35;
      const ice = Math.abs(lat) > 1.15 ? 1 : Math.abs(lat) > 0.95 ? (Math.abs(lat) - 0.95) / 0.2 : 0;
      let r: number;
      let g: number;
      let b: number;
      if (land > 0.52) {
        const k = Math.min(1, (land - 0.52) / 0.25);
        r = lerp(86, 120, k);
        g = lerp(104, 92, k);
        b = lerp(62, 58, k);
      } else {
        const k = land / 0.52;
        r = lerp(18, 36, k);
        g = lerp(64, 92, k);
        b = lerp(112, 130, k);
      }
      r = lerp(r, 232, ice);
      g = lerp(g, 238, ice);
      b = lerp(b, 242, ice);
      const cloud = smoothstep(0.62, 0.78, n2);
      r = lerp(r, 246, cloud * 0.45);
      g = lerp(g, 248, cloud * 0.45);
      b = lerp(b, 250, cloud * 0.45);
      const i = (y * w + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
