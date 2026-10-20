import { BODY_CONFIGS } from "@/bodies/catalog";
import type { BodyId } from "@/bodies/types";
import type { BodyLocale } from "@/bodies/types";

/** zh-Hant stubs mirroring EN structure — Expand drops final copy later. */
function stubLayers(id: Exclude<BodyId, "jupiter">) {
  const cfg = BODY_CONFIGS[id];
  return Object.fromEntries(
    cfg.layers.map((l) => [
      l.id,
      {
        name: `【繁中待補】${l.name}`,
        short: `【待補】${l.short}`,
        radiusLabel: `【待補】${l.radiusLabel}`,
        summary: `【繁中待補】${l.summary}`,
        body: `【繁中待補】${l.body}`,
        detail: `【繁中待補】${l.detail}`,
        juno: `【繁中待補】${l.juno}`,
      },
    ]),
  );
}

const sharedUi = {
  language: "語言",
  peelDeeper: "再往內一層",
  atCenter: "已到中心",
  restore: "復原",
  autoTour: "自動導覽",
  pauseTour: "暫停",
  tilt: "3D",
  depth: "剖視深度",
  hideNotes: "收起說明",
  aboutLayer: "本層說明",
  webgl: "此畫面需要 WebGL，目前無法使用。",
  reload: "重新載入立體畫面",
  controls: "分層控制",
  showControls: "顯示分層控制",
  resizePanels: "調整分層控制與說明面板大小",
  layers: "內部各層（由外至內）",
  faq: "常見問題",
  about: "關於",
  mission: "任務",
  bodies: "天體",
} as const;

export const bodyLocalesZhHant: Record<Exclude<BodyId, "jupiter">, BodyLocale> = {
  earth: {
    ui: {
      ...sharedUi,
      kicker: "課堂示意內部結構",
      title: "地球分層",
      lede: "【繁中待補】以示意模型剖視地球：大氣、地殼、地幔、外核與內核。",
      junoLabel: "地震學：",
      footnote: "【繁中待補】文案由 Juno Expand 稍後補上。各層厚度已誇大以便剖視。",
      canvas: "可互動的地球模型。拖曳環繞；輕觸外殼即可剝開。",
    },
    layers: stubLayers("earth"),
  },
  mars: {
    ui: {
      ...sharedUi,
      kicker: "課堂示意內部結構",
      title: "火星分層",
      lede: "【繁中待補】以示意模型剖視火星。",
      junoLabel: "InSight：",
      footnote: "【繁中待補】文案由 Juno Expand 稍後補上。",
      canvas: "可互動的火星模型。拖曳環繞；輕觸外殼即可剝開。",
    },
    layers: stubLayers("mars"),
  },
  moon: {
    ui: {
      ...sharedUi,
      kicker: "課堂示意內部結構",
      title: "月球分層",
      lede: "【繁中待補】以示意模型剖視月球。",
      junoLabel: "阿波羅：",
      footnote: "【繁中待補】文案由 Juno Expand 稍後補上。",
      canvas: "可互動的月球模型。拖曳環繞；輕觸外殼即可剝開。",
    },
    layers: stubLayers("moon"),
  },
  sun: {
    ui: {
      ...sharedUi,
      kicker: "課堂示意內部結構",
      title: "太陽分層",
      lede: "【繁中待補】由光球向內剖視太陽；沒有固態地表。",
      junoLabel: "日震學：",
      footnote: "【繁中待補】文案由 Juno Expand 稍後補上。外層為光球，並非固態地面。",
      canvas: "可互動的太陽模型。拖曳環繞；輕觸外殼即可剝開。沒有固態地表。",
    },
    layers: stubLayers("sun"),
  },
};
