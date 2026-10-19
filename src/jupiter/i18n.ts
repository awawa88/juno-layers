import { useEffect, useRef, useState } from "react";
import { LAYERS, SPOTS, type LayerId } from "@/jupiter/layers";

export type Lang = "en" | "zh-Hant";

export type LayerText = {
  name: string;
  short: string;
  radiusLabel: string;
  summary: string;
  body: string;
  detail: string;
  juno: string;
};

export type UiText = {
  language: string;
  kicker: string;
  title: string;
  lede: string;
  earth: string;
  peelDeeper: string;
  atCenter: string;
  restore: string;
  depth: string;
  hideNotes: string;
  aboutLayer: string;
  junoLabel: string;
  footnote: string;
  webgl: string;
  canvas: string;
  controls: string;
  layers: string;
  faq: string;
  faqTitle: string;
  faqLede: string;
  back: string;
  hint: string;
  keysHint: string;
  inspectLabel: string;
  clearInspect: string;
  orbitHint: string;
};

const ZH_LAYERS: Record<LayerId, LayerText> = {
  clouds: {
    name: "雲層",
    short: "氨冰雲",
    radiusLabel: "表面，約 1.00 Rⱼ",
    summary: "氨冰雲、噴流，以及大紅斑。",
    body: "我們熟悉的木星面貌是天氣，不是地表。氨冰結成看得見的雲，被微量化學物質染上顏色；更深處還有氫硫化銨和水的雲層。淺色的區與深色的帶，以東西向的噴流繞著整顆行星。",
    detail: "大紅斑是持續了數百年的反氣旋，至今仍比地球寬。較小的白卵斑，是同一類的風暴。",
    juno: "朱諾號的微波觀測顯示，大紅斑的根伸入數百公里深處，不是浮在表面的一塊污漬。兩極各有一圈穩定的氣旋：北極八個，南極五個。作為成雲的原料，氨的分布並不均勻，而且在比舊模型預期更深的地方就已經耗盡。",
  },
  molecular: {
    name: "分子氫",
    short: "氫分子與氦",
    radiusLabel: "深至約 0.85 Rⱼ",
    summary: "深厚的氫與氦包層。沒有堅硬的地表。",
    body: "雲層之下，木星大部分是氫，質量約有四分之一是氦。氣體平順地變厚，成為熾熱而稠密的流體。氣壓從雲頂的一個地球大氣壓，升到約一百萬個大氣壓，氫才開始改變。",
    detail: "這一層仍是分子態——氫原子兩兩成對——厚達數千公里。這裡沉靜的顏色，是剝掉天氣之後的包層。",
    juno: "伽利略號探測器發現氦和氖比太陽的比例略少，表示氦會凝結，再向內部沉降。朱諾號測到的重力場則顯示，東西向的風本身會往下延伸大約 3,000 公里。",
  },
  metallic: {
    name: "金屬氫",
    short: "發電機層",
    radiusLabel: "約 0.85 Rⱼ 以內",
    summary: "被壓成可以導電的氫流體。",
    body: "接近一百萬個地球大氣壓時，氫表現得像液態金屬：質子浸在自由電子裡，能夠導電。內部的熱，加上木星不到十小時轉一圈的自轉，攪動這層流體，產生太陽系最強的行星磁場。",
    detail: "這個轉變大概是漸漸發生的，不是一道斷崖。光暈只是在表示熱和導電——沒有太空船見過這一層。淺色曲線是磁場的草圖：略為傾斜，而且北半球更強。",
    juno: "朱諾號的磁力計發現磁場凹凸不平，南北並不對稱，北半球還有一塊特別強的區域。發電的過程很可能就在這層靠外的金屬氫裡，比一枚埋得很深的條形磁鐵更靠近雲頂。",
  },
  fuzzy: {
    name: "稀釋核心",
    short: "模糊，不是一顆彈珠",
    radiusLabel: "混在內半部",
    summary: "岩石、金屬和冰混進氫裡。沒有清晰的邊界。",
    body: "朱諾號之前，教科書畫的是一顆密實的岩石與冰球，邊界分明。重力數據更支持一個稀釋的「模糊」核心：比氫重的元素與氫混合，鋪在廣大的中心區域裡，向外漸漸淡去。沒有一道乾淨的界面可以剝開。",
    detail: "木星裡比氦更重的元素，可能相當於數十個地球的質量。它們塗開在內部，而不是擠成一顆小核。斑駁、柔邊是故意畫成這樣的。",
    juno: "朱諾號無線電裡極小的多普勒偏移，被做成一幅重力場的地圖。密實核心配不上這些重力諧波。木星很早的一次巨大撞擊，或者數十億年來核心溶進金屬氫，都可能造成這種混合。兩種說法都還沒有定論。",
  },
  nucleus: {
    name: "較密的中心",
    short: "也許有，而且很小",
    radiusLabel: "若存在，≲ 0.15 Rⱼ",
    summary: "有些模型仍允許模糊核心裡留著一塊更緊的核。",
    body: "少數內部模型在稀釋區裡留著一塊較密的殘餘：岩石和金屬混得更緊，半徑只佔不大的一部分，而且也可能根本不存在。就算有邊界，也會是糊的。這裡故意畫得又小又柔。",
    detail: "這是模型裡最不確定的一層。把它當成可以看一看的假說，不是一項發現。",
    juno: "朱諾號並不要求一顆密實的內核，也沒有完全排除它。已經站得住的，是包在外面的那一層：中心是稀釋的、攤開的、混在一起的。",
  },
};

