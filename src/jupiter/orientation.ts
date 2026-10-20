/**
 * Phone vs tablet vs desktop classification for orientation UX.
 * Heuristics match `detectQualityTier` in quality.ts (coarse pointer / iPadOS /
 * mobile UA + short-side < 600 → phone).
 */

export type DeviceClass = "desktop" | "phone" | "tablet";
export type ScreenOrientationKind = "portrait" | "landscape";

/** Touch-first devices only; fine-pointer Mac/PC stay free. */
export function classifyDevice(): DeviceClass {
  if (typeof window === "undefined") return "desktop";
  const nav = navigator as Navigator & { maxTouchPoints: number };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const iPadOS = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  const touchFirst = coarse || iPadOS || (mobileUA && nav.maxTouchPoints > 0);
  if (!touchFirst) return "desktop";
  const shortSide = Math.min(
    window.screen?.width || window.innerWidth,
    window.screen?.height || window.innerHeight,
  );
  return shortSide < 600 ? "phone" : "tablet";
}

export function preferredOrientation(kind: DeviceClass): ScreenOrientationKind | null {
  if (kind === "phone") return "portrait";
  if (kind === "tablet") return "landscape";
  return null;
}

export function currentOrientation(): ScreenOrientationKind {
  if (typeof window === "undefined") return "portrait";
  if (window.matchMedia?.("(orientation: portrait)")?.matches) return "portrait";
  if (window.matchMedia?.("(orientation: landscape)")?.matches) return "landscape";
  return window.innerHeight >= window.innerWidth ? "portrait" : "landscape";
}

export function isOrientationOk(want: ScreenOrientationKind): boolean {
  return currentOrientation() === want;
}

/**
 * Best-effort Screen Orientation API lock (Android Chrome etc.).
 * Often no-ops on iOS Safari without fullscreen — overlay is the real gate.
 */
export async function tryLockOrientation(want: ScreenOrientationKind): Promise<void> {
  try {
    const orient = window.screen?.orientation as ScreenOrientation & {
      lock?: (t: string) => Promise<void>;
    };
    if (!orient?.lock) return;
    await orient.lock(want === "portrait" ? "portrait" : "landscape");
  } catch {
    // Not allowed / needs fullscreen / unsupported — ignore.
  }
}
