import { useEffect, useState } from "react";
import { uiText, useLang } from "@/jupiter/i18n";
import {
  classifyDevice,
  currentOrientation,
  preferredOrientation,
  tryLockOrientation,
  type ScreenOrientationKind,
} from "@/jupiter/orientation";

/**
 * Full-screen “please rotate” gate for phones (portrait) and tablets/iPads (landscape).
 * Desktop is never blocked. Complements optional screen.orientation.lock where available.
 */
export function OrientationGate() {
  const [lang] = useLang();
  const copy = uiText(lang);
  const [needed, setNeeded] = useState<ScreenOrientationKind | null>(null);

  useEffect(() => {
    const update = () => {
      const kind = classifyDevice();
      const want = preferredOrientation(kind);
      if (!want) {
        setNeeded(null);
        return;
      }
      const ok = currentOrientation() === want;
      setNeeded(ok ? null : want);
      if (!ok) void tryLockOrientation(want);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const so = window.screen?.orientation;
    so?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      so?.removeEventListener?.("change", update);
    };
  }, []);

  if (!needed) return null;

  const title = needed === "portrait" ? copy.rotateToPortrait : copy.rotateToLandscape;
  const hint = needed === "portrait" ? copy.rotateToPortraitHint : copy.rotateToLandscapeHint;

  return (
    <div
      className="orientation-gate"
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-labelledby="orientation-gate-title"
      aria-describedby="orientation-gate-hint"
    >
      <div className="orientation-gate-card">
        <div
          className={
            needed === "portrait"
              ? "orientation-gate-icon is-portrait"
              : "orientation-gate-icon is-landscape"
          }
          aria-hidden="true"
        >
          <svg viewBox="0 0 64 64" width="56" height="56" fill="none">
            <rect
              className="orientation-gate-phone"
              x="18"
              y="8"
              width="28"
              height="48"
              rx="4"
              stroke="currentColor"
              strokeWidth="2.5"
            />
            <path
              className="orientation-gate-arrow"
              d="M50 28c4 2 6 6 6 10 0 8-6 14-14 14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              className="orientation-gate-arrow"
              d="M46 48l-4 4 4 4"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
        <p id="orientation-gate-title" className="orientation-gate-title">
          {title}
        </p>
        <p id="orientation-gate-hint" className="orientation-gate-hint">
          {hint}
        </p>
      </div>
    </div>
  );
}
