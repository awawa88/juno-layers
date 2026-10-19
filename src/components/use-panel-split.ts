import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

const STORAGE_KEY = "juno-panel-split";
const MIN_CONTROLS = 120;
const MIN_NOTES = 140;
const KEY_STEP = 16;
const DOUBLE_TAP_MS = 320;
const TAP_SLOP = 6;

type Bounds = { avail: number; min: number; max: number };

/**
 * Draggable divider between the side panel's controls and its notes.
 * The split is stored as a share of the free height so it survives resizes and rotation;
 * `null` means "natural": controls take their content height and notes get the rest.
 */
export function usePanelSplit(
  sheetRef: RefObject<HTMLElement | null>,
  controlsRef: RefObject<HTMLElement | null>,
  splitterRef: RefObject<HTMLElement | null>,
) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [percent, setPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const ratioRef = useRef<number | null>(null);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);

  const bounds = useCallback((): Bounds | null => {
    const sheet = sheetRef.current;
    const controls = controlsRef.current;
    const splitter = splitterRef.current;
    if (!sheet || !controls || !splitter || splitter.offsetParent === null) return null;
    const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    const avail = sheet.getBoundingClientRect().bottom - pad - controls.getBoundingClientRect().top - splitter.offsetHeight;
    if (avail <= 0) return null;
    // Never taller than the controls' own content, so dragging down can't open an empty gap.
    let content = 0;
    for (const child of Array.from(controls.children) as HTMLElement[]) {
      if (child.offsetParent !== null) content = Math.max(content, child.offsetTop + child.offsetHeight);
    }
    content = content - controls.offsetTop + (parseFloat(getComputedStyle(controls).paddingBottom) || 0) + 4;
    const max = Math.max(MIN_CONTROLS, Math.min(avail - MIN_NOTES, content));
    return { avail, min: Math.min(MIN_CONTROLS, max), max };
  }, [sheetRef, controlsRef, splitterRef]);

  const apply = useCallback(() => {
    const b = bounds();
    if (!b) return;
    const current = ratioRef.current;
    if (current === null) {
      setHeight(null);
      const natural = controlsRef.current?.offsetHeight ?? b.min;
      setPercent(Math.round((Math.min(natural, b.max) / b.avail) * 100));
      return;
    }
    const next = Math.min(b.max, Math.max(b.min, current * b.avail));
    setHeight(next);
    setPercent(Math.round((next / b.avail) * 100));
  }, [bounds, controlsRef]);

  const commit = useCallback(
    (next: number | null) => {
      ratioRef.current = next;
      setRatio(next);
      try {
        if (next === null) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, next.toFixed(4));
      } catch {
        // Storage can be unavailable (private mode); the split still works for this visit.
      }
    },
    [],
  );

  const setPx = useCallback(
    (px: number) => {
      const b = bounds();
      if (!b) return;
      commit(Math.min(b.max, Math.max(b.min, px)) / b.avail);
    },
    [bounds, commit],
  );

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (stored > 0 && stored < 1) {
        ratioRef.current = stored;
        setRatio(stored);
      }
    } catch {
      // Ignore unreadable storage.
    }
  }, []);

  useEffect(() => {
    apply();
    const sheet = sheetRef.current;
    if (!sheet) return;
    const observer = new ResizeObserver(() => apply());
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [ratio, apply, sheetRef]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const controls = controlsRef.current;
    if (!controls || event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startH: controls.offsetHeight, moved: false };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const controls = controlsRef.current;
    const b = bounds();
    if (!state || !controls || !b) return;
    const dy = event.clientY - state.startY;
    if (Math.abs(dy) > TAP_SLOP) state.moved = true;
    const next = Math.min(b.max, Math.max(b.min, state.startH + dy));
    // Write straight to the element while dragging; React state catches up on release.
    controls.style.height = `${next}px`;
    controls.classList.add("is-sized");
    setPercent(Math.round((next / b.avail) * 100));
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    drag.current = null;
    setDragging(false);
    if (!state) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (state.moved) {
      lastTap.current = 0;
      setPx(controlsRef.current?.offsetHeight ?? state.startH);
      return;
    }
    // Double-tap / double-click resets; works for touch, where dblclick is unreliable.
    const now = performance.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      controlsRef.current?.style.removeProperty("height");
      commit(null);
    } else {
      lastTap.current = now;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const b = bounds();
    const controls = controlsRef.current;
    if (!b || !controls) return;
    const current = controls.offsetHeight;
    const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    let next: number | null | undefined;
    if (event.key === "ArrowUp") next = current - step;
    else if (event.key === "ArrowDown") next = current + step;
    else if (event.key === "Home") next = b.min;
    else if (event.key === "End") next = b.max;
    else if (event.key === "Enter" || event.key === "Escape") next = null;
    if (next === undefined) return;
    event.preventDefault();
    if (next === null) commit(null);
    else setPx(next);
  };

  const b = bounds();
  return {
    controlsStyle: height === null ? undefined : { height: `${height}px` },
    controlsSized: height !== null,
    dragging,
    splitterProps: {
      role: "separator" as const,
      tabIndex: 0,
      "aria-orientation": "horizontal" as const,
      "aria-valuemin": b ? Math.round((b.min / b.avail) * 100) : 0,
      "aria-valuemax": b ? Math.round((b.max / b.avail) * 100) : 100,
      "aria-valuenow": percent,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
    },
  };
}
