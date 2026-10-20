import type { BodyId } from "@/bodies/types";
import type { BodyLocale, BodyLocaleLayer, BodyUiText } from "@/bodies/types";
import { bodyLocalesEn } from "@/bodies/locales/en";
import { bodyLocalesZhHant } from "@/bodies/locales/zh-Hant";
import { BODY_CONFIGS } from "@/bodies/catalog";
import { LANGS, isLatin, useLang, type Lang } from "@/jupiter/i18n";

export { LANGS, isLatin, useLang, type Lang };

function localeFor(body: Exclude<BodyId, "jupiter">, lang: Lang): BodyLocale {
  // Full body locales: en + zh-Hant stubs. Other langs fall back to EN placeholders for now.
  if (lang === "zh-Hant" || lang === "zh-Hans") return bodyLocalesZhHant[body];
  return bodyLocalesEn[body];
}

export function bodyUiText(body: Exclude<BodyId, "jupiter">, lang: Lang): BodyUiText {
  return localeFor(body, lang).ui;
}

export function bodyLayerText(
  body: Exclude<BodyId, "jupiter">,
  lang: Lang,
  index: number,
): BodyLocaleLayer {
  const cfg = BODY_CONFIGS[body];
  const id = cfg.layers[Math.min(cfg.layers.length - 1, Math.max(0, index))]?.id;
  const layers = localeFor(body, lang).layers;
  if (id && layers[id]) return layers[id]!;
  return Object.values(layers)[0]!;
}

export function bodyLayerMeta(body: Exclude<BodyId, "jupiter">) {
  return BODY_CONFIGS[body].layers;
}

export function bodyMaxLayer(body: Exclude<BodyId, "jupiter">): number {
  return Math.max(0, BODY_CONFIGS[body].layers.length - 1);
}
