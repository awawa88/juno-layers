import { useEffect } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LangSelect } from "@/components/lang-select";
import { isLatin, layerText, missionText, uiText, useLang } from "@/jupiter/i18n";
import { LAYERS } from "@/jupiter/layers";
import { OBJECTIVES } from "@/jupiter/mission";

export const Route = createFileRoute("/mission")({
  head: () => ({
    meta: [
      { title: "Juno Mission · Jupiter Layers" },
      {
        name: "description",
        content:
          "The science objectives of NASA’s Juno mission and how each one reveals a layer of Jupiter: gravity, magnetic field, deep atmosphere, water, and auroras.",
      },
    ],
  }),
  component: MissionPage,
});

function MissionPage() {
  const [lang, setLang] = useLang();
  const copy = uiText(lang);
  const mission = missionText(lang);
  const kicker = isLatin(lang)
    ? "text-xs font-medium tracking-widest text-faint uppercase"
    : "text-xs font-medium tracking-wide text-faint";

  useEffect(() => {
    document.title = `${copy.mission} · ${copy.title}`;
  }, [copy.mission, copy.title]);

  return (
    <main className="faq">
      <header className="faq-bar">
        <Link to="/" className="faq-back">
          {copy.back}
        </Link>
        <LangSelect lang={lang} label={copy.language} onChange={setLang} />
      </header>
      <div className="faq-body">
        <p className={kicker}>{copy.kicker}</p>
        <h1 className="mt-2 font-display text-4xl leading-none font-medium tracking-tight">{copy.mission}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{copy.missionPageLede}</p>
        <p className="mt-6 text-sm leading-relaxed text-fg">{copy.missionLede}</p>

        <section className="about-section" aria-labelledby="mission-title">
          <h2 id="mission-title" className="font-display text-2xl leading-tight font-medium">
            {copy.missionTitle}
          </h2>
          <ol className="objective-list">
            {OBJECTIVES.map((objective, index) => {
              const text = mission.objectives[objective.id];
              return (
                <li key={objective.id} className="objective">
                  <span className="objective-num" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base leading-snug font-medium text-fg">{text.title}</h3>
                    <p className="mt-1 text-xs text-faint">
                      {copy.instrumentLabel} · {text.instrument}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{text.body}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-faint">{copy.revealsLabel}</span>
                      {objective.layers.map((id) => {
                        const layer = LAYERS.find((item) => item.id === id) ?? LAYERS[0];
                        return (
                          <span key={id} className="layer-tag">
                            <span className="swatch" style={{ background: layer.swatch }} aria-hidden="true" />
                            {layerText(lang, layer.index).name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="about-section" aria-labelledby="timeline-title">
          <h2 id="timeline-title" className="font-display text-2xl leading-tight font-medium">
            {copy.timelineTitle}
          </h2>
          <ol className="timeline">
            {mission.timeline.map((item) => (
              <li key={item.when}>
                <span className="timeline-when">{item.when}</span>
                <span className="text-sm leading-relaxed text-muted">{item.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-9 flex flex-wrap gap-2">
          <Link to="/" className="btn btn-primary about-cta">
            {copy.exploreLayers}
          </Link>
          <Link to="/about" className="btn btn-ghost about-cta">
            {copy.about}
          </Link>
        </div>
      </div>
    </main>
  );
}
