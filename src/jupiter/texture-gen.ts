/**
 * Dependency-free pixel generators for the procedural planet maps, shared by the main thread
 * and the texture worker. Each fills RGBA rows [y0, y1) of a w×h equirectangular map.
 */

export type TextureKind = "cloud" | "earth";

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash3(ix: number, iy: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Neighbouring pixels nearly always sample the same lattice cell, so each noise call site keeps
// the 8 corner hashes of the last cell it touched. Values are pure functions of the cell, so
// any slot assignment gives identical output.
const SLOTS = 32;
const cellKey = new Float64Array(SLOTS * 3).fill(Number.NaN);
const cellHash = new Float64Array(SLOTS * 8);

function vnoise3(x: number, y: number, z: number, slot: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const k = slot * 3;
  const c = slot * 8;
  if (cellKey[k] !== xi || cellKey[k + 1] !== yi || cellKey[k + 2] !== zi) {
    cellKey[k] = xi;
    cellKey[k + 1] = yi;
    cellKey[k + 2] = zi;
    cellHash[c] = hash3(xi, yi, zi);
    cellHash[c + 1] = hash3(xi + 1, yi, zi);
    cellHash[c + 2] = hash3(xi, yi + 1, zi);
    cellHash[c + 3] = hash3(xi + 1, yi + 1, zi);
    cellHash[c + 4] = hash3(xi, yi, zi + 1);
    cellHash[c + 5] = hash3(xi + 1, yi, zi + 1);
    cellHash[c + 6] = hash3(xi, yi + 1, zi + 1);
    cellHash[c + 7] = hash3(xi + 1, yi + 1, zi + 1);
  }
  const n000 = cellHash[c]!;
  const n100 = cellHash[c + 1]!;
  const n010 = cellHash[c + 2]!;
  const n110 = cellHash[c + 3]!;
  const n001 = cellHash[c + 4]!;
  const n101 = cellHash[c + 5]!;
  const n011 = cellHash[c + 6]!;
  const n111 = cellHash[c + 7]!;
  const nx00 = n000 + (n100 - n000) * u;
  const nx10 = n010 + (n110 - n010) * u;
  const nx01 = n001 + (n101 - n001) * u;
  const nx11 = n011 + (n111 - n011) * u;
  const nxy0 = nx00 + (nx10 - nx00) * v;
  const nxy1 = nx01 + (nx11 - nx01) * v;
  return nxy0 + (nxy1 - nxy0) * w;
}

function fbm3(x: number, y: number, z: number, octaves: number, slot: number): number {
  let sum = 0;
  let amp = 0.5;
  let fx = x;
  let fy = y;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise3(fx, fy, fz, slot + i) * amp;
    fx = fx * 2.03 + 1.7;
    fy = fy * 2.03 + 9.2;
    fz = fz * 2.03 + 2.4;
    amp *= 0.5;
  }
  return sum;
}

/**
 * Seamless cylindrical noise on (lon, lat): periodic in lon, anisotropic in lat.
 */
function cylFbm(
  lon: number,
  lat: number,
  fLon: number,
  fLat: number,
  seed: number,
  octaves: number,
  slot: number,
): number {
  const cx = Math.cos(lon) * fLon;
  const sz = Math.sin(lon) * fLon;
  const y = lat * fLat;
  return fbm3(cx + seed * 3.1, y + seed * 5.7, sz + seed * 1.9, octaves, slot);
}

