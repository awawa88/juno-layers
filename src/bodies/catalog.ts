import type { BodyId } from "@/bodies/types";
import { earthConfig } from "@/bodies/configs/earth";
import { marsConfig } from "@/bodies/configs/mars";
import { moonConfig } from "@/bodies/configs/moon";
import { sunConfig } from "@/bodies/configs/sun";
import type { BodyConfig } from "@/bodies/types";

export type HubBody = {
  id: BodyId;
  path: string;
  label: string;
  labelZh: string;
};

/** Hub order: Jupiter home, then terrestrial + Sun peels. */
export const HUB_BODIES: readonly HubBody[] = [
  { id: "jupiter", path: "/", label: "Jupiter", labelZh: "木星" },
  { id: "earth", path: "/earth", label: "Earth", labelZh: "地球" },
  { id: "mars", path: "/mars", label: "Mars", labelZh: "火星" },
  { id: "moon", path: "/moon", label: "Moon", labelZh: "月球" },
  { id: "sun", path: "/sun", label: "Sun", labelZh: "太陽" },
] as const;

export const BODY_CONFIGS: Record<Exclude<BodyId, "jupiter">, BodyConfig> = {
  earth: earthConfig,
  mars: marsConfig,
  moon: moonConfig,
  sun: sunConfig,
};

export function bodyConfig(id: Exclude<BodyId, "jupiter">): BodyConfig {
  return BODY_CONFIGS[id];
}
