import type { LayerId } from "@/jupiter/layers";
import type { ObjectiveId } from "@/jupiter/mission";

export type LayerText = {
  name: string;
  short: string;
  radiusLabel: string;
  summary: string;
  body: string;
  detail: string;
  juno: string;
};

export type SpotText = { name: string; blurb: string };

export type UiText = {
  language: string;
  kicker: string;
  title: string;
  lede: string;
  earth: string;
  peelDeeper: string;
  atCenter: string;
  restore: string;
  autoTour: string;
  pauseTour: string;
  tilt: string;
  tiltOff: string;
  depth: string;
  hideNotes: string;
  aboutLayer: string;
  junoLabel: string;
  footnote: string;
  webgl: string;
  reload: string;
  canvas: string;
  controls: string;
  showControls: string;
  resizePanels: string;
  layers: string;
  faq: string;
  faqTitle: string;
  faqLede: string;
  back: string;
  glanceTitle: string;
  glanceSource: string;
  earthDistanceNote: string;
  about: string;
  aboutLede: string;
  mission: string;
  missionPageLede: string;
  missionTitle: string;
  missionLede: string;
  instrumentLabel: string;
  revealsLabel: string;
  timelineTitle: string;
  exploreLayers: string;
  rotateToPortrait: string;
  rotateToPortraitHint: string;
  rotateToLandscape: string;
  rotateToLandscapeHint: string;
};

export type FaqItem = { q: string; a: string };

export type Fact = { key: string; label: string; value: string };

export type DistanceText = {
  title: string;
  todayLabel: string;
  todayNote: string;
  today: (km: number, au: number, lightMinutes: number) => { value: string; detail: string };
  rows: readonly { label: string; value: string }[];
};

export type ObjectiveText = { title: string; instrument: string; body: string };

export type MilestoneText = { when: string; text: string };

export type MissionText = {
  objectives: Record<ObjectiveId, ObjectiveText>;
  timeline: readonly MilestoneText[];
};

/** Spot keys match the English `name` in `SPOTS`. */
export type Locale = {
  ui: UiText;
  layers: Record<LayerId, LayerText>;
  spots: Record<string, SpotText>;
  faq: readonly FaqItem[];
  facts: readonly Fact[];
  distance: DistanceText;
  mission: MissionText;
};
