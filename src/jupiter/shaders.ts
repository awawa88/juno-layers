import { SPOTS } from "@/jupiter/layers";

const GRS = SPOTS.find((spot) => spot.kind === "grs") ?? SPOTS[0];
const GRS_LON = GRS.lon.toFixed(5);
const GRS_LAT = GRS.lat.toFixed(5);
const GRS_RX = GRS.rx.toFixed(5);
const GRS_RY = GRS.ry.toFixed(5);

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}
// QUALITY 2 = desktop, 1 = tablet, 0 = phone; tier 0 also skips a few secondary noise passes
#ifndef QUALITY
#define QUALITY 2
#endif
// Phones compile with FBM_OCTAVES 4: the 5th octave adds ~3% amplitude for ~20% of the noise cost
#ifndef FBM_OCTAVES
#define FBM_OCTAVES 5
#endif
float fbm(vec3 p) {
  float a = 0.0;
  float w = 0.5;
  for (int i = 0; i < FBM_OCTAVES; i++) {
    a += noise(p) * w;
    p = p * 2.03 + vec3(1.7, 9.2, 2.4);
    w *= 0.5;
  }
  return a;
}
float wrapLon(float a) {
  return atan(sin(a), cos(a));
}
`;

const PRELUDE = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uPeel;
${NOISE}
vec3 shade(vec3 albedo, vec3 emis, vec3 n) {
  vec3 sun = normalize(uSun);
  float ndl = dot(n, sun);
  float wrap = clamp(ndl * 0.62 + 0.38, 0.0, 1.0);
  float night = clamp(-ndl, 0.0, 1.0);
  vec3 col = albedo * (vec3(0.065, 0.06, 0.075) + vec3(1.14, 1.04, 0.94) * wrap) + emis;
  col *= 1.0 - night * night * 0.28;
  return col;
}
void finish(vec3 col, float alpha) {
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform float uDisp;
uniform float uRelief;
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  return mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y);
}
void main() {
  vec3 p = position;
  if (uDisp > 0.001) {
    // Organic 3D breathing & convective boiling of the dilute core surface
    float n = vnoise(position * 3.2 + vec3(uTime * 0.16, -uTime * 0.11, uTime * 0.09));
    float n2 = vnoise(position * 6.1 - vec3(uTime * 0.14, uTime * 0.18, -uTime * 0.12));
    float pulse = 0.08 * sin(uTime * 1.4 + length(position) * 3.0);
    p += normal * ((n * 0.65 + n2 * 0.35 + pulse) - 0.42) * uDisp;
  }
  if (uRelief > 0.001) {
    vec3 d = normalize(position);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float lon = atan(d.z, d.x);
    float deg = abs(lat) * 57.2957795;
    float belts =
      exp(-pow(abs(deg - 11.6) / 4.4, 2.0)) +
      exp(-pow(abs(deg - 28.0) / 3.0, 2.0)) * 0.65 +
      exp(-pow(abs(deg - 39.5) / 2.8, 2.0)) * 0.4;
    // Keep vertex relief very subtle so the limb silhouette remains a crisp astronomical ellipse
    float h = (0.5 - belts) * 0.0032;
    float grsLonNow = ${GRS_LON} - uTime * 0.0045;
    float dlon = atan(sin(lon - grsLonNow), cos(lon - grsLonNow));
    float dlat = lat - ${GRS_LAT};
    float e = length(vec2(dlon / ${GRS_RX}, dlat / ${GRS_RY}));
    float storm = 1.0 - smoothstep(0.15, 1.05, e);
    h += storm * 0.0065;
    p += normalize(position) * h * uRelief;
  }
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vObj = position;
  // World-space normal (inverse-transpose handles the oblate planet scale) so it matches uSun and cameraPosition
  vNrm = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

function spotBlock(): string {
  return SPOTS.map((spot) => {
    const lon = spot.lon.toFixed(5);
    const lat = spot.lat.toFixed(5);
    const rx = spot.rx.toFixed(5);
    const ry = spot.ry.toFixed(5);
    if (spot.kind === "grs") {
      return `
        {
          // Use tighter visual aspect ratio matching Hubble GRS (~0.32x0.165 rad) inside the hit ellipse
          // GRS drifts slowly westward relative to System III and counter-rotates internally
          float spotLon = ${lon} - uTime * 0.0045;
          float dlon = wrapLon(lon - spotLon);
          float dlat = lat - ${lat};
          vec2 q = vec2(dlon / (${rx} * 0.68), dlat / (${ry} * 0.72));
          float e = length(q);
          if (e < 2.2) {
            float ang = atan(q.y, q.x);
            // Differential counter-clockwise angular velocity: faster in the high-velocity collar ring
            float spinRate = mix(0.28, 0.52, smoothstep(0.15, 0.85, e));
            float rotAng = ang + uTime * spinRate * (1.0 - smoothstep(0.95, 1.45, e));
            vec2 qRot = vec2(cos(rotAng), sin(rotAng)) * e;

            // Subtle organic breathing & oscillation of the oval contour
            float wobble = (noise(vec3(cos(ang) * 2.2, sin(ang) * 2.2, uTime * 0.14)) - 0.5) * 0.085;
            float ew = e + wobble;

            // Counter-clockwise anticyclonic spiral filaments inside the GRS
            float spiral = rotAng * 2.0 - pow(max(ew, 0.08), 0.85) * 9.5;
            float sNoise = fbm(vec3(qRot * 3.2, uTime * 0.09));
            float filament = 0.5 + 0.5 * sin(spiral + sNoise * 3.5);
            float fineRing = 0.5 + 0.5 * cos(ew * 18.0 - rotAng + sNoise * 4.0);

            // True-color Hubble GRS palette: deep amber-rust eye, vivid warm orange-ochre annulus,
            // pale salmon inner rim, surrounded by a creamy-white peripheral collar & dark outer lane
            vec3 eyeCol = vec3(0.74, 0.34, 0.14);      // darker warm rust-ochre central eye
            vec3 bodyOrange = vec3(0.86, 0.45, 0.21);  // main vibrant ochre-orange
            vec3 lightOchre = vec3(0.92, 0.60, 0.34);  // lighter golden-salmon swirl bands
            vec3 paleRim = vec3(0.94, 0.84, 0.70);     // pale buff transition
            vec3 collarWhite = vec3(0.95, 0.92, 0.85); // bright white-cream Red Spot Hollow
            vec3 darkFrame = vec3(0.60, 0.47, 0.36);   // warm gray-brown outer shear lane

            float eyeMask = 1.0 - smoothstep(0.0, 0.34, ew);
            float ringMask = smoothstep(0.22, 0.55, ew) * (1.0 - smoothstep(0.68, 0.92, ew));

            vec3 grs = mix(bodyOrange, lightOchre, filament * 0.65 + fineRing * 0.25);
            grs = mix(grs, eyeCol, eyeMask * 0.78);
            grs = mix(grs, bodyOrange * 0.88, ringMask * (1.0 - filament) * 0.45);
            grs = mix(grs, paleRim, smoothstep(0.76, 0.96, ew));

            // Peripheral white collar (Red Spot Hollow) and subtle dark outer shear rim
            float vortexDisc = 1.0 - smoothstep(0.86, 1.04, ew);
            float whiteCollar = smoothstep(0.84, 1.02, ew) * (1.0 - smoothstep(1.12, 1.48, ew));
            // Arching dark gray-brown eyebrow over the northern/southern edge of the hollow
            float frameLane = smoothstep(1.18, 1.42, ew) * (1.0 - smoothstep(1.48, 1.85, ew));

            albedo = mix(albedo, darkFrame, frameLane * 0.62);
            albedo = mix(albedo, collarWhite, whiteCollar * 0.88);
            albedo = mix(albedo, grs, vortexDisc);

            stormH = vortexDisc;
            stormQ = qRot;
            stormE = ew;
          }
        }
      `;
    }
    if (spot.kind === "oval") {
      return `
        {
          // Oval BA / southern white anticyclone drifting eastward in the STB jet
          float spotLon = ${lon} + uTime * 0.008;
          float dlon = wrapLon(lon - spotLon);
          float dlat = lat - ${lat};
          vec2 q = vec2(dlon / (${rx} * 0.75), dlat / (${ry} * 0.75));
          float e = length(q);
          if (e < 1.5) {
            float ang = atan(q.y, q.x);
            float swirl = 0.5 + 0.5 * sin(ang * 2.0 - e * 6.5 + uTime * 0.55);
            vec3 coreCol = mix(vec3(0.92, 0.89, 0.82), vec3(0.97, 0.95, 0.90), swirl);
            vec3 rimCol = vec3(0.62, 0.50, 0.39);
            float collar = smoothstep(0.72, 0.96, e) * (1.0 - smoothstep(0.98, 1.35, e));
            float disc = 1.0 - smoothstep(0.68, 0.98, e);
            albedo = mix(albedo, rimCol, collar * 0.65);
            albedo = mix(albedo, coreCol, disc * 0.94);
          }
        }
      `;
    }
    return `
      {
        // Northern anticyclonic oval / barge feature with live rotation
        float spotLon = ${lon} - uTime * 0.006;
        float dlon = wrapLon(lon - spotLon);
        float dlat = lat - ${lat};
        vec2 q = vec2(dlon / (${rx} * 0.78), dlat / (${ry} * 0.78));
        float e = length(q);
        if (e < 1.4) {
          float arm = 0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 - e * 6.0 - uTime * 0.48);
          vec3 stormCol = mix(vec3(0.76, 0.56, 0.40), vec3(0.92, 0.84, 0.72), arm);
          float m = 1.0 - smoothstep(0.45, 1.02, e);
          albedo = mix(albedo, stormCol, m * 0.85);
        }
      }
    `;
  }).join("\n");
}

export const CLOUD_FRAG = /* glsl */ `
${PRELUDE}
uniform sampler2D uMap;