function gauss(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

/** Running colour of the pixel being painted (r, g, b). */
const rgb = new Float64Array(3);

function paint(m: number, cr: number, cg: number, cb: number): void {
  const k = Math.min(1, Math.max(0, m));
  rgb[0] = lerp(rgb[0]!, cr, k);
  rgb[1] = lerp(rgb[1]!, cg, k);
  rgb[2] = lerp(rgb[2]!, cb, k);
}

// Great Red Spot center (matches SPOTS[0] in layers.ts: lon = pi/2 - 0.18, lat = -0.36 rad = -20.63°)
const GRS_LON = Math.PI / 2 - 0.18;
const GRS_LAT_DEG = -0.36 * (180 / Math.PI);
// Small bright white ovals along -33° and -40° (classic "String of Pearls" in Hubble image)
const OVAL_LATS = [-33.2, -40.5] as const;
const OVAL_LONS = [-2.1, -1.15, -0.35, 0.42, 1.35, 2.35] as const;

/**
 * Hubble / Cassini OPAL-style natural true-color equirectangular map of Jupiter.
 * Uses domain-warped fluid advection, folded SEB rifts, equatorial blue-grey festoons,
 * warm terracotta/cinnamon NEB, southern white ovals, and warm ochre-tan polar hoods.
 * u = lon / τ + 0.5, North at top (y = 0).
 */
export function fillCloudRows(data: Uint8ClampedArray, w: number, h: number, y0: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    const latDeg0 = lat * (180 / Math.PI);
    const absLat0 = Math.abs(latDeg0);

    // Alternating zonal wind shear profile (jets curve filaments east/west)
    const zonalJet = Math.sin(lat * 15.5) * 0.22 + Math.cos(lat * 7.0) * 0.12 + Math.sin(lat * 28.0) * 0.06;

    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * Math.PI * 2;

      // 1. Two-stage domain warp (curl-like fluid advection)
      const qx = cylFbm(lon + zonalJet * 0.4, lat, 2.6, 10.5, 1.1, 3, 0) - 0.5;
      const qy = cylFbm(lon - zonalJet * 0.3, lat, 3.2, 13.0, 2.7, 3, 3) - 0.5;

      const wLon = lon + qx * 0.42 + zonalJet * 0.28;
      const wLat = lat + qy * 0.055;

      const rx = cylFbm(wLon, wLat, 5.5, 22.0, 4.3, 4, 6) - 0.5;
      const ry = cylFbm(wLon + 0.7, wLat, 6.8, 26.0, 6.1, 4, 10) - 0.5;

      // Fine feathery filamentary shear
      const streak = cylFbm(wLon + rx * 0.28, wLat + ry * 0.02, 2.2, 52.0, 8.4, 3, 14);
      const ribbon = Math.sin((latDeg0 + qy * 5.2 + ry * 3.1) * 1.35 + rx * 3.8) * 0.5 + 0.5;

      // Warped latitude in degrees for soft, natural belt/zone transitions
      const latDeg = latDeg0 + qy * 3.4 + ry * 2.1;

      // Base warm ivory-cream (Hubble Zone reference: R~236, G~227, B~205)
      rgb[0] = 236;
      rgb[1] = 226;
      rgb[2] = 204;

      // --- ZONES & BELTS (calibrated to Hubble true-color palette) ---

      // Equatorial Zone (EZ, -6° to +6°): warm cream with delicate pale ochre & wisps
      const ez = gauss(latDeg, 0.0, 5.8);
      paint(ez * 0.9, 240, 229, 204);
      // Warm central equatorial ochre-cream veil
      paint(gauss(latDeg, -0.8, 3.2) * (0.4 + 0.6 * ribbon), 233, 214, 182);

      // Pale blue-grey equatorial festoons & 5-micron hot spots along NEB south edge (+5° to +8.5°)
      const festBand = gauss(latDeg0, 6.0, 3.2);
      if (festBand > 0.05) {
        const wave = Math.sin(lon * 9.0 + qx * 3.2) * 0.5 + 0.5;
        const plume = smoothstep(0.38, 0.85, wave * 0.65 + (rx + 0.5) * 0.35);
        // Subtle dusty slate-blue tint (Hubble EZ/NEB interface: ~188, 196, 194)
        paint(festBand * plume * 0.68, 182, 192, 192);
        // Sweeping diagonal blue-grey festoon ribbons into the EZ
        const sweep = Math.sin(lon * 9.0 - (latDeg0 - 6.5) * 0.42 + qx * 2.5) * 0.5 + 0.5;
        paint(gauss(latDeg0, 3.2, 3.5) * smoothstep(0.52, 0.9, sweep) * 0.42, 192, 199, 196);
      }

      // North Equatorial Belt (NEB, +7° to +17°): rich terracotta / cinnamon / burnt sienna
      const neb = gauss(latDeg, 11.6, 4.6);
      const nebTex = smoothstep(0.22, 0.78, ribbon * 0.55 + (rx + 0.5) * 0.45);
      paint(neb * 0.92, lerp(206, 182, nebTex), lerp(142, 108, nebTex), lerp(102, 74, nebTex));
      // Deeper rust knots and white convective rifts inside NEB
      const nebRift = gauss(latDeg, 12.2, 2.4) * smoothstep(0.62, 0.86, qx + rx + 0.95);
      paint(nebRift * 0.78, 244, 235, 218);
      const nebDark = gauss(latDeg, 9.6, 2.2) * smoothstep(0.52, 0.84, -qx - rx + 0.85);
      paint(nebDark * 0.65, 162, 92, 62);

      // North Tropical Zone (NTrZ, +18° to +24°): bright crisp white-cream band
      const ntrz = gauss(latDeg, 20.8, 3.6);
      paint(ntrz * 0.92, 242, 236, 222);
      // Subtle cool bluish-ivory streak on southern edge of NTrZ (visible in Hubble photo)
      paint(gauss(latDeg, 18.2, 1.6) * (0.4 + 0.6 * streak), 214, 218, 216);

      // North Temperate Belt (NTB, +25° to +30°): warm tan-cinnamon ribbon with folded waves
      const ntb = gauss(latDeg, 27.5, 2.4);
      paint(ntb * 0.82, 196, 146, 106);

      // North Temperate Zone (NTZ, +31° to +35°): pale cream
      paint(gauss(latDeg, 32.5, 2.2) * 0.75, 234, 224, 202);

      // NNTB & northern ruffled bands (+36° to +46°): intricate folded tan/ochre waves
      const nntb = gauss(latDeg, 38.5, 3.2);
      const nRuffle = Math.sin(lon * 22.0 + qx * 7.0 + ry * 5.0) * 0.5 + 0.5;
      paint(nntb * 0.85, lerp(178, 218, nRuffle), lerp(144, 188, nRuffle), lerp(108, 152, nRuffle));

      // --- SOUTHERN HEMISPHERE (SEB, GRS hollow, turbulent wake, STB white ovals) ---

      // Distance from Great Red Spot
      const dlonGrs = Math.atan2(Math.sin(lon - GRS_LON), Math.cos(lon - GRS_LON));
      const dlatGrs = latDeg0 - GRS_LAT_DEG;
      const grsDist = Math.hypot(dlonGrs / 0.34, dlatGrs / 7.8);

      // South Equatorial Belt (SEB, -8° to -19°): split by bright turbulent folded white rifts
      // East of GRS (dlonGrs > 0): smoother warm terracotta/salmon belt (like right side of Hubble photo)
      // West of GRS (dlonGrs < 0): dramatic swirling white/tan convective clouds (post-GRS wake)
      const sebEnv = gauss(latDeg, -13.8, 4.5) * smoothstep(0.75, 1.35, grsDist);
      const eastMask = smoothstep(-0.15, 0.45, dlonGrs);
      const westWake = (1 - eastMask) * Math.exp(-Math.pow((dlonGrs + 0.85) / 1.15, 2));

      // Base SEB terracotta-salmon
      paint(sebEnv * 0.88, lerp(202, 186, nebTex), lerp(144, 114, nebTex), lerp(106, 78, nebTex));
      // Warm reddish-terracotta wedge just east of GRS (prominent in reference photo)
      const eastWedge = Math.exp(-Math.pow((dlonGrs - 0.52) / 0.48, 2) - Math.pow((latDeg0 + 14.2) / 3.4, 2));
      paint(eastWedge * 0.85, 198, 116, 82);

      // Turbulent folded white/cream rifts west of GRS (-9° to -18°)
      if (westWake > 0.02) {
        const foldPhase = Math.sin(lon * 16.0 + qy * 9.0 + rx * 6.5);
        const foldLoop = smoothstep(-0.1, 0.75, foldPhase);
        const wakeBand = gauss(latDeg0, -13.5, 3.8) * westWake;
        paint(wakeBand * foldLoop * 0.88, 244, 236, 216);
        // Dark gray-brown outlines around the folded white convective eddies
        const foldRim = (1 - Math.abs(foldPhase)) * wakeBand;
        paint(foldRim * 0.55, 154, 124, 98);
      }

      // South Tropical Zone (STrZ, -19° to -25°): bright cream zone curving around the GRS
      const strz = gauss(latDeg, -22.2, 3.6);
      paint(strz * 0.9, 240, 232, 212);

      // South Temperate Belt (STB, -26° to -32°): warm olive-brown & tan belt
      const stb = gauss(latDeg, -28.8, 2.5);
      paint(stb * 0.82, 174, 136, 102);

      // South South Temperate Belt & Zone (-34° to -45°): tan with small white anticyclonic ovals
      paint(gauss(latDeg, -35.0, 2.2) * 0.78, 232, 222, 198);
      const sstb = gauss(latDeg, -40.2, 2.8);
      const sRuffle = Math.sin(lon * 20.0 - qx * 6.5 + ry * 4.5) * 0.5 + 0.5;
      paint(sstb * 0.82, lerp(168, 206, sRuffle), lerp(138, 178, sRuffle), lerp(104, 144, sRuffle));

      for (let oi = 0; oi < OVAL_LONS.length; oi++) {
        const oLon = OVAL_LONS[oi]!;
        const oLat = OVAL_LATS[oi % 2]!;
        const dl = Math.atan2(Math.sin(lon - oLon), Math.cos(lon - oLon));
        const dp = (latDeg0 - oLat) * (Math.PI / 180);
        const oe = Math.hypot(dl / 0.055, dp / 0.032);
        if (oe < 1.35) {
          const core = 1 - smoothstep(0.0, 0.85, oe);
          const collar = smoothstep(0.65, 0.95, oe) * (1 - smoothstep(0.95, 1.35, oe));
          paint(collar * 0.5, 148, 120, 92);
          paint(core * 0.92, 248, 244, 232);
        }
      }

      // --- POLAR HOODS (> 46°): warm ochre-tan / olive-buff shading (matches Hubble reference) ---
      const polarTransition = smoothstep(44, 68, absLat0);
      if (polarTransition > 0) {
        const pEddy = cylFbm(wLon * 1.4, wLat, 6.0, 18.0, 9.2, 4, 17);
        const pFine = cylFbm(lon, lat, 12.0, 32.0, 3.7, 3, 21);
        const mixP = pEddy * 0.65 + pFine * 0.35;
        // Warm caramel-tan / buff-olive polar hood (R~184..206, G~160..180, B~122..142)
        paint(polarTransition * 0.88, lerp(172, 206, mixP), lerp(146, 178, mixP), lerp(110, 138, mixP));

        // High-latitude (>72°) deeper warm umber-slate polar cap with subtle cyclone swirls
        const deepPole = smoothstep(70, 88, absLat0);
        if (deepPole > 0) {
          paint(deepPole * 0.55, lerp(138, 166, pEddy), lerp(118, 142, pEddy), lerp(92, 114, pEddy));
        }
      }

      // Delicate fine-scale zonal brush texture
      const micro = (streak - 0.5) * 14 + (ribbon - 0.5) * 8;

      const i = (y * w + x) * 4;
      data[i] = clampByte(rgb[0]! + micro);
      data[i + 1] = clampByte(rgb[1]! + micro * 0.88);
      data[i + 2] = clampByte(rgb[2]! + micro * 0.72);
      data[i + 3] = 255;
    }
  }
}

