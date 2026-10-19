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

function fbm(lon: number, lat: number, fLon: number, fLat: number, octaves = 4): number {
  let a = 0;
  let w = 0.5;
  let fl = fLon;
  let ft = fLat;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    a += pnoise(lon + i * 0.37, lat, fl, ft) * w;
    sum += w;
    fl *= 2.05;
    ft *= 2.05;
    w *= 0.5;
  }
  return a / sum;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Equirectangular cloud deck. North is at the top of the canvas.
 * u = lon / τ + 0.5 matches the cloud shader.
 * Higher-res procedural bands — no NASA imagery.
 */
export function createCloudTexture(): THREE.CanvasTexture {
  const w = 3072;
  const h = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  const img = ctx.createImageData(w, h);
  const data = img.data;

  // Classic Jupiter belt / zone centers (degrees) with widths and RGB targets.
  const bands: Array<{ c: number; w: number; r: number; g: number; b: number; k: number }> = [
    { c: 0, w: 5.8, r: 248, g: 232, b: 204, k: 0.95 }, // Equatorial Zone
    { c: 7.5, w: 3.2, r: 210, g: 150, b: 96, k: 0.55 },
    { c: 14, w: 5.6, r: 148, g: 52, b: 22, k: 1 }, // NEB / SEB-ish
    { c: -16, w: 5.0, r: 138, g: 46, b: 18, k: 1 },
    { c: 23, w: 3.4, r: 236, g: 214, b: 178, k: 0.75 },
    { c: -24, w: 3.2, r: 230, g: 208, b: 172, k: 0.7 },
    { c: 32, w: 3.6, r: 132, g: 58, b: 28, k: 0.9 },
    { c: -33, w: 3.4, r: 126, g: 54, b: 26, k: 0.85 },
    { c: 41, w: 3.0, r: 220, g: 196, b: 158, k: 0.65 },
    { c: -42, w: 3.0, r: 214, g: 190, b: 152, k: 0.6 },
    { c: 50, w: 3.4, r: 150, g: 88, b: 52, k: 0.55 },
    { c: -51, w: 3.2, r: 146, g: 84, b: 50, k: 0.5 },
    { c: 58, w: 4.0, r: 188, g: 172, b: 158, k: 0.45 },
    { c: -59, w: 4.0, r: 182, g: 168, b: 156, k: 0.42 },
  ];

  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * Math.PI * 2;
      const latDeg = lat * (180 / Math.PI);
      const deg = Math.abs(latDeg);

      const streak = fbm(lon, lat, 1.55, 38, 4);
      const grain = fbm(lon + 1.3, lat, 3.2, 10, 3);
      const swirl = fbm(lon * 0.7 + lat * 0.4, lat, 2.4, 6.5, 3);
      const hair = fbm(lon + 0.5, lat, 6.0, 55, 2);

      // Jet shear warps latitude for festoon / chevron edges
      const shear = Math.sin(lat * 17.0) * 0.35 + Math.sin(lat * 9.0 + lon * 0.4) * 0.18;
      const warped = latDeg + shear * (0.55 + streak * 0.9);

      let r = 226;
      let gc = 204;
      let b = 162;

      for (const band of bands) {
        const d = (warped - band.c) / band.w;
        const m = Math.exp(-d * d) * band.k;
        r = lerp(r, band.r, m);
        gc = lerp(gc, band.g, m);
        b = lerp(b, band.b, m);
      }

      // North Equatorial Belt blue-gray festoons
      if (latDeg > 5 && latDeg < 18 && grain > 0.58) {
        const k = Math.min(1, (grain - 0.58) / 0.2) * 0.7;
        r = lerp(r, 118, k);
        gc = lerp(gc, 132, k);
        b = lerp(b, 148, k);
      }
      // Equatorial barges / dark patches
      if (Math.abs(latDeg) < 6 && swirl > 0.62) {
        const k = Math.min(1, (swirl - 0.62) / 0.2) * 0.55;
        r = lerp(r, 160, k);
        gc = lerp(gc, 92, k);
        b = lerp(b, 48, k);
      }

      // Polar haze — muted blue-gray
      const pole = smoothstep(48, 74, deg);
      const polarN = grain;
      r = lerp(r, lerp(158, 112, polarN), pole);
      gc = lerp(gc, lerp(168, 124, polarN), pole);
      b = lerp(b, lerp(178, 142, polarN), pole);

      // Longitudinal streak contrast + fine hair
      const s = (streak - 0.5) * 42 + (hair - 0.5) * 18;
      r += s;
      gc += s * 0.72;
      b += s * 0.38;

      // Soft vignette of deeper tones in belt cores
      const beltCore =
        Math.exp(-Math.pow((warped - 14) / 4.2, 2)) + Math.exp(-Math.pow((warped + 16) / 4.0, 2));
      r = lerp(r, r * 0.82, beltCore * 0.35);
      gc = lerp(gc, gc * 0.78, beltCore * 0.35);
      b = lerp(b, b * 0.72, beltCore * 0.35);

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
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function createEarthTexture(): THREE.CanvasTexture {
  const w = 384;
  const h = 192;
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
