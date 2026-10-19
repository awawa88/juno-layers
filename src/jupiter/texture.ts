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

/**
 * Full-resolution map generated off the main thread (Web Worker, or chunked between frames as a fallback).
 * Pixels are cached for the session, so returning to the explorer is instant.
 */
export function loadPlanetTexture(kind: TextureKind, w: number, h: number): Promise<THREE.CanvasTexture> {
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
