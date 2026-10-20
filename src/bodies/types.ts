/** Shared peel-body types. Layer `juno` key kept for Expand copy drop-in; UI label is body-specific. */

export type BodyId = "jupiter" | "earth" | "mars" | "moon" | "sun";

export type LayerDef = {
  id: string;
  index: number;
  /** Outer radius in scene units (OUTER ≈ 2.0 for all bodies). */
  radius: number;
  /** Inner radius for cutaway section; omit for solid innermost core. */
  innerRadius?: number;
  /** Hex swatch for chips / Expand alignment. */
  swatch: string;
  /** Section-cut inner/outer RGB 0–1. */
  innerCol: [number, number, number];
  outerCol: [number, number, number];
  emis?: number;
  /** Semi-transparent outer shell (atmosphere / photosphere glow). */
  transparent?: boolean;
  /** English LayerInfo placeholders — Expand replaces later. */
  name: string;
  short: string;
  radiusLabel: string;
  summary: string;
  body: string;
  detail: string;
  /** Mission/science note. Key name stays `juno` for Expand compatibility. */
  juno: string;
};

export type SurfaceKind = "texture" | "procedural-sun" | "solid";

export type BodyConfig = {
  id: Exclude<BodyId, "jupiter">;
  /** Short display name (EN). */
  name: string;
  /** Route path without leading slash. */
  path: string;
  /** Axial flattening (polar/equatorial). 1 = sphere. */
  flatten: number;
  /** Outer framing radius (usually largest layer radius). */
  outer: number;
  /** Frame radii per peel depth for camera dolly. */
  frameRadii: readonly number[];
  layers: readonly LayerDef[];
  /** How the outermost opaque shell is shaded. */
  surface: SurfaceKind;
  /** public/textures URL for albedo; ignored for procedural-sun. */
  textureUrl?: string;
  textureUrlMobile?: string;
  /** Layer index that receives the albedo map (usually crust or photosphere). */
  surfaceLayerIndex: number;
  /** Mission-note UI label (EN placeholder). */
  missionLabel: string;
  /** Kicker above the title. */
  kicker: string;
  lede: string;
  footnote: string;
  /** Orientation / 3D still uses shared gate; no companion Earth marker. */
  showCompanionTag?: boolean;
};

export type BodyLocaleLayer = {
  name: string;
  short: string;
  radiusLabel: string;
  summary: string;
  body: string;
  detail: string;
  juno: string;
};

export type BodyUiText = {
  language: string;
  kicker: string;
  title: string;
  lede: string;
  peelDeeper: string;
  atCenter: string;
  restore: string;
  autoTour: string;
  pauseTour: string;
  tilt: string;
  depth: string;
  hideNotes: string;
  aboutLayer: string;
  /** Body-specific mission label, e.g. "Seismic. " / "InSight. " */
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
  about: string;
  mission: string;
  bodies: string;
};

export type BodyLocale = {
  ui: BodyUiText;
  layers: Record<string, BodyLocaleLayer>;
};
