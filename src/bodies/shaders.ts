/** Shared peel shaders for Earth / Mars / Moon / Sun (Jupiter keeps its own).
 * Lighting matches Jupiter cloud deck: terminator wrap, limb darkening, ball-shadow rim haze.
 */

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
#ifndef QUALITY
#define QUALITY 2
#endif
#ifndef FBM_OCTAVES
#define FBM_OCTAVES 4
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
`;

const PRELUDE = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uPeel;
uniform vec3 uHazeSoft;
uniform vec3 uHazeTip;
/** 0 = Jupiter-style night ball; 1 = Starship-cam daylight fill (Earth). */
uniform float uDayBias;
${NOISE}
/** Jupiter-style lit-ball: wrap terminator + limb darkening + silhouette haze tip. */
vec3 ballLit(vec3 albedo, vec3 n, float emitBoost) {
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float muGeo = clamp(dot(n, view), 0.0, 1.0);
  float w = max(fwidth(muGeo), 1e-4);
  // Earth day-bias: steeper silhouette so surface doesn't pad a soft blue halo.
  float hazeStart = mix(0.48, 0.16, uDayBias);
  float hazePow = mix(1.35, 3.0, uDayBias);
  float hazeEdge = pow(smoothstep(0.0, hazeStart + w * 10.0, muGeo), hazePow);
  float tipAmt = pow(1.0 - hazeEdge, mix(1.85, 4.0, uDayBias));
  float wrap = mix(0.7, 0.42, uDayBias);
  float fill = mix(0.3, 0.62, uDayBias);
  float mu0 = clamp(dot(n, sun) * wrap + fill, 0.0, 1.0);
  float limbFloor = mix(0.30, 0.55, uDayBias);
  float limbDark = mix(limbFloor, 1.0, pow(smoothstep(0.0, 0.62 + w * 8.0, muGeo), 0.85));
  float terminator = pow(mu0, mix(0.75, 0.55, uDayBias));

  vec3 lit;
  if (emitBoost > 0.05) {
    // Self-lit photosphere: limb darkening without a dark night side.
    float sunLimb = mix(0.52, 1.0, pow(smoothstep(0.0, 0.88 + w * 6.0, muGeo), 0.72));
    lit = albedo * (0.72 + emitBoost) * sunLimb;
    lit = mix(uHazeSoft * 1.15, lit, hazeEdge * 0.88 + 0.12);
  } else {
    float amb = mix(0.025, 0.14, uDayBias);
    float gain = mix(1.06, 1.22, uDayBias);
    lit = albedo * (amb + gain * terminator) * limbDark;
    vec3 haze = mix(uHazeSoft, uHazeTip, tipAmt);
    vec3 gray = vec3(dot(lit, vec3(0.299, 0.587, 0.114)));
    float desat = mix(0.28, 0.08, uDayBias);
    vec3 mid = mix(lit, gray, (1.0 - hazeEdge) * desat);
    lit = mix(haze, mid, hazeEdge);
  }
  return lit;
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
uniform float uDisp;
void main() {
  vec3 p = position;
  if (uDisp > 0.001) {
    float n = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
    p += normal * (n - 0.5) * uDisp;
  }
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vObj = position;
  vNrm = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Equirectangular albedo on a peelable shell (Earth / Mars / Moon / Sun photosphere). */
export const SURFACE_FRAG = /* glsl */ `
${PRELUDE}
uniform sampler2D uMap;
uniform float uEmitBoost;
/** Glassy ocean specular strength (Earth Starship-cam look; 0 elsewhere). */
uniform float uOceanSpec;
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float u = lon / 6.28318530718 + 0.5;
  float v = clamp(lat / 3.14159265359 + 0.5, 0.002, 0.998);
  float dux = dFdx(u);
  float duy = dFdy(u);
  dux -= floor(dux + 0.5);
  duy -= floor(duy + 0.5);
  // Mild mip sharpen (Jupiter cloud deck family) so albedo reads less “plastic flat”.
