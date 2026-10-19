import type { LayerId } from "@/jupiter/layers";

export type ObjectiveId = "origin" | "interior" | "magnetic" | "atmosphere" | "magnetosphere";

export type Objective = {
  id: ObjectiveId;
  /** Interior layers this objective helps reveal, outside to inside. */
  layers: readonly LayerId[];
};

export const OBJECTIVES: readonly Objective[] = [
  { id: "interior", layers: ["molecular", "fuzzy", "nucleus"] },
  { id: "magnetic", layers: ["metallic"] },
  { id: "atmosphere", layers: ["clouds", "molecular"] },
  { id: "origin", layers: ["clouds", "fuzzy"] },
  { id: "magnetosphere", layers: ["clouds", "metallic"] },
];
