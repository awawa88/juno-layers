export type LayerId = "clouds" | "molecular" | "metallic" | "fuzzy" | "nucleus";

export type LayerInfo = {
  id: LayerId;
  index: number;
  name: string;
  short: string;
  radiusLabel: string;
  swatch: string;
  summary: string;
  body: string;
  detail: string;
  juno: string;
};

export const LAYERS: readonly LayerInfo[] = [
  {
    id: "clouds",
    index: 0,
    name: "Cloud deck",
    short: "Ammonia clouds",
    radiusLabel: "Skin at ~1.00 Rⱼ",
    swatch: "#c9844a",
    summary: "Ammonia-ice clouds, jet streams, and the Great Red Spot.",
    body: "The familiar face of Jupiter is weather, not a surface. Ammonia ice forms the visible clouds, tinted by trace chemicals, above deeper decks of ammonium hydrosulfide and water. Pale zones and darker belts wrap the planet in east–west jets.",
    detail:
      "The Great Red Spot is a centuries-old anticyclone, still wider than Earth. The smaller white ovals are storms in the same family.",
    juno: "Juno’s microwave maps show the Spot’s roots run hundreds of kilometers down, not as a shallow stain. The poles hold stable cyclone rings: eight storms around the north, five around the south. Ammonia, a cloud ingredient, is patchy and depleted far deeper than older models expected.",
  },
  {
    id: "molecular",
    index: 1,
    name: "Molecular hydrogen",
    short: "H₂ and helium",
    radiusLabel: "Down to ~0.85 Rⱼ",
    swatch: "#d2c0a0",
    summary: "A deep envelope of hydrogen and helium. There is no hard surface.",
    body: "Beneath the clouds, Jupiter is mostly hydrogen, with about a quarter of its mass in helium. Gas thickens smoothly into a hot, dense fluid. Pressures rise from one Earth atmosphere at the clouds toward a million atmospheres, where hydrogen starts to change.",
    detail:
      "This layer is still molecular — paired hydrogen atoms — and it is thousands of kilometers deep. The quiet color here is the envelope with the weather peeled off.",
    juno: "The Galileo probe found helium and neon a little short of solar proportions, a sign that helium condenses and rains into the interior. Juno’s gravity field shows the east–west winds themselves continue downward for roughly 3,000 km.",
  },
  {
    id: "metallic",
    index: 2,
    name: "Metallic hydrogen",
    short: "The dynamo",
    radiusLabel: "Below ~0.85 Rⱼ",
    swatch: "#e07a3c",
    summary: "Hydrogen squeezed into an electrically conducting fluid.",
    body: "Near a million Earth-atmospheres, hydrogen behaves as a liquid metal: protons in a sea of free electrons. It conducts electricity. Stirred by interior heat and Jupiter’s spin of just under ten hours, that fluid generates the strongest planetary magnetic field in the solar system.",
    detail:
      "The change is probably gradual, not a cliff. The glow is a stand-in for heat and conductivity — no spacecraft has seen this layer. Pale curves are a sketch of the field, tilted and stronger in the north.",
    juno: "Juno’s magnetometer found a lumpy, north–south asymmetric field, including a strong northern patch. The dynamo likely runs in this outer metallic region, closer to the clouds than a tidy deep bar magnet would.",
  },
  {
    id: "fuzzy",
    index: 3,
    name: "Dilute core",
    short: "Fuzzy, not a marble",
    radiusLabel: "Mixed through the inner half",
    swatch: "#8d7060",
    summary: "Rock, metal, and ice blended into hydrogen. No sharp edge.",
    body: "Before Juno, textbooks drew a compact ball of rock and ice with a crisp boundary. The gravity data prefer a dilute, “fuzzy” core: heavy elements mixed with hydrogen and spread through a large central region. The blend fades outward. There is nothing clean to peel.",
    detail:
      "Jupiter may hold tens of Earth masses of elements heavier than helium. They are smeared through the interior, not packed into a small seed. The mottled, soft edge is deliberate.",
    juno: "Tiny Doppler shifts in Juno’s radio signal became a map of the gravity field. A compact core fits those harmonics poorly. A giant impact early in Jupiter’s life, or billions of years of the core dissolving into metallic hydrogen, could have done the mixing. Both are still open.",
  },
  {
    id: "nucleus",
    index: 4,
    name: "Denser center",
    short: "Possible, and small",
    radiusLabel: "If real, ≲ 0.15 Rⱼ",
    swatch: "#6a4b3c",
    summary: "A tighter knot some models still allow inside the fuzzy core.",
    body: "A few interior models keep a denser remnant inside the dilute region — a tighter mix of rock and metal, only a modest fraction of the radius, if it is there at all. Any boundary would be blurred. It is drawn small and soft on purpose.",
    detail:
      "This is the most uncertain layer in the model. Treat it as a hypothesis you can look at, not as a discovery.",
    juno: "Juno does not require a compact inner core, and it does not fully rule one out. The solid result is the one around it: the center is dilute, extended, and mixed.",
  },
];

export type SpotKind = "grs" | "oval" | "storm";

export type Spot = {
  name: string;
  blurb: string;
  lon: number;
  lat: number;
  rx: number;
  ry: number;
  kind: SpotKind;
};

/** Longitudes match the cloud shader: 0 at +X, π/2 on the face toward +Z. */
export const SPOTS: readonly Spot[] = [
  {
    name: "Great Red Spot",
    blurb: "Anticyclone, wider than Earth, with roots hundreds of kilometers deep.",
    lon: Math.PI / 2 - 0.18,
    lat: -0.36,
    rx: 0.5,
    ry: 0.23,
    kind: "grs",
  },
  {
    name: "White oval",
    blurb: "A smaller anticyclone in the southern hemisphere.",
    lon: Math.PI / 2 + 1.05,
    lat: -0.55,
    rx: 0.18,
    ry: 0.11,
    kind: "oval",
  },
  {
    name: "Northern storm",
    blurb: "One of many oval storms riding the temperate belts.",
    lon: Math.PI / 2 - 1.2,
    lat: 0.32,
    rx: 0.15,
    ry: 0.1,
    kind: "storm",
  },
];

export function spotAt(lon: number, lat: number): Spot | null {
  for (const spot of SPOTS) {
    const dlon = Math.atan2(Math.sin(lon - spot.lon), Math.cos(lon - spot.lon));
    const e = Math.hypot(dlon / spot.rx, (lat - spot.lat) / spot.ry);
    if (e < 0.98) return spot;
  }
  return null;
}