type ContinentBlob = [lonDeg: number, latDeg: number, rxDeg: number, ryDeg: number, weight: number, tilt?: number];

// Simplified geographic landmass primitives (lon°, lat°, rx°, ry°, weight, tilt) so continents read recognizably
const CONTINENTS: readonly ContinentBlob[] = [
  // North America
  [-105, 48, 28, 18, 0.85, -0.25],
  [-95, 34, 20, 12, 0.75, -0.15],
  [-88, 18, 10, 8, 0.55, -0.4],
  [-42, 72, 18, 9, 0.8, 0.1], // Greenland
  // South America
  [-62, -12, 16, 16, 0.88, -0.2],
  [-65, -34, 9, 18, 0.8, -0.1],
  // Eurasia
  [12, 48, 22, 12, 0.78, 0.1], // Europe
  [18, 62, 14, 9, 0.7, 0.2], // Scandinavia
  [55, 56, 36, 15, 0.88, 0.05], // Western/Central Russia
  [98, 52, 38, 16, 0.9, -0.08], // Siberia
  [88, 34, 28, 14, 0.92, 0.0], // Tibet / China
  [78, 20, 11, 11, 0.75, 0.0], // India
  [46, 24, 14, 10, 0.78, -0.2], // Arabia
  [104, 14, 10, 10, 0.65, -0.2], // SE Asia
  [138, 36, 6, 8, 0.55, 0.3], // Japan
  // Africa
  [16, 14, 24, 14, 0.9, 0.0], // North Africa / Sahara
  [26, -4, 16, 14, 0.88, 0.0], // Central Africa
  [24, -22, 12, 12, 0.82, 0.0], // Southern Africa
  [47, -19, 4, 7, 0.6, 0.2], // Madagascar
  // Australia & Maritime SE Asia
  [134, -24, 18, 11, 0.88, 0.05],
  [115, -2, 14, 7, 0.52, 0.0], // Indonesia
  [172, -42, 5, 6, 0.55, 0.3], // New Zealand
  // Antarctica
  [0, -82, 180, 12, 0.95, 0.0],
];

