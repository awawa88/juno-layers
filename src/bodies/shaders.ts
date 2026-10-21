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
${NOISE}
/** Jupiter-style lit-ball: wrap terminator + limb darkening + silhouette haze tip. */
vec3 ballLit(vec3 albedo, vec3 n, float emitBoost) {
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float muGeo = clamp(dot(n, view), 0.0, 1.0);
  float w = max(fwidth(muGeo), 1e-4);
  float hazeEdge = pow(smoothstep(0.0, 0.48 + w * 10.0, muGeo), 1.35);
  float tipAmt = pow(1.0 - hazeEdge, 1.85);
  float mu0 = clamp(dot(n, sun) * 0.7 + 0.3, 0.0, 1.0);
  float limbDark = mix(0.30, 1.0, pow(smoothstep(0.0, 0.62 + w * 8.0, muGeo), 0.85));
  float terminator = pow(mu0, 0.75);

  vec3 lit;
  if (emitBoost > 0.05) {
    // Self-lit photosphere: limb darkening without a dark night side.
    float sunLimb = mix(0.52, 1.0, pow(smoothstep(0.0, 0.88 + w * 6.0, muGeo), 0.72));
    lit = albedo * (0.72 + emitBoost) * sunLimb;
    lit = mix(uHazeSoft * 1.15, lit, hazeEdge * 0.88 + 0.12);
  } else {
    lit = albedo * (0.025 + 1.06 * terminator) * limbDark;
    vec3 haze = mix(uHazeSoft, uHazeTip, tipAmt);
    vec3 gray = vec3(dot(lit, vec3(0.299, 0.587, 0.114)));
    vec3 mid = mix(lit, gray, (1.0 - hazeEdge) * 0.28);
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

  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) {
    n = -n;
    vec3 view = normalize(cameraPosition - vWorld);
    float rim = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    vec3 innerCol = albedo * (0.55 + 0.45 * rim);
    finish(ballLit(innerCol, n, 0.0) * 0.85, uOpacity);
    return;
  }
  finish(ballLit(albedo, n, uEmitBoost), uOpacity);
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
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  float mu = clamp(abs(dot(n, view)), 0.0, 1.0);
  float fres = pow(1.0 - mu, 2.8);
  float day = clamp(dot(n, normalize(uSun)) * 0.55 + 0.45, 0.0, 1.0);
  // Face stays nearly clear; glow concentrates at the limb (not a thick bubble).
  vec3 col = uColor * (0.25 + 0.75 * day);
  float alpha = uOpacity * (0.04 + 0.78 * fres) * (0.5 + 0.5 * day);
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
void main() {
  vec3 n = normalize(vNrm);
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(uSun);
  float ndv = clamp(abs(dot(n, view)), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 8.5) * smoothstep(0.0, 0.12, ndv);
  float sunlit = mix(0.55, 1.0, smoothstep(-0.40, 0.25, dot(n, sun)));
  float rim = fres * sunlit * uOpacity;
  gl_FragColor = vec4(uGlowCol, rim * 0.018);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
