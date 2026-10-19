import { useEffect, useRef, useState } from "react";
import { LAYERS, SPOTS } from "@/jupiter/layers";
import { en } from "@/jupiter/locales/en";
import { es } from "@/jupiter/locales/es";
import { fr } from "@/jupiter/locales/fr";
import { ja } from "@/jupiter/locales/ja";
import { ko } from "@/jupiter/locales/ko";
import { zhHans } from "@/jupiter/locales/zh-Hans";
import { zhHant } from "@/jupiter/locales/zh-Hant";
import type {
  DistanceText,
  Fact,
  FaqItem,
  LayerText,
  Locale,
  MissionText,
  SpotText,
  UiText,
} from "@/jupiter/locales/types";

export type { DistanceText, Fact, FaqItem, LayerText, MissionText, SpotText, UiText };

export const LANGS = [
  { code: "en", native: "English", latin: true },
  { code: "zh-Hant", native: "繁體中文", latin: false },
  { code: "zh-Hans", native: "简体中文", latin: false },
  { code: "ja", native: "日本語", latin: false },
  { code: "ko", native: "한국어", latin: false },
  { code: "es", native: "Español", latin: true },
  { code: "fr", native: "Français", latin: true },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

const LOCALES: Record<Lang, Locale> = {
  en,
  "zh-Hant": zhHant,
  "zh-Hans": zhHans,
  ja,
  ko,
  es,
  fr,
};

const STORAGE_KEY = "juno-lang";

function isLang(value: string | null): value is Lang {
  return LANGS.some((item) => item.code === value);
}

/** Latin-script languages get the uppercase, wide-tracked kicker style. */
export function isLatin(lang: Lang): boolean {
  return LANGS.find((item) => item.code === lang)?.latin ?? true;
}

function browserLang(): Lang | null {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const lower = tag.toLowerCase();
    if (lower.startsWith("zh")) {
      return /hant|-tw|-hk|-mo/.test(lower) ? "zh-Hant" : "zh-Hans";
    }
    const base = lower.split("-")[0];
    if (isLang(base)) return base;
  }
  return null;
}

export function uiText(lang: Lang): UiText {
  return LOCALES[lang].ui;
}

export function layerText(lang: Lang, index: number): LayerText {
  const layer = LAYERS[index] ?? LAYERS[0];
  return LOCALES[lang].layers[layer.id];
}

export function spotText(lang: Lang, name: string): SpotText | null {
  const spot = SPOTS.find((item) => item.name === name);
  if (!spot) return null;
  return LOCALES[lang].spots[spot.name] ?? { name: spot.name, blurb: spot.blurb };
}

export function faqItems(lang: Lang): readonly FaqItem[] {
  return LOCALES[lang].faq;
}

export function factItems(lang: Lang): readonly Fact[] {
  return LOCALES[lang].facts;
}

export function missionText(lang: Lang): MissionText {
  return LOCALES[lang].mission;
}

export function distanceText(lang: Lang): DistanceText {
  return LOCALES[lang].distance;
}

export function useLang() {
  const [lang, setLang] = useState<Lang>("en");
  const skipSave = useRef(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial = isLang(stored) ? stored : browserLang();
    if (initial) setLang(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  return [lang, setLang] as const;
}