/**
 * Equirectangular Earth map.
 * RGB = surface albedo (oceans, continental biomes, deserts, mountain snow, polar ice caps).
 * Alpha channel = land/elevation mask (0 = deep ocean, 0.5 = coast, >0.5 = land elevation)
 * so the shader can drive accurate ocean specular reflection, normal relief, and night city lights.
 */
export function fillEarthRows(data: Uint8ClampedArray, w: number, h: number, y0: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    const latDeg = lat * (180 / Math.PI);
    const absLat = Math.abs(latDeg);
    const cosLat = Math.cos(lat);

    for (let x = 0; x < w; x++) {
      const lon = (x / w - 0.5) * Math.PI * 2;
      const lonDeg = lon * (180 / Math.PI);
      const cx = Math.cos(lon) * cosLat;
      const sy = Math.sin(lat);
      const sz = Math.sin(lon) * cosLat;

      // 3D spherical fractal noise (no pole pinching or seam)
      const n1 = fbm3(cx * 2.4, sy * 2.4, sz * 2.4, 5, 0);
      const n2 = fbm3(cx * 6.5 + 3.1, sy * 6.5, sz * 6.5 + 1.7, 4, 5);
      const n3 = vnoise3(cx * 18.0, sy * 18.0, sz * 18.0, 9);

      // Sum geographic continental envelopes
      let geo = 0;
      for (let c = 0; c < CONTINENTS.length; c++) {
        const blob = CONTINENTS[c]!;
        let dlon = lonDeg - blob[0];
        if (dlon > 180) dlon -= 360;
        else if (dlon < -180) dlon += 360;
        const dlat = latDeg - blob[1];
        const u = (dlon + dlat * (blob[5] ?? 0)) / blob[2];
        const v = dlat / blob[3];
        const d2 = u * u + v * v;
        if (d2 < 3.2) {
          geo = Math.max(geo, blob[4] * Math.exp(-d2 * 1.15));
        }
      }

      // Combine continental shapes with fractal coastline detail
      const rawLand = geo * 0.72 + (n1 - 0.42) * 0.48 + (n2 - 0.5) * 0.22 + (n3 - 0.5) * 0.07;
      const isLand = rawLand > 0.36;

      let r: number;
      let g: number;
      let b: number;
      let alphaMask: number;

      if (isLand) {
        const elev = Math.min(1, (rawLand - 0.36) / 0.42);
        const desertBelt = Math.exp(-Math.pow((absLat - 24) / 11, 2));
        const afroArabia = lonDeg > -18 && lonDeg < 62 && latDeg > 10 && latDeg < 34 ? 0.42 : 0;
        const arid = Math.min(1, smoothstep(0.28, 0.75, desertBelt * 0.75 + (1 - n2) * 0.45 + afroArabia));
        const tropic = Math.exp(-Math.pow(absLat / 13, 2)) * smoothstep(0.35, 0.7, n2);
        const boreal = smoothstep(50, 68, absLat);

        const vegR = lerp(34, 76, elev) * (1 - tropic * 0.25);
        const vegG = lerp(88, 118, elev) * (1 + tropic * 0.12);
        const vegB = lerp(32, 52, elev);

        const desR = lerp(178, 212, n2);
        const desG = lerp(146, 174, n2);
        const desB = lerp(98, 122, n2);

        r = lerp(vegR, desR, arid);
        g = lerp(vegG, desG, arid);
        b = lerp(vegB, desB, arid);

        r = lerp(r, 78, boreal * 0.65);
        g = lerp(g, 88, boreal * 0.55);
        b = lerp(b, 64, boreal * 0.55);

        const ridge = smoothstep(0.58, 0.88, elev + (n2 - 0.5) * 0.35);
        r = lerp(r, 138, ridge * 0.7);
        g = lerp(g, 132, ridge * 0.7);
        b = lerp(b, 126, ridge * 0.7);
        const snowPeak = smoothstep(0.78, 0.95, elev + (n3 - 0.5) * 0.2);
        r = lerp(r, 238, snowPeak * 0.85);
        g = lerp(g, 242, snowPeak * 0.85);
        b = lerp(b, 248, snowPeak * 0.85);

        alphaMask = 132 + Math.round(elev * 123);
      } else {
        const shelf = Math.min(1, Math.max(0, rawLand / 0.36));
        const coastal = Math.pow(shelf, 3.2);
        const deep = 1 - shelf;
        r = lerp(5, 22, shelf) + coastal * 18;
        g = lerp(24, 68, shelf) + coastal * 48;
        b = lerp(64, 128, shelf) + coastal * 38;
        r = lerp(r, 3, deep * 0.45);
        g = lerp(g, 16, deep * 0.4);
        b = lerp(b, 48, deep * 0.35);
        alphaMask = Math.round(shelf * 115);
      }

      const iceEdge = 68 - (n1 - 0.5) * 8;
      const ice = smoothstep(iceEdge, iceEdge + 7, absLat);
      if (ice > 0) {
        r = lerp(r, 238, ice);
        g = lerp(g, 244, ice);
        b = lerp(b, 252, ice);
        alphaMask = Math.max(alphaMask, Math.round(140 + ice * 90));
      }

      const i = (y * w + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = clampByte(alphaMask);
    }
  }
}

export function fillRows(kind: TextureKind, data: Uint8ClampedArray, w: number, h: number, y0: number, y1: number): void {
  if (kind === "cloud") fillCloudRows(data, w, h, y0, y1);
  else fillEarthRows(data, w, h, y0, y1);
}