const ZH_SPOTS: Record<string, { name: string; blurb: string }> = {
  "Great Red Spot": {
    name: "大紅斑",
    blurb: "反氣旋，比地球還寬，根部深達數百公里。",
  },
  "White oval": {
    name: "白卵斑",
    blurb: "南半球一個較小的反氣旋。",
  },
  "Northern storm": {
    name: "北半球風暴",
    blurb: "許多沿著溫帶雲帶走的卵形風暴之一。",
  },
};

const UI: Record<Lang, UiText> = {
  en: {
    language: "Language",
    kicker: "From the Juno mission",
    title: "Juno Layers",
    lede: "Peel a stylized Jupiter. The dilute core was the surprise.",
    earth: "Earth, to scale",
    peelDeeper: "Peel deeper",
    atCenter: "At the center",
    restore: "Restore",
    depth: "Peel depth",
    hideNotes: "Hide notes",
    aboutLayer: "About this layer",
    junoLabel: "Juno. ",
    footnote:
      "Tap a shell to peel it; tap the Great Red Spot (or another storm) to inspect it. Drag to orbit, pinch or scroll to zoom. Sizes are exaggerated so each zone stays visible — real cloud decks are a thin skin, and the interior boundaries are gradual. Not a numerical model.",
    webgl: "This view needs WebGL, which isn’t available right now.",
    canvas: "Interactive Jupiter. Drag to orbit. Tap a shell to peel it.",
    controls: "Layer controls",
    layers: "Interior layers, outside to inside",
    faq: "FAQ",
    faqTitle: "FAQ",
    faqLede: "Short answers about the model, and about Jupiter.",
    back: "Back to Jupiter",
    hint: "Drag to orbit · Scroll to zoom · Tap a shell to peel",
    keysHint: "Keys: ← → peel · 1–5 jump · R restore · Space peel deeper",
    inspectLabel: "Storm",
    clearInspect: "Clear",
    orbitHint: "Grab and drag the planet",
  },
  "zh-Hant": {
    language: "語言",
    kicker: "來自朱諾號",
    title: "木星內層",
    lede: "一層層剝開這顆木星。稀釋核心，是這次任務的意外。",
    earth: "地球，按比例",
    peelDeeper: "再剝一層",
    atCenter: "已到中心",
    restore: "復原",
    depth: "剝開深度",
    hideNotes: "收起說明",
    aboutLayer: "這一層",
    junoLabel: "朱諾號。",
    footnote:
      "點按外殼可剝開；點按大紅斑或其他風暴可檢視。拖曳以環繞，雙指或滾輪可縮放。各層尺寸有所誇大，好讓每一區都看得見——真實的雲層只是薄薄一層皮，內部邊界也是漸漸過渡的。這不是數值模型。",
    webgl: "這個畫面需要 WebGL，目前無法使用。",
    canvas: "可互動的木星。拖曳以環繞，點按外殼即可剝開。",
    controls: "層次控制",
    layers: "內部層次，由外到內",
    faq: "常見問題",
    faqTitle: "常見問題",
    faqLede: "關於這個模型，以及木星本身。",
    back: "回到木星",
    hint: "拖曳環繞 · 滾輪縮放 · 點按外殼剝開",
    keysHint: "鍵盤：← → 剝層 · 1–5 跳層 · R 復原 · 空白鍵再剝",
    inspectLabel: "風暴",
    clearInspect: "清除",
    orbitHint: "抓住行星拖曳",
  },
};

export function uiText(lang: Lang): UiText {
  return UI[lang];
}

export function layerText(lang: Lang, index: number): LayerText {
  const layer = LAYERS[index] ?? LAYERS[0];
  if (lang === "en") return layer;
  return ZH_LAYERS[layer.id];
}