float gauss(float x, float c, float w) {
  float d = (x - c) / w;
  return exp(-d * d);
}

// Cylindrical domain-warped fBm for seamless fluid cloud detail
float cylNoise(float lon, float lat, float fLon, float fLat, float seed) {
  return fbm(vec3(cos(lon) * fLon + seed, sin(lon) * fLon + seed * 0.7, lat * fLat));
}

float cloudRelief(float lon, float lat) {
  float deg = lat * 57.2957795;
  float belts =
    gauss(deg, 11.6, 4.6) + gauss(deg, -13.8, 4.5) +
    gauss(deg, 27.5, 2.5) * 0.6 + gauss(deg, -28.8, 2.5) * 0.6;
  float streaks = noise(vec3(cos(lon) * 2.4, sin(lon) * 2.4, lat * 48.0 + 1.2));
  return -belts * 0.35 + (streaks - 0.5) * 0.14;
}

void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float deg = lat * 57.2957795;

  // Authentic alternating East-West zonal wind jets:
  // Prograde (eastward) equatorial super-rotation, retrograde (westward) NEB/SEB jets,
  // and alternating temperate jets so adjacent bands visibly shear past one another!
  float eqJet = exp(-pow(deg / 7.5, 2.0)) * 0.022;
  float beltRetro = -(exp(-pow((deg - 13.0) / 4.2, 2.0)) + exp(-pow((deg + 14.5) / 4.2, 2.0))) * 0.016;
  float tempJets = sin(lat * 15.5) * 0.012 + cos(lat * 26.0) * 0.007;
  float baseSpin = 0.014;
  float flow = lon + (baseSpin + eqJet + beltRetro + tempJets) * uTime + sin(lat * 15.5) * 0.03;

  // Multi-scale curl-like domain warp in shader with live time evolution for boiling eddies
  float warpA = cylNoise(flow + uTime * 0.008, lat, 2.2, 16.0, 1.3 + uTime * 0.015) - 0.5;
  float warpB = cylNoise(flow - uTime * 0.012 + warpA * 0.28, lat + warpA * 0.022, 4.8, 38.0, 4.7) - 0.5;
