import * as THREE from "three";

const cache = new Map<string, Promise<THREE.Texture>>();

/** Load an equirectangular albedo once per URL. */
export function loadBodyAlbedo(url: string): Promise<THREE.Texture> {
  let promise = cache.get(url);
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
          cache.delete(url);
          reject(err);
        },
      );
    });
    cache.set(url, promise);
  }
  return promise;
}

/** 1×1 placeholder until the real map arrives. */
export function placeholderAlbedo(rgb: [number, number, number] = [0.55, 0.5, 0.45]): THREE.DataTexture {
  const data = new Uint8Array([
    Math.round(rgb[0] * 255),
    Math.round(rgb[1] * 255),
    Math.round(rgb[2] * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