#if QUALITY > 1
  const float mipSharp = 0.35;
#else
  const float mipSharp = 0.55;
#endif
  vec3 albedo = textureGrad(
    uMap,
    vec2(u, v),
    vec2(dux, dFdx(v)) * mipSharp,
    vec2(duy, dFdy(v)) * mipSharp
  ).rgb;
  // Daylight exposure lift for Starship-cam Earth (no-op when uDayBias=0).
  albedo *= 1.0 + 0.16 * uDayBias;

  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) {
    n = -n;
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    vec3 innerCol = albedo * (0.55 + 0.45 * rim);
    finish(ballLit(innerCol, n, 0.0) * 0.85, uOpacity);
    return;
  }
  vec3 lit = ballLit(albedo, n, uEmitBoost);
  if (uOceanSpec > 0.001) {
    float lum = dot(albedo, vec3(0.299, 0.587, 0.114));
    // Blue-dominant, not cloud-white → ocean for glassy specular.
    float ocean = smoothstep(0.02, 0.12, albedo.b - max(albedo.r, albedo.g) * 0.92)
      * (1.0 - smoothstep(0.55, 0.82, lum));
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 sun = normalize(uSun);
    vec3 h = normalize(sun + view);
    float ndh = max(dot(n, h), 0.0);
    float spec = pow(ndh, 56.0) * ocean * uOceanSpec;
    float fres = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.2);
    lit += vec3(0.55, 0.75, 1.0) * spec * (0.55 + 0.45 * fres);
    // Deeper royal-blue open water (Flight 14 ref-B).
    lit = mix(lit, lit * vec3(0.78, 0.95, 1.28), ocean * 0.40 * uDayBias);
  }
  finish(lit, uOpacity);
}
`;

/** Simple colored solid shell (inner layers without a map). */
export const SOLID_FRAG = /* glsl */ `
${PRELUDE}
uniform vec3 uColor;
uniform float uEmis;
void main() {
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  float grain = noise(vObj * 6.0) * 0.08;
  vec3 albedo = uColor * (1.0 + grain);
  vec3 col = ballLit(albedo, n, 0.0);
  col += uColor * uEmis;
  finish(col, uOpacity);
}
`;

/** Thin translucent atmosphere shell — limb-weighted like Jupiter’s Rayleigh fringe. */
export const ATMO_FRAG = /* glsl */ `
${PRELUDE}
uniform vec3 uColor;
/** >0.5 → Starship thin electric-blue limb (Earth); Mars stays soft. */
uniform float uLimbTight;
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(abs(dot(n, view)), 0.0, 1.0);
  // Earth (uLimbTight): Flight-14 ~44:00 razor electric-blue limb into black space.
  float power = mix(2.8, 18.0, uLimbTight);
  float fres = pow(1.0 - mu, power);
  float day = clamp(dot(n, normalize(uSun)) * mix(0.55, 0.18, uLimbTight) + mix(0.45, 0.82, uLimbTight), 0.0, 1.0);
  vec3 col = uColor * mix(0.25 + 0.75 * day, 0.85 + 1.55 * day, uLimbTight);
  float face = mix(0.04, 0.0005, uLimbTight);
  float rim = mix(0.78, 1.55, uLimbTight);
  float alpha = uOpacity * (face + rim * fres) * mix(0.5 + 0.5 * day, 0.18 + 0.82 * day, uLimbTight);
  finish(col, alpha);
}
`;

/** Meridian cutaway face (shared with Jupiter’s section look). */
export const SECTION_FRAG = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNrm;
uniform float uTime;
uniform vec3 uSun;
uniform float uOpacity;
uniform float uInnerR;
uniform float uOuterR;
uniform vec3 uInnerCol;
uniform vec3 uOuterCol;
uniform float uEmis;
uniform float uPeel;
uniform vec3 uHazeSoft;
uniform vec3 uHazeTip;
${NOISE}

void main() {
  float r = length(vObj);
  float t = clamp((r - uInnerR) / max(0.001, uOuterR - uInnerR), 0.0, 1.0);
  float ang = atan(vObj.y, vObj.x);
  float flow = noise(vObj * 5.2 - vec3(0.0, uTime * 0.08, uTime * 0.05));
  float rings = 0.5 + 0.5 * sin(t * 28.0 - uTime * 0.7 + flow * 2.6);
  float plume = 0.5 + 0.5 * sin(ang * 14.0 + flow * 4.5 - t * 6.0);
  float grain = noise(vObj * 10.5 + vec3(uTime * 0.04, -uTime * 0.03, 0.0));

  vec3 base = mix(uInnerCol, uOuterCol, smoothstep(0.0, 1.0, t));
  base *= 0.88 + 0.11 * rings + 0.06 * plume + 0.06 * (grain - 0.5);

  float scanPhase = fract(uTime * 0.28);
  float scanWave = exp(-pow((t - scanPhase) / 0.12, 2.0)) * smoothstep(0.02, 0.25, uPeel) * (1.0 - smoothstep(0.65, 0.95, uPeel));
  float edgeHighlight = smoothstep(0.88, 1.0, t) * 0.18 + (1.0 - smoothstep(0.0, 0.12, t)) * 0.14;
  base += vec3(edgeHighlight) + uInnerCol * scanWave * 0.35;

  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 sun = normalize(uSun);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(n, view), 0.0, 1.0);
  float ndl = clamp(dot(n, sun) * 0.62 + 0.38, 0.0, 1.0);
  float limb = mix(0.42, 1.0, pow(smoothstep(0.0, 0.7, mu), 0.85));
  vec3 col = base * (vec3(0.08, 0.07, 0.09) + vec3(1.12, 1.02, 0.94) * ndl) * limb;
  col += uInnerCol * uEmis * (1.0 - t * 0.6) * (0.9 + 0.2 * sin(uTime * 1.6 + t * 5.0));

  gl_FragColor = vec4(col, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Outer atmospheric AA fringe (Jupiter GLOW_FRAG family; tinted per body). */
export const GLOW_FRAG = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNrm;
uniform vec3 uSun;
uniform float uOpacity;
uniform vec3 uGlowCol;
/** Scales AA fringe; Earth uses ~2.8 for Flight-14 razor electric limb. */
uniform float uGlowGain;
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float ndv = clamp(abs(dot(n, view)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, mix(8.5, 42.0, step(1.5, uGlowGain))) * smoothstep(0.0, 0.016, ndv);
  float sunlit = mix(0.55, 1.0, smoothstep(-0.40, 0.25, dot(n, sun)));
  float rim = fres * sunlit * uOpacity;
  gl_FragColor = vec4(uGlowCol, rim * 0.032 * uGlowGain);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Thin translucent cloud shell (Earth only) — NASA Blue Marble clouds alpha. */
export const CLOUD_FRAG = /* glsl */ `
${PRELUDE}
uniform sampler2D uMap;
void main() {
  vec3 dir = normalize(vObj);
  float lat = asin(clamp(dir.y, -1.0, 1.0));
  float lon = atan(dir.z, dir.x);
  float u = lon / 6.28318530718 + 0.5;
  float v = clamp(lat / 3.14159265359 + 0.5, 0.002, 0.998);
  vec4 cloud = texture(uMap, vec2(u, v));
  float dens = cloud.a;
  if (dens < 0.04) discard;
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 sun = normalize(uSun);
  float day = clamp(dot(n, sun) * 0.45 + 0.55, 0.0, 1.0);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(n, view), 0.0, 1.0);
  // Fluffy white rows; slight cool tint at limb like Starship cams.
  vec3 col = mix(vec3(0.92, 0.95, 1.0), vec3(1.0), dens) * (0.55 + 0.55 * day);
  float alpha = uOpacity * dens * dens * (0.55 + 0.35 * day) * smoothstep(0.0, 0.15, mu);
  finish(col, alpha);
}
`;