#if QUALITY > 0
  float fineShear = cylNoise(flow + warpB * 0.22 + uTime * 0.018, lat, 9.5, 76.0, 8.2) - 0.5;
#else
  float fineShear = (noise(vec3(cos(flow) * 9.5, sin(flow) * 9.5, lat * 76.0 + warpB)) - 0.5) * 0.6;
#endif

  // Keep the base texture moving smoothly with the planet's spin while dynamic shear waves ripple across the bands
  float baseLon = lon + baseSpin * uTime + (eqJet + beltRetro + tempJets) * sin(uTime * 0.35) * 1.4;
  float u = (baseLon + warpA * 0.022 + warpB * 0.011) / 6.28318530718 + 0.5;
  float v = clamp(lat / 3.14159265359 + 0.5 + warpA * 0.0042 + warpB * 0.0018, 0.002, 0.998);
  float dux = dFdx(u);
  float duy = dFdy(u);
  dux -= floor(dux + 0.5);
  duy -= floor(duy + 0.5);
  vec3 tex = textureGrad(uMap, vec2(u, v), vec2(dux, dFdx(v)), vec2(duy, dFdy(v))).rgb;

  // Delicately modulate with high-frequency feathery filaments (no harsh contrast)
  vec3 albedo = tex * (1.0 + fineShear * 0.08 + warpB * 0.05);

  // Subtle folded convective chevrons in the SEB turbulent wake and NEB rifts that churn over time
  float sebFold = gauss(deg, -13.5, 3.6) * smoothstep(0.16, 0.46, warpA + warpB + 0.5);
  albedo = mix(albedo, vec3(0.93, 0.89, 0.80), sebFold * 0.24);

  float stormH = 0.0;
  vec2 stormQ = vec2(0.0);
  float stormE = 2.0;
  ${spotBlock()}

  // Subtle cloud-top normal relief (kept gentle so it looks like soft ammonia haze, not plastic)
  float base0 = cloudRelief(baseLon, lat) + fineShear * 0.08;
  float eps = 0.01;
  float hx = cloudRelief(baseLon + eps, lat) - base0;
  float hy = cloudRelief(baseLon, lat + eps) - base0;
  vec3 axis = abs(dir.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(axis, dir));
  vec3 north = normalize(cross(dir, east));
  vec3 n = normalize(vNrm);

  if (gl_FrontFacing) {
    float bump = 0.72;
    if (stormE < 1.25) {
      float armSlope = sin(atan(stormQ.y, stormQ.x) * 2.0 - log(max(stormE, 0.06)) * 3.2);
      hx += armSlope * 0.025 * (1.0 - smoothstep(0.2, 1.05, stormE));
      hy += cos(atan(stormQ.y, stormQ.x) * 2.0) * 0.018 * (1.0 - smoothstep(0.2, 1.0, stormE));
      bump = 0.65;
    }
    n = normalize(n - east * hx * bump - north * hy * bump);

    vec3 view = normalize(cameraPosition - vWorld);
    vec3 sun = normalize(uSun);
    vec3 geomN = normalize(vNrm);

    // View cosine (mu) and illumination cosine (mu0) for authentic Minnaert/Hubble limb darkening
    float mu = clamp(dot(geomN, view), 0.0, 1.0);
    float mu0 = clamp(dot(n, sun) * 0.7 + 0.3, 0.0, 1.0);

    // Near-opposition (Earth/Hubble) illumination: mu0 ~ mu, so the combined Minnaert falloff is
    // mu0^0.75 * mu^0.38 -- soft limb darkening that dims the edge without a wide black band
    float limbDark = pow(mu, 0.38) * smoothstep(0.0, 0.07, mu);
    float terminator = pow(mu0, 0.75);

    // Slight atmospheric Rayleigh/haze tint shift toward dusty warm-slate at low view angles
    vec3 limbTint = mix(vec3(0.76, 0.73, 0.68), vec3(1.0), pow(mu, 0.45));
    vec3 col = albedo * limbTint * (0.025 + 1.06 * terminator) * limbDark;

    // Occasional Juno-observed lightning flashes deep inside cyclonic belts (NEB ~ +12°, SEB ~ -14°)
    float beltZone = gauss(deg, 12.0, 3.0) + gauss(deg, -14.0, 3.0);
    if (beltZone > 0.15) {
      vec2 cellId = floor(vec2(baseLon * 4.5, lat * 18.0));
      float cellSeed = hash13(vec3(cellId, 7.3));
      float flashPhase = fract(uTime * (0.45 + cellSeed * 0.35) + cellSeed * 13.7);
      float bolt = exp(-pow((flashPhase - 0.08) / 0.018, 2.0)) * smoothstep(0.72, 0.98, cellSeed);
      if (bolt > 0.01) {
        vec2 cellUv = fract(vec2(baseLon * 4.5, lat * 18.0)) - 0.5;
        float spotGlow = exp(-dot(cellUv, cellUv) * 18.0);
        col += vec3(0.55, 0.78, 1.0) * bolt * spotGlow * beltZone * limbDark * 0.55;
      }
    }

    finish(col, uOpacity);
  } else {
    // Interior cutaway wall when the cloud deck is peeled open:
    // Shows stratified atmospheric cross-section (ammonia ice -> NH4SH -> deep water clouds)
    n = -n;
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    float depthBand = 0.5 + 0.5 * sin(lat * 28.0 + fineShear * 4.0);
    vec3 upperDeck = vec3(0.72, 0.56, 0.42);
    vec3 lowerDeck = vec3(0.42, 0.25, 0.16);
    vec3 innerCol = mix(lowerDeck, upperDeck, smoothstep(0.2, 0.85, rim) * 0.65 + depthBand * 0.25);
    innerCol = shade(innerCol, vec3(0.03, 0.015, 0.008), n);
    finish(innerCol, uOpacity);
  }
}
`;

export const GAS_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);

  // Juno gravity harmonics revealed zonal jets extending ~3,000 km deep into molecular H2
  float jetProfile = sin(lat * 15.0) * 0.45 + cos(lat * 8.0) * 0.25;
  float flow = lon + jetProfile * (0.14 + 0.04 * sin(uTime * 0.4)) + uTime * 0.045;

  // Seamless cylindrical domain-warped fluid bands + rising thermal plumes + helium rain droplets
  float w1 = fbm(vec3(cos(flow) * 1.8, sin(flow) * 1.8, lat * 5.2 + uTime * 0.06)) - 0.5;
  float w2 = fbm(vec3(cos(flow + w1 * 0.45) * 3.6, sin(flow + w1 * 0.45) * 3.6, lat * 12.0 - uTime * 0.09)) - 0.5;
  float plume = fbm(vec3(cos(flow) * 6.5 + w2, sin(flow) * 6.5, lat * 22.0 - uTime * 0.14));
  // Downward-drifting helium rain streaks near the base of the molecular envelope
  float heRain = smoothstep(0.62, 0.88, noise(vec3(cos(lon) * 14.0, sin(lon) * 14.0, lat * 32.0 + uTime * 0.35)));

  // Warm amber-champagne to deep golden-ochre gradient (dense supercritical H2/He fluid)
  vec3 highZone = vec3(0.84, 0.72, 0.54);
  vec3 midAmber = vec3(0.66, 0.50, 0.34);
  vec3 deepOchre = vec3(0.44, 0.30, 0.20);
  vec3 warmGlow = vec3(0.82, 0.52, 0.26);

  float band = 0.5 + 0.5 * sin(lat * 16.0 + w1 * 2.8 + w2 * 1.4);
  vec3 albedo = mix(deepOchre, highZone, band * 0.72 + (w1 + 0.5) * 0.28);
  albedo = mix(albedo, midAmber, smoothstep(0.3, 0.75, plume) * 0.5);
  albedo = mix(albedo, warmGlow, smoothstep(0.62, 0.9, plume) * 0.3);
  albedo += vec3(0.14, 0.11, 0.07) * heRain * 0.45;

  // Gentle normal perturbation from deep convective rolls
  vec3 axis = abs(dir.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(axis, dir));
  vec3 north = normalize(cross(dir, east));
  vec3 nrm = normalize(vNrm);

  if (gl_FrontFacing) {
    nrm = normalize(nrm + east * w2 * 0.12 + north * (band - 0.5) * 0.14);
    vec3 view = normalize(cameraPosition - vWorld);
    float mu = clamp(dot(normalize(vNrm), view), 0.0, 1.0);
    // Subsurface scattering & warm atmospheric limb falloff
    float limb = pow(mu, 0.58) * smoothstep(0.0, 0.12, mu);
    vec3 col = shade(albedo, vec3(0.04, 0.022, 0.01), nrm) * (0.22 + 0.78 * limb);
    float sss = pow(1.0 - mu, 2.6) * smoothstep(0.0, 0.35, mu);
    col += vec3(0.55, 0.36, 0.18) * sss * 0.28;
    finish(col, uOpacity);
  } else {
    // Cutaway interior face: radial pressure transition toward metallic hydrogen
    nrm = -nrm;
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = 1.0 - clamp(dot(nrm, view), 0.0, 1.0);
    vec3 inner = mix(vec3(0.58, 0.30, 0.14), vec3(0.76, 0.58, 0.38), smoothstep(0.15, 0.85, rim));
    vec3 col = shade(inner, vec3(0.08, 0.035, 0.012), nrm);
    finish(col, uOpacity);
  }
}
`;

