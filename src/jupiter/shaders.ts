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
float fbm(vec3 p) {
  float a = 0.0;
  float w = 0.5;
  for (int i = 0; i < 5; i++) {
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
uniform float uAccent;
${NOISE}
vec3 shade(vec3 albedo, vec3 emis, vec3 n) {
  vec3 sun = normalize(uSun);
  vec3 fill = normalize(vec3(-0.55, 0.25, -0.35));
  float ndl = dot(n, sun);
  float wrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
  float fillLit = clamp(dot(n, fill) * 0.5 + 0.5, 0.0, 1.0);
  float night = clamp(-ndl, 0.0, 1.0);
  // Soft key + cool fill + slight warm ambient — less flat/toy-like
  vec3 ambient = vec3(0.055, 0.05, 0.065);
  vec3 key = vec3(1.28, 1.12, 0.94) * wrap;
  vec3 fillCol = vec3(0.18, 0.22, 0.32) * fillLit;
  vec3 col = albedo * (ambient + key + fillCol) + emis;
  col *= 1.0 - night * night * 0.28;
  // Accent for hover / selected layer (rim-ish boost)
  col += albedo * uAccent * 0.22 + vec3(1.0, 0.72, 0.42) * uAccent * 0.12;
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
    float n = vnoise(position * 3.2 + vec3(uTime * 0.04));
    float n2 = vnoise(position * 6.1 - vec3(uTime * 0.03));
    p += normal * ((n * 0.65 + n2 * 0.35) - 0.42) * uDisp;
  }
  if (uRelief > 0.001) {
    vec3 d = normalize(position);
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float lon = atan(d.z, d.x);
    float deg = abs(lat) * 57.2957795;
    float belts =
      exp(-pow(abs(deg - 12.0) / 4.4, 2.0)) +
      exp(-pow(abs(deg - 29.0) / 3.4, 2.0)) * 0.65 +
      exp(-pow(abs(deg - 43.0) / 3.0, 2.0)) * 0.4;
    float h = (0.55 - belts) * 0.014;
    h += (vnoise(vec3(lon * 4.0, lat * 10.0, 2.0)) - 0.5) * 0.01;
    float dlon = atan(sin(lon - ${GRS_LON}), cos(lon - ${GRS_LON}));
    float dlat = lat - ${GRS_LAT};
    float e = length(vec2(dlon / ${GRS_RX}, dlat / ${GRS_RY}));
    float storm = 1.0 - smoothstep(0.15, 1.05, e);
    h += storm * 0.072;
    p += normalize(position) * h * uRelief;
  }
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vObj = position;
  vNrm = normalize(normalMatrix * normal);
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
          float dlon = wrapLon(lon - ${lon});
          float dlat = lat - ${lat};
          vec2 q = vec2(dlon / ${rx}, dlat / ${ry});
          float e = length(q);
          if (e < 1.75) {
            float ang = atan(q.y, q.x);
            float spiral = ang * 1.55 - log(max(e, 0.045)) * 2.55 + uTime * 0.05;
            float arm = pow(0.5 + 0.5 * sin(spiral), 2.6);
            float armB = pow(0.5 + 0.5 * sin(spiral * 0.68 + 2.1), 3.6);
            float armC = pow(0.5 + 0.5 * sin(spiral * 1.9 - 1.1), 4.2);
            float filament = noise(vec3(q * 4.2, uTime * 0.08 + 2.0));
            vec3 deep = vec3(0.28, 0.05, 0.02);
            vec3 brick = vec3(0.78, 0.15, 0.045);
            vec3 salmon = vec3(1.02, 0.42, 0.16);
            vec3 cream = vec3(1.0, 0.92, 0.76);
            vec3 rust = vec3(0.52, 0.1, 0.035);
            float rim = smoothstep(0.38, 0.72, e) * (1.0 - smoothstep(0.72, 0.94, e));
            float core = 1.0 - smoothstep(0.03, 0.42, e);
            float mid = smoothstep(0.2, 0.55, e) * (1.0 - smoothstep(0.55, 0.85, e));
            vec3 grs = mix(brick, deep, rim * 0.95);
            grs = mix(grs, rust, mid * 0.45);
            grs = mix(grs, salmon, core * 0.95);
            grs = mix(grs, cream, arm * (0.32 + core * 0.55));
            grs = mix(grs, mix(salmon, cream, 0.5), armB * core * 0.55);
            grs = mix(grs, deep, armC * (1.0 - core) * 0.35);
            grs = mix(grs, cream, filament * arm * 0.18);
            float collar = smoothstep(0.82, 1.0, e) * (1.0 - smoothstep(1.0, 1.28, e));
            grs = mix(grs, cream, collar * 0.95);
            float body = 1.0 - smoothstep(0.86, 1.14, e);
            float wake = smoothstep(0.12, 1.35, -dlon / ${rx});
            wake *= exp(-((dlat * dlat) / (${ry} * ${ry})) * 1.55);
            wake *= 1.0 - smoothstep(0.3, 1.6, e);
            albedo = mix(albedo, mix(vec3(0.48, 0.2, 0.1), cream, arm), wake * 0.58);
            albedo = mix(albedo, grs, body);
            stormH = body;
            stormQ = q;
            stormE = e;
          }
        }
      `;
    }
    if (spot.kind === "oval") {
      return `
        {
          float dlon = wrapLon(lon - ${lon});
          float dlat = lat - ${lat};
          vec2 q = vec2(dlon / ${rx}, dlat / ${ry});
          float e = length(q);
          float ang = atan(q.y, q.x);
          float arm = 0.5 + 0.5 * sin(ang * 2.2 - e * 7.5 + uTime * 0.28);
          float m = 1.0 - smoothstep(0.22, 1.05, e);
          vec3 oval = mix(vec3(0.76, 0.78, 0.76), vec3(1.04, 1.0, 0.92), arm);
          float eye = 1.0 - smoothstep(0.0, 0.36, e);
          oval = mix(oval, vec3(0.92, 0.95, 0.97), eye * 0.4);
          albedo = mix(albedo, oval, m);
        }
      `;
    }
    return `
      {
        float dlon = wrapLon(lon - ${lon});
        float dlat = lat - ${lat};
        float e = length(vec2(dlon / ${rx}, dlat / ${ry}));
        float m = 1.0 - smoothstep(0.2, 1.02, e);
        float arm = 0.5 + 0.5 * sin(atan(dlat, dlon) * 2.2 - e * 8.5);
        albedo = mix(albedo, mix(vec3(0.52, 0.14, 0.06), vec3(0.9, 0.36, 0.14), arm), m * 0.92);
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

float beltMask(float deg) {
  return exp(-pow(abs(deg - 12.0) / 4.0, 2.0))
    + exp(-pow(abs(deg - 28.5) / 3.0, 2.0)) * 0.78
    + exp(-pow(abs(deg - 42.0) / 2.7, 2.0)) * 0.52
    + exp(-pow(abs(deg - 54.0) / 3.0, 2.0)) * 0.38
    + exp(-pow(abs(deg + 15.0) / 4.2, 2.0)) * 0.9
    + exp(-pow(abs(deg + 33.0) / 3.0, 2.0)) * 0.7;
}

float cloudRelief(float lon, float lat) {
  float deg = lat * 57.2957795;
  float belts =
    gauss(deg, 12.0, 5.0) + gauss(deg, -14.0, 4.4) +
    gauss(deg, 32.0, 3.1) * 0.72 + gauss(deg, -33.0, 2.9) * 0.68 +
    gauss(deg, 44.0, 2.9) * 0.42 + gauss(deg, -45.0, 2.9) * 0.42;
  float streaks = noise(vec3(lon * 1.8, lat * 44.0, 1.2));
  float swirl = noise(vec3(lon * 3.2, lat * 8.0, 4.1));
  return -belts * 0.82 + (streaks - 0.5) * 0.32 + (swirl - 0.5) * 0.12;
}

void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float deg = abs(lat) * 57.2957795;
  float jet = sin(lat * 17.0) * 0.55 + sin(lat * 8.0) * 0.32 + sin(lat * 28.0) * 0.12;
  float speed = 0.01 + 0.018 * (0.5 + 0.5 * sin(lat * 14.0));
  float flow = lon + jet * 0.09 + uTime * speed;
  float u = fract(flow / 6.28318530718 + 0.5);
  float v = lat / 3.14159265359 + 0.5;
  vec3 tex = texture2D(uMap, vec2(u, clamp(v, 0.002, 0.998))).rgb;
  float hair = noise(vec3(flow * 1.6, lat * 54.0, 1.1));
  float wisp = noise(vec3(flow * 0.55, lat * 11.0, 3.4));
  float micro = noise(vec3(flow * 4.2, lat * 90.0, 7.0));
  vec3 albedo = tex * (0.88 + 0.14 * hair + 0.07 * wisp + 0.04 * micro);
  float ragged = (wisp - 0.5) * 2.6;
  float belts = beltMask(deg + ragged);
  albedo = mix(albedo, albedo * vec3(0.72, 0.58, 0.44), smoothstep(0.35, 0.92, belts) * 0.28);
  // Zone brightening
  float zones = gauss(lat * 57.2957795, 0.0, 6.0) + gauss(lat * 57.2957795, 23.0, 3.5) * 0.5;
  albedo = mix(albedo, min(albedo * vec3(1.08, 1.05, 0.98), vec3(1.15)), zones * 0.22);

  float stormH = 0.0;
  vec2 stormQ = vec2(0.0);
  float stormE = 2.0;
  ${spotBlock()}

  float base0 = cloudRelief(lon, lat);
  float eps = 0.01;
  float hx = cloudRelief(lon + eps, lat) - base0;
  float hy = cloudRelief(lon, lat + eps) - base0;
  vec3 axis = abs(dir.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(axis, dir));
  vec3 north = normalize(cross(dir, east));
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  float bump = 2.85;
  if (stormE < 1.3) {
    float armSlope = sin(atan(stormQ.y, stormQ.x) * 2.2 - log(max(stormE, 0.05)) * 2.9 + uTime * 0.08);
    hx += armSlope * 0.075 * (1.0 - smoothstep(0.18, 1.05, stormE));
    hy += cos(atan(stormQ.y, stormQ.x) * 2.2) * 0.04 * (1.0 - smoothstep(0.18, 1.0, stormE));
    bump = 2.0;
    hx *= 1.0 + stormH * 0.28;
    hy *= 1.0 + stormH * 0.28;
  }
  n = normalize(n - east * hx * bump - north * hy * bump);

  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float ndl = dot(n, sun);
  float lit = clamp(ndl * 0.72 + 0.28, 0.0, 1.0);
  float fill = clamp(dot(n, normalize(vec3(-0.5, 0.2, -0.4))) * 0.45 + 0.55, 0.0, 1.0);
  vec3 col = albedo * (vec3(0.035, 0.032, 0.04) + vec3(1.38, 1.16, 0.95) * lit + vec3(0.14, 0.16, 0.22) * fill);
  // Approximate subsurface scatter on lit cloud limbs
  float sss = pow(clamp(dot(view, -sun), 0.0, 1.0), 2.4) * clamp(1.0 - abs(ndl), 0.0, 1.0);
  col += vec3(1.0, 0.55, 0.28) * sss * 0.14;
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.85);
  col += vec3(0.95, 0.58, 0.34) * fres * 0.22;
  float spec = pow(clamp(dot(reflect(-sun, n), view), 0.0, 1.0), 72.0);
  col += spec * vec3(1.0, 0.94, 0.84) * 0.14;
  float mu = clamp(dot(n, view), 0.0, 1.0);
  col *= 0.82 + 0.18 * sqrt(mu);
  // Atmospheric limb haze
  col = mix(col, vec3(0.92, 0.62, 0.4), fres * 0.12);
  col += albedo * uAccent * 0.2 + vec3(1.0, 0.75, 0.45) * uAccent * 0.14;
  if (!gl_FrontFacing) col = mix(col * 0.4, vec3(0.2, 0.08, 0.04), 0.42);
  finish(col, uOpacity);
}
`;

export const GAS_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float n = fbm(vec3(lon * 1.3 + uTime * 0.012, lat * 2.4, 0.4));
  float n2 = fbm(vec3(lon * 2.8, lat * 6.0 + uTime * 0.02, 3.0));
  float bands = 0.5 + 0.5 * sin(lat * 14.0 + n * 1.5);
  vec3 cream = vec3(0.82, 0.66, 0.48);
  vec3 sand = vec3(0.54, 0.4, 0.28);
  vec3 deep = vec3(0.3, 0.22, 0.17);
  vec3 albedo = mix(deep, cream, n);
  albedo = mix(albedo, sand, smoothstep(0.35, 0.75, n2) * 0.55);
  albedo = mix(albedo, albedo * vec3(0.85, 0.75, 0.62), bands * 0.25);
  albedo *= 0.93 + 0.09 * cos(lat * 3.0);
  vec3 nrm = normalize(vNrm);
  if (!gl_FrontFacing) nrm = -nrm;
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(nrm, view), 0.0, 1.0), 2.2);
  vec3 col = shade(albedo, vec3(0.045, 0.028, 0.016), nrm);
  col += vec3(0.85, 0.55, 0.32) * fres * 0.1;
  if (!gl_FrontFacing) col *= 0.52;
  finish(col, uOpacity);
}
`;

