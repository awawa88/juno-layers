import { useEffect } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { LangSelect } from "@/components/lang-select";
import { faqItems, isLatin, uiText, useLang } from "@/jupiter/i18n";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ · Juno Layers" },
      {
        name: "description",
        content:
          "Short answers about Jupiter: the Great Red Spot, metallic hydrogen, the dilute core, and what NASA’s Juno mission measured.",
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  const [lang, setLang] = useLang();
  const copy = uiText(lang);
  const items = faqItems(lang);

  useEffect(() => {
    document.title = `${copy.faqTitle} · ${copy.title}`;
  }, [copy.faqTitle, copy.title]);

  return (
    <main className="faq">
      <header className="faq-bar">
        <Link to="/" className="faq-back">
          {copy.back}
        </Link>
        <LangSelect lang={lang} label={copy.language} onChange={setLang} />
      </header>
      <div className="faq-body">
        <p
          className={
            isLatin(lang)
              ? "text-xs font-medium tracking-widest text-faint uppercase"
              : "text-xs font-medium tracking-wide text-faint"
          }
        >
          {copy.kicker}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-none font-medium tracking-tight">{copy.faqTitle}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">{copy.faqLede}</p>
        <div className="faq-list">
          {items.map((item, index) => (
            <details key={item.q} className="faq-item" name="faq" open={index === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </main>
  );
}