export const METAL_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  vec3 p = vObj * 2.25;

  // Magnetohydrodynamic (MHD) helical convection columns aligned with Jupiter's rapid 9.9h spin axis
  // (Taylor columns + differential rotation shear that drives the planetary dynamo)
  float cylR = length(dir.xz);
  float taylorWave = sin(lon * 14.0 + dir.y * 8.0 + uTime * 0.32) * cylR;
  vec3 q = vec3(
    fbm(p + vec3(uTime * 0.14, taylorWave * 0.42, -uTime * 0.10)),
    fbm(p + vec3(3.2, uTime * 0.12, 1.4)),
#if QUALITY > 0
    fbm(p + vec3(1.1, 4.5, uTime * 0.13))
#else
    noise(p * 1.7 + vec3(1.1, 4.5, uTime * 0.13))
#endif
  );
  // Domain-warped ridge turbulence for sharp electric/conductive convection cells
  float conv = fbm(p * 1.9 + q * 1.65);
  float fine = fbm(p * 4.4 - q * 1.35 + vec3(0.0, uTime * 0.22, 0.0));
  float ridge = 1.0 - abs(fine * 2.0 - 1.0);
  ridge = pow(clamp(ridge, 0.0, 1.0), 2.4);

  // Travelling MHD dynamo current pulses surging along the conductive veins
  float arcPulse = pow(0.5 + 0.5 * sin(lon * 6.0 - lat * 9.0 - uTime * 1.85 + conv * 6.0), 6.0);

  // Zonal dynamo shear bands + Juno's northern magnetic flux patch (Great Blue Spot region)
  float zonalShear = 0.5 + 0.5 * sin(lat * 18.0 + (conv - 0.5) * 5.2 - uTime * 0.25);
  float northFlux = smoothstep(-0.05, 0.72, dir.y) * smoothstep(0.42, 0.80, conv);
  float cell = smoothstep(0.28, 0.74, conv * 0.65 + zonalShear * 0.35);
  float hotVein = smoothstep(0.52, 0.88, ridge * 0.65 + conv * 0.35);

  // Liquid metallic hydrogen palette: dark conductive bronze-slate, burnished copper,
  // incandescent amber-gold convection upwelling, and subtle ionized cyan-white dynamo arcs
  vec3 darkMetal = vec3(0.18, 0.07, 0.045);
  vec3 burnishedCopper = vec3(0.68, 0.28, 0.11);
  vec3 moltenAmber = vec3(0.98, 0.52, 0.20);
  vec3 ionizedGold = vec3(1.18, 0.84, 0.52);
  vec3 dynamoArc = vec3(0.62, 0.84, 1.0);

  vec3 albedo = mix(darkMetal, burnishedCopper, cell);
  albedo = mix(albedo, moltenAmber, hotVein * 0.82);
  albedo = mix(albedo, ionizedGold, pow(hotVein, 2.4) * (0.55 + 0.35 * arcPulse));
  albedo = mix(albedo, dynamoArc, (northFlux + arcPulse * 0.45) * pow(ridge, 2.0) * 0.32);

  vec3 emis = mix(vec3(0.07, 0.02, 0.01), vec3(0.48, 0.18, 0.05), cell);
  emis += vec3(0.68, 0.36, 0.12) * pow(hotVein, 1.5) * (0.9 + 0.35 * arcPulse);
  emis += vec3(0.22, 0.42, 0.68) * (northFlux * 0.7 + arcPulse * 0.5) * pow(ridge, 1.8) * 0.65;

  // High-frequency normal relief along convection cell boundaries for true liquid-metal specular sheen
  vec3 axis = abs(dir.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(axis, dir));
  vec3 north = normalize(cross(dir, east));
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);

  if (gl_FrontFacing) {
    float dEast = (q.x - 0.5) * 0.45 + (ridge - 0.5) * 0.25;
    float dNorth = (q.y - 0.5) * 0.45 + (zonalShear - 0.5) * 0.25;
    n = normalize(n + east * dEast + north * dNorth);

    vec3 col = shade(albedo, emis, n);
    // Dual-lobe metallic BRDF highlight (sharp chrome-gold glint + broad copper sheen)
    vec3 halfV = normalize(normalize(uSun) + view);
    float ndh = clamp(dot(n, halfV), 0.0, 1.0);
    float specSharp = pow(ndh, 52.0);
    float specBroad = pow(ndh, 10.0);
    col += specSharp * vec3(1.0, 0.88, 0.68) * 0.34 + specBroad * vec3(0.90, 0.46, 0.20) * 0.07;

    float mu = clamp(dot(normalize(vNrm), view), 0.0, 1.0);
    float fres = pow(1.0 - mu, 2.6);
    col += mix(vec3(0.88, 0.42, 0.16), vec3(0.55, 0.78, 0.96), northFlux) * fres * 0.28;
    // Realistic spherical limb darkening
    col *= 0.22 + 0.78 * pow(mu, 0.52);
    finish(col, uOpacity);
  } else {
    n = -n;
    vec3 col = shade(albedo * 0.85, emis * 1.15, n);
    finish(col, uOpacity);
  }
}
`;

export const FUZZY_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  // Juno's dilute ("fuzzy") core: heavy elements (rock, metal, volatiles) dissolved & mixed
  // into metallic hydrogen across ~0.5 Rj with swirling compositional plumes and a soft outer gradient
  vec3 p = vObj * 2.9;
  vec3 warp = vec3(
    fbm(p + vec3(uTime * 0.075, 0.0, -uTime * 0.04)),
    fbm(p + vec3(2.4, -uTime * 0.065, 1.7)),
#if QUALITY > 0
    fbm(p + vec3(0.8, 3.1, uTime * 0.07))
#else
    noise(p * 1.7 + vec3(0.8, 3.1, uTime * 0.07))
#endif
  );
  float n1 = fbm(p * 1.6 + warp * 1.4);
  float n2 = fbm(p * 3.4 - warp * 1.1 + vec3(0.0, uTime * 0.05, 0.0));
#if QUALITY > 0
  float n3 = fbm(p * 7.2 + vec3(n2 * 1.3));
#else
  float n3 = noise(p * 7.2 + vec3(n2 * 1.3));
#endif
  float vein = 1.0 - abs(n2 * 2.0 - 1.0);
  // Radially rising heavy-element dissolution waves
  float plumeWave = 0.5 + 0.5 * sin(length(vObj) * 14.0 - uTime * 0.85 + n1 * 5.0);

  // Heavy-element compositional clouds: dark refractory silicate/iron, high-pressure volatile ices,
  // warm metallic-hydrogen matrix, and incandescent deep-core upwelling
  vec3 darkSilicate = vec3(0.28, 0.20, 0.17);
  vec3 ironRich = vec3(0.52, 0.43, 0.38);
  vec3 volatileIce = vec3(0.58, 0.72, 0.78);
  vec3 metalMatrix = vec3(0.82, 0.46, 0.24);
  vec3 coreIncand = vec3(1.06, 0.70, 0.38);

  vec3 albedo = mix(darkSilicate, ironRich, smoothstep(0.28, 0.68, n1));
  albedo = mix(albedo, volatileIce, smoothstep(0.45, 0.78, n2) * 0.62);
  albedo = mix(albedo, metalMatrix, (pow(vein, 2.0) * 0.55 + plumeWave * 0.2));

  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(abs(dot(n, view)), 0.0, 1.0);

  // Perturb normals with 3D compositional gradient for rich internal 3D relief
  vec3 grad = warp - vec3(0.5);
  n = normalize(n + (grad - n * dot(n, grad)) * 0.35);

  // Deep radial optical depth: hotter & denser toward the center, dissolving into mist at the boundary
  float coreDepth = pow(mu, 0.9);
  albedo = mix(albedo, coreIncand, pow(mu, 2.0) * (0.35 + 0.35 * n3));

  vec3 emis = mix(vec3(0.05, 0.025, 0.015), vec3(0.36, 0.17, 0.08), coreDepth * (0.45 + 0.35 * vein + 0.2 * plumeWave));
  vec3 col = shade(albedo, emis, n);

  // Soft, billowy, non-uniform outer boundary so it clearly reads as a "fuzzy" core with no sharp shell edge
  float turbEdge = 0.68 + 0.32 * (n1 * 0.55 + n3 * 0.45);
  float alpha = smoothstep(0.05, 0.62, mu * turbEdge) * 0.94;
  finish(col, alpha * uOpacity);
}
`;

