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
${NOISE}
vec3 shade(vec3 albedo, vec3 emis, vec3 n) {
  vec3 sun = normalize(uSun);
  float ndl = dot(n, sun);
  float wrap = clamp(ndl * 0.62 + 0.38, 0.0, 1.0);
  float night = clamp(-ndl, 0.0, 1.0);
  vec3 col = albedo * (vec3(0.07, 0.065, 0.08) + vec3(1.22, 1.08, 0.92) * wrap) + emis;
  col *= 1.0 - night * night * 0.22;
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
    float h = (0.55 - belts) * 0.012;
    h += (vnoise(vec3(lon * 4.0, lat * 10.0, 2.0)) - 0.5) * 0.008;
    float dlon = atan(sin(lon - ${GRS_LON}), cos(lon - ${GRS_LON}));
    float dlat = lat - ${GRS_LAT};
    float e = length(vec2(dlon / ${GRS_RX}, dlat / ${GRS_RY}));
    float storm = 1.0 - smoothstep(0.15, 1.05, e);
    h += storm * 0.058;
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
          if (e < 1.65) {
            float ang = atan(q.y, q.x);
            float spiral = ang * 1.35 - log(max(e, 0.055)) * 2.35 + uTime * 0.045;
            float arm = pow(0.5 + 0.5 * sin(spiral), 3.0);
            float armB = pow(0.5 + 0.5 * sin(spiral * 0.62 + 2.2), 4.0);
            vec3 deep = vec3(0.34, 0.065, 0.028);
            vec3 brick = vec3(0.74, 0.16, 0.05);
            vec3 salmon = vec3(0.98, 0.4, 0.15);
            vec3 cream = vec3(0.98, 0.9, 0.74);
            float rim = smoothstep(0.4, 0.7, e) * (1.0 - smoothstep(0.7, 0.9, e));
            float core = 1.0 - smoothstep(0.04, 0.46, e);
            vec3 grs = mix(brick, deep, rim * 0.9);
            grs = mix(grs, salmon, core * 0.92);
            grs = mix(grs, cream, arm * (0.28 + core * 0.5));
            grs = mix(grs, mix(salmon, cream, 0.45), armB * core * 0.5);
            float collar = smoothstep(0.84, 1.0, e) * (1.0 - smoothstep(1.0, 1.24, e));
            grs = mix(grs, cream, collar * 0.92);
            float body = 1.0 - smoothstep(0.88, 1.12, e);
            float wake = smoothstep(0.15, 1.25, -dlon / ${rx});
            wake *= exp(-((dlat * dlat) / (${ry} * ${ry})) * 1.6);
            wake *= 1.0 - smoothstep(0.35, 1.55, e);
            albedo = mix(albedo, mix(vec3(0.52, 0.24, 0.12), cream, arm), wake * 0.5);
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
          float arm = 0.5 + 0.5 * sin(ang * 2.0 - e * 7.0 + uTime * 0.3);
          float m = 1.0 - smoothstep(0.25, 1.05, e);
          vec3 oval = mix(vec3(0.78, 0.8, 0.78), vec3(1.02, 0.98, 0.9), arm);
          float eye = 1.0 - smoothstep(0.0, 0.38, e);
          oval = mix(oval, vec3(0.9, 0.93, 0.95), eye * 0.35);
          albedo = mix(albedo, oval, m);
        }
      `;
    }
    return `
      {
        float dlon = wrapLon(lon - ${lon});
        float dlat = lat - ${lat};
        float e = length(vec2(dlon / ${rx}, dlat / ${ry}));
        float m = 1.0 - smoothstep(0.22, 1.02, e);
        float arm = 0.5 + 0.5 * sin(atan(dlat, dlon) * 2.0 - e * 8.0);
        albedo = mix(albedo, mix(vec3(0.55, 0.16, 0.07), vec3(0.86, 0.34, 0.14), arm), m * 0.9);
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
  return exp(-pow(abs(deg - 12.0) / 4.2, 2.0))
    + exp(-pow(abs(deg - 28.5) / 3.1, 2.0)) * 0.75
    + exp(-pow(abs(deg - 42.0) / 2.8, 2.0)) * 0.5
    + exp(-pow(abs(deg - 54.0) / 3.2, 2.0)) * 0.35;
}

float cloudRelief(float lon, float lat) {
  float deg = lat * 57.2957795;
  float belts =
    gauss(deg, 12.0, 5.2) + gauss(deg, -14.0, 4.6) +
    gauss(deg, 32.0, 3.2) * 0.7 + gauss(deg, -33.0, 3.0) * 0.65 +
    gauss(deg, 44.0, 3.0) * 0.4 + gauss(deg, -45.0, 3.0) * 0.4;
  float streaks = noise(vec3(lon * 1.7, lat * 42.0, 1.2));
  return -belts * 0.75 + (streaks - 0.5) * 0.28;
}

void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float deg = abs(lat) * 57.2957795;
  float jet = sin(lat * 17.0) * 0.55 + sin(lat * 8.0) * 0.3;
  float speed = 0.012 + 0.02 * (0.5 + 0.5 * sin(lat * 14.0));
  float flow = lon + jet * 0.08 + uTime * speed;
  float u = fract(flow / 6.28318530718 + 0.5);
  float v = lat / 3.14159265359 + 0.5;
  vec3 tex = texture2D(uMap, vec2(u, clamp(v, 0.002, 0.998))).rgb;
  float hair = noise(vec3(flow * 1.5, lat * 52.0, 1.1));
  float wisp = noise(vec3(flow * 0.55, lat * 11.0, 3.4));
  vec3 albedo = tex * (0.9 + 0.14 * hair + 0.06 * wisp);
  float ragged = (wisp - 0.5) * 2.4;
  float belts = beltMask(deg + ragged);
  albedo = mix(albedo, albedo * vec3(0.78, 0.66, 0.52), smoothstep(0.4, 0.9, belts) * 0.18);

  float stormH = 0.0;
  vec2 stormQ = vec2(0.0);
  float stormE = 2.0;
  ${spotBlock()}

  float base0 = cloudRelief(lon, lat);
  float eps = 0.012;
  float hx = cloudRelief(lon + eps, lat) - base0;
  float hy = cloudRelief(lon, lat + eps) - base0;
  vec3 axis = abs(dir.y) > 0.96 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 east = normalize(cross(axis, dir));
  vec3 north = normalize(cross(dir, east));
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  float bump = 2.4;
  if (stormE < 1.25) {
    float armSlope = sin(atan(stormQ.y, stormQ.x) * 2.0 - log(max(stormE, 0.05)) * 2.8 + uTime * 0.07);
    hx += armSlope * 0.06 * (1.0 - smoothstep(0.2, 1.05, stormE));
    hy += cos(atan(stormQ.y, stormQ.x) * 2.0) * 0.035 * (1.0 - smoothstep(0.2, 1.0, stormE));
    bump = 1.7;
    hx *= 1.0 + stormH * 0.2;
    hy *= 1.0 + stormH * 0.2;
  }
  n = normalize(n - east * hx * bump - north * hy * bump);

  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float ndl = dot(n, sun);
  float lit = clamp(ndl * 0.8 + 0.2, 0.0, 1.0);
  vec3 col = albedo * (vec3(0.04, 0.035, 0.045) + vec3(1.32, 1.14, 0.96) * lit);
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 3.2);
  col += vec3(0.9, 0.55, 0.32) * fres * 0.16;
  float spec = pow(clamp(dot(reflect(-sun, n), view), 0.0, 1.0), 56.0);
  col += spec * vec3(1.0, 0.94, 0.82) * 0.1;
  float mu = clamp(dot(n, view), 0.0, 1.0);
  col *= 0.84 + 0.16 * sqrt(mu);
  if (!gl_FrontFacing) col = mix(col * 0.42, vec3(0.22, 0.09, 0.045), 0.4);
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
  vec3 cream = vec3(0.78, 0.64, 0.46);
  vec3 sand = vec3(0.52, 0.4, 0.28);
  vec3 deep = vec3(0.32, 0.25, 0.2);
  vec3 albedo = mix(deep, cream, n);
  albedo = mix(albedo, sand, smoothstep(0.35, 0.75, n2) * 0.55);
  albedo *= 0.94 + 0.08 * cos(lat * 3.0);
  vec3 nrm = normalize(vNrm);
  if (!gl_FrontFacing) nrm = -nrm;
  vec3 col = shade(albedo, vec3(0.04, 0.025, 0.015), nrm);
  if (!gl_FrontFacing) col *= 0.55;
  finish(col, uOpacity);
}
`;

export const METAL_FRAG = /* glsl */ `
${PRELUDE}
void main() {
  vec3 p = vObj * 2.15;
  float n1 = fbm(p + vec3(uTime * 0.07, 0.0, -uTime * 0.04));
  float n2 = fbm(p * 2.1 + vec3(n1 * 1.3, uTime * 0.05, 1.7));
  float fil = smoothstep(0.32, 0.74, n2);
  vec3 dark = vec3(0.32, 0.06, 0.03);
  vec3 hot = vec3(1.25, 0.46, 0.12);
  vec3 albedo = mix(dark, hot, fil);
  vec3 emis = mix(vec3(0.22, 0.04, 0.015), vec3(0.95, 0.32, 0.07), fil);
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 col = shade(albedo, emis, n);
  float spec = pow(clamp(dot(n, normalize(normalize(uSun) + view)), 0.0, 1.0), 42.0);
  col += spec * vec3(1.0, 0.78, 0.55) * 0.55;
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 1.8);
  col += vec3(1.0, 0.42, 0.14) * fres * 0.18;
  if (!gl_FrontFacing) {
    col = mix(col, vec3(1.05, 0.38, 0.1), 0.45);
    col += vec3(0.45, 0.1, 0.03);
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
  float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.8);
  float rim = fres * uOpacity;
  vec3 col = vec3(0.78, 0.46, 0.26);
  gl_FragColor = vec4(col, rim * 0.55);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
