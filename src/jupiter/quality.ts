export type QualityTier = "low" | "medium" | "high";

type Segs = readonly [number, number];

export type QualityProfile = {
  tier: QualityTier;
  /** Injected into every ShaderMaterial as `#define QUALITY n`. */
  level: 0 | 1 | 2;
  /** Starting pixel-ratio cap; dynamic resolution never goes above it. */
  pixelRatio: number;
  /** Floor for dynamic resolution. */
  minPixelRatio: number;
  antialias: boolean;
  powerPreference: WebGLPowerPreference;
  cloudTex: Segs;
  earthTex: Segs;
  /** fBm octaves compiled into the shaders. */
  fbmOctaves: number;
  segs: {
    clouds: Segs;
    shell: Segs;
    fuzzy: Segs;
    haze: Segs;
    nucleus: Segs;
    nucleusHalo: Segs;
    glow: Segs;
    earth: Segs;
    earthAtmo: Segs;
    moon: Segs;
    capRadial: number;
  };
  stars: readonly [number, number];
  motes: number;
  fieldLines: number;
  fieldTube: readonly [tubular: number, radial: number];
  /** Field-line thickness multiplier; thin tubes alias without MSAA at lower pixel ratios. */
  fieldWidth: number;
  auroraSegs: number;
  /** Frame rate while nothing moves on screen; 0 = uncapped. */
  idleFps: number;
};

const PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: "high",
    level: 2,
    pixelRatio: 2,
    minPixelRatio: 1,
    antialias: true,
    powerPreference: "high-performance",
    cloudTex: [2048, 1024],
    earthTex: [1024, 512],
    fbmOctaves: 5,
    segs: {
      clouds: [192, 144],
      shell: [128, 96],
      fuzzy: [96, 72],
      haze: [64, 48],
      nucleus: [64, 48],
      nucleusHalo: [48, 36],
      glow: [96, 72],
      earth: [64, 48],
      earthAtmo: [32, 24],
      moon: [24, 18],
      capRadial: 24,
    },
    stars: [650, 55],
    motes: 110,
    fieldLines: 10,
    fieldTube: [72, 6],
    fieldWidth: 1,
    auroraSegs: 72,
    idleFps: 0,
  },
  medium: {
    tier: "medium",
    level: 1,
    pixelRatio: 1.5,
    minPixelRatio: 1,
    antialias: false,
    powerPreference: "default",
    cloudTex: [1536, 768],
    earthTex: [512, 256],
    fbmOctaves: 4,
    segs: {
      clouds: [128, 96],
      shell: [96, 72],
      fuzzy: [72, 54],
      haze: [48, 36],
      nucleus: [48, 36],
      nucleusHalo: [40, 30],
      glow: [64, 48],
      earth: [48, 36],
      earthAtmo: [28, 20],
      moon: [20, 14],
      capRadial: 4,
    },
    stars: [500, 45],
    motes: 60,
    fieldLines: 10,
    fieldTube: [64, 6],
    fieldWidth: 1.2,
    auroraSegs: 56,
    idleFps: 30,
  },
  low: {
    tier: "low",
    level: 0,
    pixelRatio: 1.25,
    minPixelRatio: 0.85,
    antialias: false,
    powerPreference: "default",
    cloudTex: [1024, 512],
    earthTex: [512, 256],
    fbmOctaves: 4,
    segs: {
      clouds: [96, 72],
      shell: [64, 48],
      fuzzy: [56, 42],
      haze: [40, 30],
      nucleus: [40, 30],
      nucleusHalo: [32, 24],
      glow: [48, 36],
      earth: [40, 30],
      earthAtmo: [24, 18],
      moon: [16, 12],
      capRadial: 4,
    },
    stars: [380, 32],
    motes: 40,
    fieldLines: 10,
    fieldTube: [56, 6],
    fieldWidth: 1.4,
    auroraSegs: 48,
    idleFps: 30,
  },
};

function isTier(value: string | null | undefined): value is QualityTier {
  return value === "low" || value === "medium" || value === "high";
}

/**
 * Phones → low, tablets (incl. iPadOS posing as a Mac, unfolded foldables) → medium, desktops → high.
 * Weak hardware drops one tier. `?quality=low|medium|high` overrides for testing.
 */
export function detectQualityTier(): QualityTier {
  if (typeof window === "undefined") return "high";
  try {
    const forced = new URLSearchParams(window.location.search).get("quality");
    if (isTier(forced)) return forced;
  } catch {
    // ignore malformed URLs
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const iPadOS = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const touchFirst = coarse || iPadOS || (mobileUA && nav.maxTouchPoints > 0);
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);

  let tier: QualityTier = touchFirst ? (shortSide < 600 ? "low" : "medium") : "high";

  // Only Chromium reports deviceMemory; Safari rounds hardwareConcurrency, so it is not trusted there.
  if (nav.deviceMemory !== undefined) {
    const cores = nav.hardwareConcurrency || 8;
    const memory = nav.deviceMemory;
    if (tier === "high" && (cores <= 2 || memory <= 2)) tier = "medium";
    else if (tier === "medium" && (cores <= 4 || memory <= 3)) tier = "low";
  }
  return tier;
}

export function qualityProfile(tier: QualityTier = detectQualityTier()): QualityProfile {
  return PROFILES[tier];
}
