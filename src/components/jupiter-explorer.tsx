import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { LAYERS, SPOTS } from "@/jupiter/layers";
import { isLatin, layerText, spotText, uiText, useLang } from "@/jupiter/i18n";
import type { FrameSpec, JupiterScene, PickInfo } from "@/jupiter/scene";
import { BodyNav, bodyNavLabel } from "@/components/body-nav";
import { LangSelect } from "@/components/lang-select";
import { usePanelSplit } from "@/components/use-panel-split";

type SegmentedWindow = Window & { viewport?: { segments?: readonly DOMRect[] } };

/** Phone card: tucked away behind a grab pill, the default controls, or pulled up with notes. */
type CardState = "collapsed" | "default" | "open";

/** Bottom strip kept clear for the grab pill while the card is collapsed. */
const PILL_ZONE = 28;
const SWIPE_PX = 20;

export function JupiterExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<JupiterScene | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(0);
  const cardRef = useRef<CardState>("default");
  const layoutRef = useRef<FrameSpec["mode"] | null>(null);
  const cardHeightRef = useRef(0);
  const dragRef = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const reframeRef = useRef<(() => void) | null>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);
  const split = usePanelSplit(sheetRef, controlsRef, splitterRef);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState(0);
  const [touring, setTouring] = useState(false);
  const [tiltOn, setTiltOn] = useState(true);
  const [viewMoved, setViewMoved] = useState(false);
  const [card, setCard] = useState<CardState>("default");
  const notes = card === "open";
  const [tip, setTip] = useState<PickInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useLang();
  const copy = uiText(lang);
  const layer = layerText(lang, selected);

  useEffect(() => {
    const previous = cardRef.current;
    cardRef.current = card;
    // Collapsing only transforms the card, which a ResizeObserver never sees.
    reframeRef.current?.();
    const active = document.activeElement;
    // preventScroll: the card is still off-screen mid-slide, and scrolling it into view would shift the whole stage.
    if (card === "collapsed" && sheetRef.current?.contains(active)) pillRef.current?.focus({ preventScroll: true });
    else if (previous === "collapsed" && active === document.body) handleRef.current?.focus({ preventScroll: true });
  }, [card]);

  useEffect(() => {
    focusRef.current = focus;
    // The tour drives the scene itself; echoing its depth back would read as user input and stop it.
    if (sceneRef.current?.isTouring) return;
    sceneRef.current?.setFocus(focus);
  }, [focus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let scene: JupiterScene | null = null;
    let raf = 0;
    const tipKey = { current: "" };

    // The free area the planet is framed in: left of the side panel, above the pull-up card,
    // or on its own screen segment of a dual-screen / folded device.
    const measureFrame = () => {
      const stage = stageRef.current;
      const sheet = sheetRef.current;
      if (!scene || !stage || !sheet) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const mode: FrameSpec["mode"] =
        getComputedStyle(stage).getPropertyValue("--layout").trim() === "wide" ? "wide" : "phone";
      if (layoutRef.current !== null && layoutRef.current !== mode && cardRef.current !== "default") {
        cardRef.current = "default";
        setCard("default");
      }
      layoutRef.current = mode;

      const segments = (window as SegmentedWindow).viewport?.segments;
      if (segments && segments.length === 2) {
        const [first, second] = [...segments].sort((a, b) => a.x - b.x || a.y - b.y);
        const sideBySide = Math.abs(first!.y - second!.y) < 2;
        const hudBottom = hudRef.current?.getBoundingClientRect().bottom ?? 0;
        scene.setFrame({
          mode: "wide",
          top: sideBySide ? 0 : hudBottom + 8,
          right: sideBySide ? Math.max(0, w - first!.right) : 0,
          bottom: sideBySide ? 0 : Math.max(0, h - first!.bottom),
        });
        return;
      }

      const sheetRect = sheet.getBoundingClientRect();
      if (mode === "wide") {
        scene.setFrame({ mode, top: 0, right: Math.max(0, w - sheetRect.left), bottom: 0 });
        return;
      }
      const hudBottom = hudRef.current?.getBoundingClientRect().bottom ?? 0;
      if (cardRef.current === "collapsed") {
        // Only the floating pill is left, so the planet gets the whole screen below the HUD.
        scene.setFrame({ mode, top: hudBottom + 8, right: 0, bottom: PILL_ZONE });
        return;
      }
      // Short landscape phones dock the card at the right instead of along the bottom.
      // offsetTop/offsetLeft ignore the slide transform, so a card mid-animation measures where it will rest.
      const docked = sheet.offsetLeft > w * 0.3;
      if (cardRef.current === "default" || cardHeightRef.current === 0) {
        cardHeightRef.current = Math.max(0, docked ? w - sheet.offsetLeft : h - sheet.offsetTop);
      }
      const card = cardHeightRef.current + 8;
      scene.setFrame({ mode, top: hudBottom + 8, right: docked ? card : 0, bottom: docked ? 0 : card });
    };
    const scheduleFrame = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureFrame);
    };
    reframeRef.current = scheduleFrame;
    const layoutObserver = new ResizeObserver(scheduleFrame);

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
            const current = focusRef.current;
            if (info.layer < 4 && current < info.layer + 0.98) {
              const next = info.layer + 1;
              focusRef.current = next;
              setFocus(next);
              setSelected(next);
            } else {
              setSelected(info.layer);
            }
          },
          onEarth: (x, y, visible) => {
            const el = earthRef.current;
            if (!el) return;
            el.style.opacity = visible ? "1" : "0";
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
          },
          onTourProgress: (nextFocus, nextSelected, active) => {
            focusRef.current = nextFocus;
            setFocus(nextFocus);
            setSelected(nextSelected);
            setTouring(active);
          },
          onViewMoved: setViewMoved,
          onFail: () => setFailed(true),
        });
        measureFrame();
        scene.setFocus(focusRef.current);
        scene.setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        setTiltOn(scene.isTiltEnabled());
        sceneRef.current = scene;
        scene.start();
        for (const el of [stageRef.current, sheetRef.current, hudRef.current]) {
          if (el) layoutObserver.observe(el);
        }
        window.addEventListener("resize", scheduleFrame);
      } catch (err) {
        console.error(err);
        if (!dead) setFailed(true);
      }
    })();

    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (event.defaultPrevented || tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        sceneRef.current?.setTouring(false);
        setFocus((current) => {
          const next = Math.min(4, Math.floor(current + 0.001) + 1);
          setSelected(next);
          return next;
        });
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        sceneRef.current?.setTouring(false);
        setFocus((current) => {
          const next = Math.max(0, Math.ceil(current - 0.001) - 1);
          setSelected(next);
          return next;
        });
      } else if (event.key >= "1" && event.key <= "5") {
        const next = Number(event.key) - 1;
        sceneRef.current?.setTouring(false);
        setFocus(next);
        setSelected(next);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      layoutObserver.disconnect();
      window.removeEventListener("resize", scheduleFrame);
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
    setTouring(false);
    sceneRef.current?.setTouring(false);
    focusRef.current = clamped;
    setFocus(clamped);
    setSelected(clamped);
  }

  function toggleTilt() {
    const next = !tiltOn;
    setTiltOn(next);
    sceneRef.current?.setTiltEnabled(next);
  }

  function toggleTour() {
    const next = !touring;
    setTouring(next);
    sceneRef.current?.setTouring(next);
  }

  function restore() {
    go(0);
    sceneRef.current?.resetView();
  }

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    dragRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /** A vertical flick past the threshold counts as a swipe; the click that follows is ignored. */
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, onSwipe: (up: boolean) => void) {
    const start = dragRef.current;
    dragRef.current = null;
    if (start === null) return;
    const dy = event.clientY - start;
    if (Math.abs(dy) > SWIPE_PX) {
      swipedRef.current = true;
      onSwipe(dy < 0);
    }
  }

  function consumeSwipe(): boolean {
    const swiped = swipedRef.current;
    swipedRef.current = false;
    return swiped;
  }

  function swipeCard(up: boolean) {
    setCard((current) => (up ? "open" : current === "open" ? "default" : "collapsed"));
  }

  const tipSpot = tip?.feature ? SPOTS.find((spot) => spot.name === tip.feature) : null;
  const translatedSpot = tipSpot ? spotText(lang, tipSpot.name) : null;
  const tipTitle = translatedSpot?.name ?? (tip ? layerText(lang, tip.layer).name : "");
  const tipBody = translatedSpot?.blurb ?? (tip ? layerText(lang, tip.layer).summary : "");

  return (
    <div ref={stageRef} className="stage">
      <canvas ref={canvasRef} aria-label={copy.canvas} />
      <div className="scrim" />
      {failed ? (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center px-6" role="alert">
          <div className="pointer-events-auto max-w-xs rounded-xl border border-line bg-elev/90 p-4 text-center">
            <p className="text-sm leading-relaxed text-muted">{copy.webgl}</p>
            <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => window.location.reload()}>
              {copy.reload}
            </button>
          </div>
        </div>
      ) : null}
      <header ref={hudRef} className="hud">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={
                isLatin(lang)
                  ? "text-xs font-medium tracking-widest text-faint uppercase"
                  : "text-xs font-medium tracking-wide text-faint"
              }
            >{copy.kicker}</p>
            <h1 className="mt-1 font-display text-2xl leading-none font-medium tracking-tight sm:text-3xl md:text-4xl">
              {copy.title}
            </h1>
          </div>
          <div className="hud-tools">
            <LangSelect lang={lang} label={copy.language} onChange={setLang} />
            <button
              type="button"
              className="tilt-toggle"
              aria-pressed={tiltOn}
              aria-label={tiltOn ? `${copy.tilt} on` : `${copy.tilt} off`}
              onClick={toggleTilt}
            >
              <span className="tilt-light" aria-hidden="true" />
              {copy.tilt}
            </button>
          </div>
        </div>
        <p className="mt-2 max-w-sm text-sm leading-snug text-muted">{copy.lede}</p>
        <BodyNav active="jupiter" lang={lang} label={bodyNavLabel(lang)} />
        <nav className="hud-links">
          <Link to="/mission" className="faq-link">
            {copy.mission}
          </Link>
          <Link to="/about" className="faq-link">
            {copy.about}
          </Link>
          <Link to="/faq" className="faq-link">
            {copy.faq}
          </Link>
        </nav>
      </header>

      <div ref={earthRef} className="earth-tag">
        <span>{copy.earth}</span>
      </div>

      <div ref={tipRef} className="tip" role="tooltip">
        <p className="text-sm font-medium text-fg">{tipTitle}</p>
        {tipBody ? <p className="mt-1 text-xs leading-snug text-muted">{tipBody}</p> : null}
      </div>

      {card === "collapsed" ? (
        <button
          ref={pillRef}
          type="button"
          className="card-pill phone-only"
          aria-label={copy.showControls}
          aria-expanded={false}
          onPointerDown={startDrag}
          onPointerUp={(event) => endDrag(event, (up) => up && setCard("default"))}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onClick={() => {
            if (!consumeSwipe()) setCard("default");
          }}
        />
      ) : null}

      <aside
        ref={sheetRef}
        className={card === "open" ? "sheet is-open" : card === "collapsed" ? "sheet is-collapsed" : "sheet"}
        aria-label={copy.controls}
        inert={card === "collapsed"}
      >
        <button
          ref={handleRef}
          type="button"
          className="sheet-handle phone-only"
          aria-label={notes ? copy.hideNotes : copy.aboutLayer}
          aria-expanded={notes}
          onPointerDown={startDrag}
          onPointerUp={(event) => endDrag(event, swipeCard)}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onClick={() => {
            if (!consumeSwipe()) setCard(notes ? "default" : "open");
          }}
        />
        <div
          ref={controlsRef}
          className={split.controlsSized ? "sheet-controls is-sized" : "sheet-controls"}
          style={split.controlsStyle}
        >
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
                    <span className="chip-sub text-xs text-faint">{text.radiusLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => go(Math.min(4, Math.floor(focus + 0.001) + 1))}
              disabled={focus >= 4 && !touring}
            >
              {focus >= 4 ? copy.atCenter : copy.peelDeeper}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              aria-pressed={touring}
              onClick={toggleTour}
            >
              {touring ? copy.pauseTour : copy.autoTour}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={restore}
              disabled={focus <= 0 && !touring && !viewMoved}
            >
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
                sceneRef.current?.setTouring(false);
                setFocus(value);
                setSelected(Math.min(4, Math.max(0, Math.round(value))));
              }}
              style={{ "--pct": `${(focus / 4) * 100}%` } as CSSProperties}
            />
          </label>

          <button
            type="button"
            className="btn btn-ghost phone-only mt-1 w-full"
            aria-expanded={notes}
            onClick={() => setCard(notes ? "default" : "open")}
          >
            {notes ? copy.hideNotes : copy.aboutLayer}
          </button>
        </div>

        <div
          ref={splitterRef}
          className={split.dragging ? "splitter is-dragging" : "splitter"}
          aria-label={copy.resizePanels}
          {...split.splitterProps}
        />

        <div className="notes mt-3 border-t border-line pt-3">
          {failed ? (
            <p className="text-sm leading-relaxed text-muted">{copy.webgl}</p>
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