export const METAL_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 p = vObj * 2.15;
  float n1 = fbm(p + vec3(uTime * 0.07, 0.0, -uTime * 0.04));
  float n2 = fbm(p * 2.1 + vec3(n1 * 1.3, uTime * 0.05, 1.7));
  float fil = smoothstep(0.3, 0.76, n2);
  vec3 dark = vec3(0.28, 0.05, 0.025);
  vec3 hot = vec3(1.32, 0.48, 0.12);
  vec3 albedo = mix(dark, hot, fil);
  vec3 emis = mix(vec3(0.2, 0.035, 0.012), vec3(1.05, 0.36, 0.08), fil);
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 col = shade(albedo, emis, n);
  float spec = pow(clamp(dot(n, normalize(normalize(uSun) + view)), 0.0, 1.0), 48.0);
  col += spec * vec3(1.0, 0.8, 0.55) * 0.62;
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 1.7);
  col += vec3(1.0, 0.45, 0.15) * fres * 0.22;
  if (!gl_FrontFacing) {
    col = mix(col, vec3(1.08, 0.4, 0.1), 0.48);
    col += vec3(0.5, 0.12, 0.03);
  }
  finish(col, uOpacity);
}
`;

export const FUZZY_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  float a = fbm(vObj * 3.1 + vec3(uTime * 0.015));
  float b = fbm(vObj * 5.8 + vec3(4.2, 0.3, 1.1));
  float c = fbm(vObj * 2.2 + vec3(0.2, 2.4, uTime * 0.01));
  vec3 rock = vec3(0.42, 0.28, 0.2);
  vec3 ice = vec3(0.62, 0.74, 0.76);
  vec3 iron = vec3(0.52, 0.46, 0.42);
  vec3 hyd = vec3(0.78, 0.36, 0.16);
  vec3 albedo = mix(rock, ice, smoothstep(0.4, 0.72, a));
  albedo = mix(albedo, iron, smoothstep(0.48, 0.8, b) * 0.7);
  albedo = mix(albedo, hyd, smoothstep(0.45, 0.82, c) * 0.55);
  float radial = smoothstep(0.35, 1.15, length(vObj));
  albedo = mix(albedo, hyd, radial * 0.5);
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 1.25);
  vec3 col = shade(albedo, vec3(0.05, 0.025, 0.015), n);
  float alpha = mix(0.88, 0.12, fres);
  alpha *= 0.78 + 0.22 * noise(vObj * 6.5);
  finish(col, alpha * uOpacity);
}
`;

