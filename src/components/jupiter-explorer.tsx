import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { LAYERS, SPOTS } from "@/jupiter/layers";
import { layerText, spotText, uiText, useLang } from "@/jupiter/i18n";
import type { JupiterScene, PickInfo } from "@/jupiter/scene";

export function JupiterExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<JupiterScene | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(0);
  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState(false);
  const [tip, setTip] = useState<PickInfo | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useLang();
  const copy = uiText(lang);
  const layer = layerText(lang, selected);

  useEffect(() => {
    focusRef.current = focus;
    sceneRef.current?.setFocus(focus);
  }, [focus]);

  useEffect(() => {
    sceneRef.current?.setSelected(selected);
  }, [selected]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let scene: JupiterScene | null = null;
    const tipKey = { current: "" };

    const showTip = (info: PickInfo | null, x: number, y: number) => {
      const el = tipRef.current;
      if (!el) return;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      if (!info || coarse) {
        el.style.opacity = "0";
        if (tipKey.current) {
          tipKey.current = "";
          setTip(null);
        }
        return;
      }
      el.style.opacity = "1";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      const key = `${info.layer}:${info.feature ?? ""}`;
      if (key !== tipKey.current) {
        tipKey.current = key;
        setTip(info);
      }
    };

    void (async () => {
      try {
        const mod = await import("@/jupiter/scene");
        if (dead || !canvasRef.current) return;
        scene = new mod.JupiterScene(canvasRef.current, {
          onHover: showTip,
          onPick: (info) => {
            // Tap a named storm → inspect (don't peel away the clouds)
            if (info.feature) {
              setSelected(info.layer);
              setInspect(info.feature);
              setNotes(true);
              scene?.setSelected(info.layer);
              scene?.focusFeature(info.feature);
              return;
            }
            const current = focusRef.current;
            if (info.layer < 4 && current < info.layer + 0.98) {
              const next = info.layer + 1;
              focusRef.current = next;
              setFocus(next);
              setSelected(next);
              setInspect(null);
            } else {
              setSelected(info.layer);
              setInspect(null);
            }
          },
          onEarth: (x, y, visible) => {
            const el = earthRef.current;
            if (!el) return;
            el.style.opacity = visible ? "1" : "0";
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
          },
          onFail: () => setFailed(true),
        });
        scene.setFocus(focusRef.current);
        scene.setSelected(0);
        scene.setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        sceneRef.current = scene;
        scene.start();
      } catch (err) {
        console.error(err);
        if (!dead) setFailed(true);
      }
    })();

    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setInspect(null);
        setFocus((current) => {
          const next = Math.min(4, Math.floor(current + 0.001) + 1);
          setSelected(next);
          return next;
        });
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setInspect(null);
        setFocus((current) => {
          const next = Math.max(0, Math.ceil(current - 0.001) - 1);
          setSelected(next);
          return next;
        });
      } else if (event.key >= "1" && event.key <= "5") {
        const next = Number(event.key) - 1;
        setInspect(null);
        setFocus(next);
        setSelected(next);
      } else if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        setInspect(null);
        setFocus((current) => {
          const next = Math.min(4, Math.floor(current + 0.001) + 1);
          setSelected(next);
          return next;
        });
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setInspect(null);
        setFocus(0);
        setSelected(0);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      dead = true;
      window.removeEventListener("keydown", onKey);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.title = copy.title;
  }, [copy.title]);

  function go(next: number) {
    const clamped = Math.min(4, Math.max(0, next));
    focusRef.current = clamped;
    setFocus(clamped);
    setSelected(clamped);
    setInspect(null);
  }

  function inspectSpot(name: string) {
    setInspect(name);
    setSelected(0);
    // Stay on clouds so the storm is visible
    if (focus > 0.15) {
      focusRef.current = 0;
      setFocus(0);
    }
    setNotes(true);
    sceneRef.current?.setSelected(0);
    sceneRef.current?.focusFeature(name);
  }

  const tipSpot = tip?.feature ? SPOTS.find((spot) => spot.name === tip.feature) : null;
  const translatedSpot = tipSpot ? spotText(lang, tipSpot.name) : null;
  const tipTitle = translatedSpot?.name ?? (tip ? layerText(lang, tip.layer).name : "");
  const tipBody = translatedSpot?.blurb ?? (tip ? layerText(lang, tip.layer).summary : "");

  const inspected = inspect ? spotText(lang, inspect) : null;

  return (
    <div className="stage">
      <canvas ref={canvasRef} aria-label={copy.canvas} />
      <div className="scrim" />
      <header className="hud">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={
                lang === "en"
                  ? "text-xs font-medium tracking-widest text-faint uppercase"
                  : "text-xs font-medium tracking-wide text-faint"
              }
            >
              {copy.kicker}
            </p>
            <h1 className="mt-1 font-display text-3xl leading-none font-medium tracking-tight md:text-4xl">
              {copy.title}
            </h1>
          </div>
          <div className="lang" role="group" aria-label={copy.language}>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
              EN
            </button>
            <button type="button" aria-pressed={lang === "zh-Hant"} onClick={() => setLang("zh-Hant")}>
              繁
            </button>
          </div>
        </div>
        <p className="mt-2 max-w-sm text-sm leading-snug text-muted">{copy.lede}</p>
        <p className="hint-line mt-2 max-w-md text-xs leading-snug text-faint">{copy.hint}</p>
        <p className="hint-keys mt-1 hidden max-w-md text-xs leading-snug text-faint md:block">{copy.keysHint}</p>
        <Link to="/faq" className="faq-link">
          {copy.faq}
        </Link>
      </header>

      <div ref={earthRef} className="earth-tag">
        <span>{copy.earth}</span>
      </div>

      <div ref={tipRef} className="tip" role="tooltip">
        <p className="text-sm font-medium text-fg">{tipTitle}</p>
        {tipBody ? <p className="mt-1 text-xs leading-snug text-muted">{tipBody}</p> : null}
        {tip?.feature ? (
          <p className="mt-1 text-[0.65rem] tracking-wide text-faint uppercase">{copy.orbitHint}</p>
        ) : null}
      </div>

      <aside className={notes ? "sheet is-open" : "sheet"} aria-label={copy.controls}>
        <div className="chips" role="group" aria-label={copy.layers}>
          {LAYERS.map((item) => {
            const text = layerText(lang, item.index);
            return (
              <button
                key={item.id}
                id={`layer-${item.index}`}
                type="button"
                className="layer-btn"
                aria-pressed={selected === item.index}
                onClick={() => go(item.index)}
              >
                <span className="swatch" style={{ background: item.swatch }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{text.name}</span>
                  <span className="hidden text-xs text-faint md:block">{text.radiusLabel}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="storm-row mt-2" role="group" aria-label={copy.inspectLabel}>
          {SPOTS.map((spot) => {
            const label = spotText(lang, spot.name)?.name ?? spot.name;
            return (
              <button
                key={spot.name}
                type="button"
                className="storm-chip"
                aria-pressed={inspect === spot.name}
                onClick={() => inspectSpot(spot.name)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="btn btn-primary flex-1"
            onClick={() => go(Math.min(4, Math.floor(focus + 0.001) + 1))}
            disabled={focus >= 4}
          >
            {focus >= 4 ? copy.atCenter : copy.peelDeeper}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => go(0)} disabled={focus <= 0}>
            {copy.restore}
          </button>
        </div>

        <label className="mt-2 block">
          <span className="flex items-baseline justify-between gap-3 text-xs text-faint">
            <span>{copy.depth}</span>
            <span className="truncate text-muted">{layerText(lang, Math.min(4, Math.round(focus))).name}</span>
          </span>
          <input
            className="depth"
            type="range"
            min={0}
            max={4}
            step={0.01}
            value={focus}
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={Number(focus.toFixed(2))}
            aria-valuetext={layerText(lang, Math.min(4, Math.round(focus))).name}
            aria-label={copy.depth}
            onChange={(event) => {
              const value = Number(event.target.value);
              setInspect(null);
              setFocus(value);
              setSelected(Math.min(4, Math.max(0, Math.round(value))));
            }}
            style={{ "--pct": `${(focus / 4) * 100}%` } as CSSProperties}
          />
        </label>

        <button
          type="button"
          className="btn btn-ghost mt-1 w-full md:hidden"
          aria-expanded={notes}
          onClick={() => setNotes((open) => !open)}
        >
          {notes ? copy.hideNotes : copy.aboutLayer}
        </button>

        <div className="notes mt-3 border-t border-line pt-3">
          {failed ? (
            <p className="text-sm leading-relaxed text-muted">{copy.webgl}</p>
          ) : inspected ? (
            <article aria-live="polite">
              <p className="text-xs text-faint">{copy.inspectLabel}</p>
              <h2 className="mt-1 font-display text-2xl leading-tight font-medium">{inspected.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg">{inspected.blurb}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{layerText(lang, 0).detail}</p>
              <button type="button" className="btn btn-ghost mt-3" onClick={() => setInspect(null)}>
                {copy.clearInspect}
              </button>
            </article>
          ) : (
            <article aria-live="polite">
              <p className="text-xs text-faint">{layer.radiusLabel}</p>
              <h2 className="mt-1 font-display text-2xl leading-tight font-medium">{layer.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-fg">{layer.body}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{layer.detail}</p>
              <p className="mt-3 border-l border-line-strong pl-3 text-sm leading-relaxed text-muted">
                <span className="font-medium text-fg">{copy.junoLabel}</span>
                {layer.juno}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-faint">{copy.footnote}</p>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
}
