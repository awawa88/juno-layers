import * as THREE from "three";
import { fillRows, type TextureKind } from "@/jupiter/texture-gen";

export type { TextureKind };

/** Wrap RGBA pixels in a canvas-backed texture (the canvas stays alive so a restored WebGL context can re-upload it). */
function toTexture(data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Generate a map synchronously; only for small previews, since a full map blocks the page for seconds. */
export function createPlanetTexture(kind: TextureKind, w: number, h: number): THREE.CanvasTexture {
  const data = new Uint8ClampedArray(w * h * 4);
  fillRows(kind, data, w, h, 0, h);
  return toTexture(data, w, h);
}

const cache = new Map<string, Promise<Uint8ClampedArray<ArrayBuffer>>>();
let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (data: Uint8ClampedArray<ArrayBuffer> | null) => void>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./texture.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; data: Uint8ClampedArray<ArrayBuffer> }>) => {
      pending.get(event.data.id)?.(event.data.data);
      pending.delete(event.data.id);
    };
    worker.onerror = (event) => {
      console.warn("Texture worker failed; generating on the main thread instead.", event.message);
      worker?.terminate();
      worker = null;
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
    };
  } catch (err) {
    console.warn("Texture worker unavailable; generating on the main thread instead.", err);
    worker = null;
  }
  return worker;
}

/** Fill rows in ~12 ms slices between frames so the page keeps animating and responding. */
async function generateChunked(kind: TextureKind, w: number, h: number): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const data = new Uint8ClampedArray(w * h * 4);
  let y = 0;
  while (y < h) {
    const start = performance.now();
    while (y < h && performance.now() - start < 12) {
      const end = Math.min(h, y + 4);
      fillRows(kind, data, w, h, y, end);
      y = end;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return data;
}

function generate(kind: TextureKind, w: number, h: number): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const off = getWorker();
  if (!off) return generateChunked(kind, w, h);
  const id = nextId++;
  return new Promise<Uint8ClampedArray<ArrayBuffer> | null>((resolve) => {
    pending.set(id, resolve);
    off.postMessage({ id, kind, w, h });
  }).then((data) => data ?? generateChunked(kind, w, h));
}

/** NASA Blue Marble equirectangular (RGB + baked land/ocean alpha). */
const EARTH_MAP_URL = "/textures/earth-blue-marble.webp";

let earthMapPromise: Promise<THREE.Texture> | null = null;

/** Load the shared Earth albedo once; ignores w/h (single lightweight asset). */
export function loadEarthBlueMarble(): Promise<THREE.Texture> {
  if (!earthMapPromise) {
    earthMapPromise = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        EARTH_MAP_URL,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = 8;
          resolve(tex);
        },
        undefined,
        (err) => {
          earthMapPromise = null;
          reject(err);
        },
      );
    });
  }
  return earthMapPromise;
}


/** NASA LROC WAC lunar color (CGI Moon Kit), equirectangular albedo. */
const MOON_MAP_URL = "/textures/moon-lroc.webp";

let moonMapPromise: Promise<THREE.Texture> | null = null;

/** Load the shared Moon albedo once; ignores w/h (single lightweight asset). */
export function loadMoonAlbedo(): Promise<THREE.Texture> {
  if (!moonMapPromise) {
    moonMapPromise = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        MOON_MAP_URL,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = 8;
          resolve(tex);
        },
        undefined,
        (err) => {
          moonMapPromise = null;
          reject(err);
        },
      );
    });
  }
  return moonMapPromise;
}

/** Hubble OPAL Jupiter global map (equirectangular cloud albedo), Real-ESRGAN upscaled. */
const JUPITER_CLOUD_MAP_URLS = {
  8192: "/textures/jupiter-opal-8k.webp",
  4096: "/textures/jupiter-opal.webp",
  2048: "/textures/jupiter-opal-mobile.webp",
} as const;

export type JupiterCloudMapWidth = keyof typeof JUPITER_CLOUD_MAP_URLS;

/** Largest cloud map that fits the requested width and the GPU's texture limit. */
export function pickJupiterCloudMapWidth(requested: number, maxTextureSize: number): JupiterCloudMapWidth {
  if (requested >= 8192 && maxTextureSize >= 8192) return 8192;
  if (requested >= 3072 && maxTextureSize >= 4096) return 4096;
  return 2048;
}

const jupiterCloudMapPromises = new Map<string, Promise<THREE.Texture>>();

function loadJupiterCloudMapUrl(url: string): Promise<THREE.Texture> {
  let promise = jupiterCloudMapPromises.get(url);
  if (!promise) {
    promise = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 8;
          resolve(tex);
        },
        undefined,
        (err) => {
          jupiterCloudMapPromises.delete(url);
          reject(err);
        },
      );
    });
    jupiterCloudMapPromises.set(url, promise);
  }
  return promise;
}

/** Load Jupiter cloud albedo at 8192, 4096 or 2048 px wide (see pickJupiterCloudMapWidth). */
export function loadJupiterCloudMap(width: JupiterCloudMapWidth = 4096): Promise<THREE.Texture> {
  return loadJupiterCloudMapUrl(JUPITER_CLOUD_MAP_URLS[width]).then((tex) => {
    // Desktop 4K/8K: nearest-mip (no blend between levels) reads crisper on belts/GRS.
    // Mobile keeps trilinear to avoid shimmer on small screens.
    if (width >= 4096) {
      tex.minFilter = THREE.LinearMipmapNearestFilter;
      tex.needsUpdate = true;
    }
    return tex;
  });
}

/**
 * Full-resolution map: Jupiter clouds and Earth use NASA photo assets
 * (preview stays procedural via createPlanetTexture). Moon via loadMoonAlbedo().
 */
export function loadPlanetTexture(kind: TextureKind, w: number, h: number): Promise<THREE.Texture> {
  if (kind === "earth") return loadEarthBlueMarble();
  if (kind === "cloud") return loadJupiterCloudMap(pickJupiterCloudMapWidth(w, 8192));
  const key = `${kind}:${w}x${h}`;
  let pixels = cache.get(key);
  if (!pixels) {
    pixels = generate(kind, w, h);
    cache.set(key, pixels);
    pixels.catch(() => cache.delete(key));
  }
  return pixels.then((data) => toTexture(data, w, h));
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