export const HAZE_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  float n = fbm(normalize(vObj) * 3.6 + vec3(uTime * 0.02));
  if (n < 0.36) discard;
  vec3 nrm = normalize(vNrm);
  vec3 col = shade(mix(vec3(0.62, 0.34, 0.18), vec3(0.48, 0.42, 0.38), n), vec3(0.08, 0.03, 0.015), nrm);
  float alpha = smoothstep(0.36, 0.7, n) * 0.34;
  finish(col, alpha * uOpacity);
}
`;

export const NUCLEUS_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 1.15);
  float m = fbm(vObj * 8.0);
  vec3 hot = vec3(0.85, 0.32, 0.14);
  vec3 rock = vec3(0.32, 0.2, 0.16);
  vec3 albedo = mix(hot, rock, smoothstep(0.2, 0.85, fres));
  albedo = mix(albedo, rock * 0.8, m * 0.35);
  vec3 col = shade(albedo, mix(vec3(0.45, 0.12, 0.04), vec3(0.0), fres), n);
  float alpha = mix(0.96, 0.08, fres);
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
  float u = fract(lon / 6.28318530718 + 0.5 + uTime * 0.012);
  float v = lat / 3.14159265359 + 0.5;
  vec3 albedo = texture2D(uMap, vec2(u, clamp(v, 0.0, 1.0))).rgb;
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.4);
  vec3 col = shade(albedo, vec3(0.0), n);
  col += vec3(0.28, 0.5, 0.85) * fres * 0.7;
  finish(col, 1.0);
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
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.4);
  float rim = fres * uOpacity;
  float sunEdge = pow(clamp(1.0 - abs(dot(n, normalize(uSun))), 0.0, 1.0), 1.4);
  vec3 col = mix(vec3(0.72, 0.42, 0.24), vec3(1.0, 0.72, 0.45), sunEdge * 0.55);
  gl_FragColor = vec4(col, rim * 0.62);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