export const HAZE_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  // Outer compositional gradient envelope around the dilute core
  vec3 dir = normalize(vObj);
  float n = fbm(dir * 3.4 + vec3(uTime * 0.065, -uTime * 0.045, 0.8));
  float n2 = fbm(dir * 6.8 + vec3(n * 1.3, 1.9 + uTime * 0.05, 0.0));
  float density = n * 0.62 + n2 * 0.38;

  vec3 nrm = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(abs(dot(nrm, view)), 0.0, 1.0);

  // Soft cloudy envelope fading smoothly at the outer edge and blending over the core
  float radialFade = smoothstep(0.06, 0.52, mu) * (1.0 - smoothstep(0.62, 0.96, mu) * 0.5);
  float mask = smoothstep(0.32, 0.74, density) * radialFade;
  if (mask < 0.015) discard;

  vec3 warmDust = vec3(0.68, 0.42, 0.26);
  vec3 coolSilicate = vec3(0.52, 0.56, 0.60);
  vec3 col = shade(mix(warmDust, coolSilicate, n2), vec3(0.06, 0.03, 0.015), nrm);
  finish(col, mask * 0.36 * uOpacity);
}
`;

export const NUCLEUS_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  // Hypothetical denser central seed (<= 0.15 Rj): high-pressure refractory rock, iron & ices
  // partially dissolving into the surrounding dilute core (detailed 3D fissures + blurred rim)
  vec3 p = vObj * 9.5;
  vec3 q = vec3(
    fbm(p + vec3(uTime * 0.09, 1.1, 0.0)),
    fbm(p + vec3(0.0, uTime * 0.075, 2.7)),
#if QUALITY > 0
    fbm(p + vec3(3.4, 0.5, -uTime * 0.085))
#else
    noise(p * 1.7 + vec3(3.4, 0.5, -uTime * 0.085))
#endif
  );
  float m1 = fbm(p * 1.4 + q * 1.5);
  float m2 = fbm(p * 3.2 - q * 1.2);
  float fissure = pow(clamp(1.0 - abs(m2 * 2.0 - 1.0), 0.0, 1.0), 3.0);
  float heartbeat = 0.82 + 0.32 * (0.5 + 0.5 * sin(uTime * 2.1 + m1 * 4.0));

  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(n, view), 0.0, 1.0);
  float fres = 1.0 - mu;

  // Perturb normal for rocky/metallic relief in the central knot
  vec3 grad = q - vec3(0.5);
  n = normalize(n + (grad - n * dot(n, grad)) * 0.42);

  vec3 darkRefractory = vec3(0.30, 0.21, 0.17);
  vec3 denseIron = vec3(0.58, 0.46, 0.38);
  vec3 incandescentFissure = vec3(1.16, 0.68, 0.34);
  vec3 dissolvingHalo = vec3(0.64, 0.48, 0.36);

  vec3 albedo = mix(darkRefractory, denseIron, smoothstep(0.28, 0.72, m1));
  albedo = mix(albedo, incandescentFissure, fissure * 0.78 * heartbeat);
  albedo = mix(albedo, dissolvingHalo, smoothstep(0.45, 0.92, fres) * 0.65);

  vec3 emis = vec3(0.14, 0.055, 0.02) * m1 + vec3(0.74, 0.34, 0.11) * fissure * heartbeat * (0.4 + 0.6 * mu);
  vec3 col = shade(albedo, emis, n);

  // Specular glint on metallic inclusions
  vec3 halfV = normalize(normalize(uSun) + view);
  float spec = pow(clamp(dot(n, halfV), 0.0, 1.0), 32.0);
  col += spec * vec3(1.0, 0.85, 0.65) * m1 * 0.2;

  // Softly blurred outer boundary (hypothesis of a partially dissolved central seed)
  float edgeNoise = 0.76 + 0.24 * m1;
  float alpha = smoothstep(0.03, 0.46, mu * edgeNoise) * 0.96;
  finish(col, alpha * uOpacity);
}
`;