export function spotText(lang: Lang, name: string): { name: string; blurb: string } | null {
  const spot = SPOTS.find((item) => item.name === name);
  if (!spot) return null;
  if (lang === "en") return { name: spot.name, blurb: spot.blurb };
  return ZH_SPOTS[spot.name] ?? { name: spot.name, blurb: spot.blurb };
}

export type FaqItem = { q: string; a: string };

const FAQ: Record<Lang, readonly FaqItem[]> = {
  en: [
    {
      q: "Could people land there in a Starship?",
      a: "No. There is nothing to land on. The clouds thicken into hot fluid, and a ship would be crushed and melted long before any core. NASA’s Galileo probe, built to fall in, was destroyed after about an hour, only a short way down. Starship is made for Earth, the Moon, and Mars, where there is ground. Jupiter’s radiation would also be far beyond what a crew, or that ship, is built for. Orbit or a flyby is the visit. A landing is not.",
    },
    {
      q: "Why does the storm look like an eye?",
      a: "That is the traditional look of the Great Red Spot: a red oval with a paler center and spiral arms, the shape people mean by an eye storm. It is still a storm, an anticyclone wider than Earth. The model raises it a little and draws the collar and the threads so it reads as that familiar vortex, not a flat sticker.",
    },
    {
      q: "Is the dark middle a pupil?",
      a: "No. There is no black pupil and no catchlight. The middle is a lighter salmon core inside brick-red cloud, with cream-colored threads winding around it. A cartoon eye would be the wrong picture. Jupiter’s spot is weather.",
    },
    {
      q: "Is there Traditional Chinese?",
      a: "Yes. The EN / 繁 switch is on the planet and on this page. It covers the layer names, the notes, the storm labels, and these questions. The choice is remembered next time.",
    },
    {
      q: "Is the inside real?",
      a: "No spacecraft has seen it. The outside is a stylized cloud deck. Under that, the layers follow the picture Juno’s gravity and magnetic measurements prefer: a deep hydrogen envelope, metallic hydrogen, and a dilute core. The glow and the field lines are illustrations, not photographs.",
    },
    {
      q: "What is the dilute core?",
      a: "Before Juno, many textbooks drew a compact ball of rock and ice with a sharp edge. The gravity field fits better if heavy elements are mixed with hydrogen and spread through a large central region. The blend fades outward. There is no clean boundary to peel, which is why that layer looks mottled and soft.",
    },
    {
      q: "Is the Great Red Spot on a surface?",
      a: "No. Jupiter has no solid surface. The Spot is a storm that has lasted for centuries. Juno’s microwave maps show its roots run hundreds of kilometers down into the weather, not as a stain on a crust.",
    },
    {
      q: "What is metallic hydrogen?",
      a: "Near a million Earth atmospheres, hydrogen behaves as a liquid metal. Protons sit in a sea of free electrons, so the fluid conducts electricity. Interior heat and a spin of just under ten hours stir it, and that motion generates the strongest planetary magnetic field in the solar system. The change from molecular hydrogen is probably gradual.",
    },
    {
      q: "Why is there a small dense center?",
      a: "It is a hypothesis, drawn small on purpose. A few models still allow a tighter mix of rock and metal inside the fuzzy region, only a modest fraction of the radius, if it is there at all. Juno does not require a compact inner core, and it does not fully rule one out. The solid result is the dilute core around it.",
    },
    {
      q: "How do I look inside?",
      a: "Tap a shell, pick a layer, or drag the peel slider. Tap the Great Red Spot (or a storm chip) to inspect it and swing the camera over. Drag to orbit, and pinch or scroll to zoom. Restore puts the clouds back. On a keyboard: arrows peel, 1–5 jump, Space peels deeper, R restores.",
    },
    {
      q: "Why is Earth tiny, and the layers so thick?",
      a: "The dot is Earth at the same scale as this Jupiter. The planet’s equator is about eleven Earths across. The interior shells are not to scale with each other. Real cloud decks are a thin skin, and the boundaries inside fade rather than stop. They are drawn thick so each zone stays visible.",
    },
    {
      q: "Where does the science come from?",
      a: "Mostly NASA’s Juno mission, in orbit since 2016, plus the Galileo probe’s single descent into the clouds in 1995. Juno reads gravity from tiny Doppler shifts in its radio signal, and reads the magnetic field with a magnetometer. This app is an illustration. It is not a numerical model.",
    },
  ],
  "zh-Hant": [
    {
      q: "人可以乘星艦降落嗎？",
      a: "不行。下面沒有可以降落的地面。雲會愈來愈厚、愈來愈熱，變成流體，船體會在到達任何核心之前就被壓垮、熔掉。美國太空總署的伽利略號探測器就是為了墜入而造的，大約一個小時後便毀了，而且只進了一小段。星艦是為地球、月球和火星造的，那些地方有地。木星的輻射也遠超過乘員和這艘船的設計。可以飛掠，可以繞飛，不能降落。",
    },
    {
      q: "為什麼那團風暴看起來像眼睛？",
      a: "那是大紅斑歷來的樣子：一顆紅卵，中間較淡，外圍有旋臂。人們說的「眼睛風暴」，指的就是這個。它仍然是風暴，一個比地球還寬的反氣旋。模型把它稍微托高，並畫出淡色環和絲縷，讓它看來像那團熟悉的漩渦，而不是一張貼上去的貼紙。",
    },
    {
      q: "中間那塊深色是瞳孔嗎？",
      a: "不是。沒有黑瞳孔，也沒有高光點。中間是磚紅雲裡較淺的橙紅核心，奶油色的絲縷繞著它轉。畫成卡通眼睛就錯了。木星上的這團，是天氣。",
    },
    {
      q: "有繁體中文嗎？",
      a: "有。行星上和這一頁都有 EN / 繁 切換。層次名稱、說明、風暴標籤，以及這些問題，都會跟著換。下次打開會記得你的選擇。",
    },
    {
      q: "裡面是真的嗎？",
      a: "沒有太空船見過內部。外面是風格化的雲層。再往裡，各層依循朱諾號的重力和磁場測量所偏好的圖像：深厚的氫包層、金屬氫，以及稀釋核心。光暈和磁力線都是示意，不是照片。",
    },
    {
      q: "什麼是稀釋核心？",
      a: "朱諾號之前，許多教科書畫的是一顆密實的岩石與冰球，邊界分明。重力場更符合另一種情形：重元素與氫混合，鋪在廣大的中心區域裡，向外漸漸淡去。沒有一道乾淨的界面可以剝開，所以這一層故意畫得斑駁、邊緣柔和。",
    },
    {
      q: "大紅斑是在地表上嗎？",
      a: "不是。木星沒有堅硬的地表。大紅斑是一場風暴：持續了數百年的反氣旋，至今仍比地球寬。朱諾號的微波觀測顯示，它的根伸入天氣層數百公里，不是地殼上的一塊污漬。",
    },
    {
      q: "金屬氫是什麼？",
      a: "接近一百萬個地球大氣壓時，氫表現得像液態金屬。質子浸在自由電子裡，所以這層流體可以導電。內部的熱，加上不到十小時轉一圈的自轉，攪動它，產生太陽系最強的行星磁場。從分子氫變成金屬氫，大概是漸漸發生的。",
    },
    {
      q: "為什麼有一顆較密的中心？",
      a: "那是一個假說，故意畫得很小。少數模型仍允許模糊區裡有一塊更緊的岩石與金屬，半徑只佔不大的一部分，而且也可能根本不存在。朱諾號並不要求一顆密實的內核，也沒有完全排除它。已經站得住的，是包在外面的稀釋核心。",
    },
    {
      q: "怎樣看裡面？",
      a: "點按外殼、選擇一層，或拖動剝開的滑桿。點按大紅斑（或風暴按鈕）可檢視並把鏡頭轉過去。拖曳可環繞，雙指或滾輪可縮放。按復原會把雲層蓋回去。鍵盤：方向鍵剝層，1 到 5 跳層，空白鍵再剝，R 復原。",
    },
    {
      q: "為什麼地球那麼小，內層卻那麼厚？",
      a: "那個點是按同一比例畫的地球。木星赤道大約有十一個地球那麼寬。內層彼此並不是按真實比例。真實的雲層只是薄薄一層皮，內部邊界也是淡出去的，不是突然停下。這裡畫得厚，是為了讓每一區都看得見。",
    },
    {
      q: "這些科學從哪裡來？",
      a: "主要來自美國太空總署的朱諾號。它自 2016 年起繞木星飛行。另外還有伽利略號探測器在 1995 年唯一一次降入雲層的數據。朱諾號從無線電訊號裡極小的多普勒偏移讀取重力，並用磁力計測量磁場。這個應用是示意圖，不是數值模型。",
    },
  ],
};

export function faqItems(lang: Lang): readonly FaqItem[] {
  return FAQ[lang];
}

export function useLang() {
  const [lang, setLang] = useState<Lang>("en");
  const skipSave = useRef(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("juno-lang");
    if (stored === "zh-Hant" || stored === "en") setLang(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh-Hant" ? "zh-Hant" : "en";
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    window.localStorage.setItem("juno-lang", lang);
  }, [lang]);

  return [lang, setLang] as const;
}
