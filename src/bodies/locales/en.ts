import { BODY_CONFIGS } from "@/bodies/catalog";
import type { BodyId } from "@/bodies/types";
import type { BodyLocale } from "@/bodies/types";

function layersFrom(id: Exclude<BodyId, "jupiter">) {
  const cfg = BODY_CONFIGS[id];
  return Object.fromEntries(
    cfg.layers.map((l) => [
      l.id,
      {
        name: l.name,
        short: l.short,
        radiusLabel: l.radiusLabel,
        summary: l.summary,
        body: l.body,
        detail: l.detail,
        juno: l.juno,
      },
    ]),
  );
}

const sharedUi = {
  language: "Language",
  peelDeeper: "Peel deeper",
  atCenter: "At the center",
  restore: "Restore",
  autoTour: "Auto tour",
  pauseTour: "Pause",
  tilt: "3D",
  depth: "Peel depth",
  hideNotes: "Hide notes",
  aboutLayer: "About this layer",
  webgl: "This view needs WebGL, which isn’t available right now.",
  reload: "Reload the 3D view",
  controls: "Layer controls",
  showControls: "Show layer controls",
  resizePanels: "Resize layer controls and notes",
  layers: "Interior layers (outside → in)",
  faq: "FAQ",
  about: "About",
  mission: "Mission",
  bodies: "Bodies",
} as const;

export const bodyLocalesEn: Record<Exclude<BodyId, "jupiter">, BodyLocale> = {
  earth: {
    ui: {
      ...sharedUi,
      kicker: BODY_CONFIGS.earth.kicker,
      title: "Earth Layers",
      lede: BODY_CONFIGS.earth.lede,
      junoLabel: BODY_CONFIGS.earth.missionLabel,
      footnote: BODY_CONFIGS.earth.footnote,
      canvas: "Interactive Earth. Drag to orbit. Tap a shell to peel it.",
    },
    layers: layersFrom("earth"),
  },
  mars: {
    ui: {
      ...sharedUi,
      kicker: BODY_CONFIGS.mars.kicker,
      title: "Mars Layers",
      lede: BODY_CONFIGS.mars.lede,
      junoLabel: BODY_CONFIGS.mars.missionLabel,
      footnote: BODY_CONFIGS.mars.footnote,
      canvas: "Interactive Mars. Drag to orbit. Tap a shell to peel it.",
    },
    layers: layersFrom("mars"),
  },
  moon: {
    ui: {
      ...sharedUi,
      kicker: BODY_CONFIGS.moon.kicker,
      title: "Moon Layers",
      lede: BODY_CONFIGS.moon.lede,
      junoLabel: BODY_CONFIGS.moon.missionLabel,
      footnote: BODY_CONFIGS.moon.footnote,
      canvas: "Interactive Moon. Drag to orbit. Tap a shell to peel it.",
    },
    layers: layersFrom("moon"),
  },
  sun: {
    ui: {
      ...sharedUi,
      kicker: BODY_CONFIGS.sun.kicker,
      title: "Sun Layers",
      lede: BODY_CONFIGS.sun.lede,
      junoLabel: BODY_CONFIGS.sun.missionLabel,
      footnote: BODY_CONFIGS.sun.footnote,
      canvas: "Interactive Sun. Drag to orbit. Tap a shell to peel it. No solid surface.",
    },
    layers: layersFrom("sun"),
  },
};