export const EARTH_FRAG = /* glsl */ `
${PRELUDE}
uniform sampler2D uMap;
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  // Earth mesh rotates in 3D around its tilted axis; keep texture locked to mesh coordinates
  float u = lon / 6.28318530718 + 0.5;
  float v = clamp(lat / 3.14159265359 + 0.5, 0.002, 0.998);

  // Wrap-safe gradients so Earth has zero seam artifact
  float dux = dFdx(u);
  float duy = dFdy(u);
  dux -= floor(dux + 0.5);
  duy -= floor(duy + 0.5);
  vec4 samp = textureGrad(uMap, vec2(u, v), vec2(dux, dFdx(v)), vec2(duy, dFdy(v)));
  vec3 surface = samp.rgb;
  // Alpha = land/ocean mask from Blue Marble bake (<~0.48 ocean, >~0.52 land).
  // Opaque JPEG fallback: blue-dominant RGB → ocean (keeps specular + city lights).
  float landFromAlpha = smoothstep(0.46, 0.54, samp.a);
  float oceanFromRgb = smoothstep(0.02, 0.10, samp.b - max(samp.r, samp.g));
  float landMask = mix(1.0 - oceanFromRgb, landFromAlpha, step(0.0, 0.995 - samp.a));
  float oceanMask = 1.0 - landMask;

  // Dynamic 3D procedural weather systems drifting and evolving over the rotating globe
  float cLon = lon + uTime * 0.032;
  vec3 cPos = vec3(cos(cLon) * cos(lat), sin(lat), sin(cLon) * cos(lat));
  float w = fbm(cPos * 3.4 + vec3(1.2, uTime * 0.025, 2.8));
  float c1 = fbm(cPos * 5.2 + vec3(w * 1.4, uTime * 0.04, -1.3));
#if QUALITY > 0
  float c2 = fbm(cPos * 11.0 - vec3(0.7, w * 1.1, 2.1));
#else
  float c2 = noise(cPos * 11.0 - vec3(0.7, w * 1.1, 2.1));
#endif
  // Mid-latitude cyclone bands & ITCZ equatorial cloud belt
  float itcz = exp(-pow(lat / 0.18, 2.0)) * 0.15;
  float stormTrack = exp(-pow((abs(lat) - 0.82) / 0.32, 2.0)) * 0.14;
  float cloud = smoothstep(0.44 - itcz - stormTrack, 0.74, c1 * 0.68 + c2 * 0.32);

  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float ndl = dot(n, sun);
  float mu = clamp(dot(n, view), 0.0, 1.0);

  // Crisp yet smooth day/twilight/night transition
  float day = smoothstep(-0.14, 0.24, ndl);
  float twilight = smoothstep(-0.22, 0.06, ndl) * (1.0 - smoothstep(0.02, 0.30, ndl));
  float night = 1.0 - smoothstep(-0.08, 0.16, ndl);

  // Cloud shadow slightly darkens surface before blending bright white cloud tops
  vec3 albedo = surface * (1.0 - cloud * 0.22);
  albedo = mix(albedo, vec3(0.96, 0.97, 0.99), cloud * 0.88);

  // Ocean sun glint (blocked by thick clouds)
  vec3 halfV = normalize(sun + view);
  float specBroad = pow(clamp(dot(n, halfV), 0.0, 1.0), 28.0);
  float specSharp = pow(clamp(dot(n, halfV), 0.0, 1.0), 96.0);
  float glint = (specBroad * 0.35 + specSharp * 0.65) * oceanMask * (1.0 - cloud * 0.85) * day;

  // Warm city light clusters on the night side over populated mid/low-latitude land
  float popLat = smoothstep(1.15, 0.75, abs(lat));
#if QUALITY > 0
  float cityNoise = smoothstep(0.56, 0.78, fbm(dir * 14.0));
#else
  float cityNoise = smoothstep(0.56, 0.78, noise(dir * 14.0) * 0.6 + noise(dir * 29.0) * 0.4);
#endif
  float cities = night * landMask * popLat * cityNoise * (1.0 - cloud * 0.7) * 0.45;

  // Day illumination + Rayleigh atmospheric limb scattering + golden-orange sunset terminator
  float limbDark = pow(mu, 0.42);
  vec3 lit = albedo * (vec3(0.03, 0.038, 0.055) + vec3(1.16, 1.12, 1.04) * day * limbDark);
  lit += vec3(0.85, 0.42, 0.18) * twilight * (0.18 + 0.25 * cloud);
  lit += vec3(1.0, 0.95, 0.86) * glint * 0.28;
  lit += vec3(1.0, 0.74, 0.38) * cities;

  // Thin blue Rayleigh atmosphere halo at the limb
  float fres = pow(1.0 - mu, 3.2);
  lit += vec3(0.28, 0.56, 0.98) * fres * (0.22 + 0.68 * day);

  finish(lit, 1.0);
}
`;

export const GLOW_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSun;
uniform float uOpacity;
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  // Back-side shell: visible fragments are the far hemisphere, whose outward normal faces away from the viewer
  float ndv = clamp(abs(dot(n, view)), 0.0, 1.0);
  // Ultra-subtle, tight stratospheric haze whisper on the sunlit limb only
  // (keeps the crisp, dark-edge Hubble/Cassini photographic look without neon halo)
  float fres = pow(1.0 - ndv, 6.5) * smoothstep(0.0, 0.25, ndv);
  float sunlit = smoothstep(-0.5, 0.2, dot(n, sun));
  float rim = fres * sunlit * uOpacity;
  vec3 col = vec3(0.84, 0.76, 0.64);
  gl_FragColor = vec4(col, rim * 0.18);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
