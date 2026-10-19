import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LangSelect } from "@/components/lang-select";
import { earthJupiterDistance, type EarthDistance } from "@/jupiter/distance";
import { distanceText, factItems, isLatin, uiText, useLang } from "@/jupiter/i18n";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Jupiter · Juno Layers" },
      {
        name: "description",
        content:
          "Key facts about Jupiter, the largest planet, and how far it is from Earth today.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const [lang, setLang] = useLang();
  const copy = uiText(lang);
  const distance = distanceText(lang);
  const [now, setNow] = useState<EarthDistance | null>(null);
  const today = now ? distance.today(now.km, now.au, now.lightMinutes) : null;
  const kicker = isLatin(lang)
    ? "text-xs font-medium tracking-widest text-faint uppercase"
    : "text-xs font-medium tracking-wide text-faint";

  useEffect(() => {
    document.title = `${copy.about} · ${copy.title}`;
  }, [copy.about, copy.title]);

  useEffect(() => {
    setNow(earthJupiterDistance(new Date()));
  }, []);

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
        <h1 className="mt-2 font-display text-4xl leading-none font-medium tracking-tight">{copy.about}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{copy.aboutLede}</p>

        <section className="about-section" aria-labelledby="glance-title">
          <h2 id="glance-title" className="font-display text-2xl leading-tight font-medium">
            {copy.glanceTitle}
          </h2>
          <dl className="glance-list mt-4">
            {factItems(lang).map((fact) => (
              <div key={fact.key} className="glance-row">
                <dt className="text-xs text-faint">{fact.label}</dt>
                <dd className="text-sm leading-snug text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-faint">{copy.glanceSource}</p>
        </section>

        <section className="about-section" aria-labelledby="distance-title">
          <h2 id="distance-title" className="font-display text-2xl leading-tight font-medium">
            {distance.title}
          </h2>
          <div className="distance-today" aria-live="polite">
            <p className="text-xs text-faint">{distance.todayLabel}</p>
            <p className="mt-1 font-display text-3xl leading-tight font-medium text-fg">{today?.value ?? "—"}</p>
            <p className="mt-1 text-sm text-muted">{today?.detail ?? "\u00a0"}</p>
            <p className="mt-2 text-xs leading-relaxed text-faint">{distance.todayNote}</p>
          </div>
          <dl className="glance-list mt-6">
            {distance.rows.map((row) => (
              <div key={row.label} className="glance-row">
                <dt className="text-xs text-faint">{row.label}</dt>
                <dd className="text-sm leading-snug text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">{copy.earthDistanceNote}</p>
        </section>

        <div className="mt-9 flex flex-wrap gap-2">
          <Link to="/mission" className="btn btn-primary about-cta">
            {copy.mission}
          </Link>
          <Link to="/" className="btn btn-ghost about-cta">
            {copy.exploreLayers}
          </Link>
        </div>
      </div>
    </main>
  );
}
