import { LANGS, type Lang } from "@/jupiter/i18n";

export function LangSelect({ lang, label, onChange }: { lang: Lang; label: string; onChange: (lang: Lang) => void }) {
  return (
    <div className="lang-select">
      <select aria-label={label} value={lang} onChange={(event) => onChange(event.target.value as Lang)}>
        {LANGS.map((item) => (
          <option key={item.code} value={item.code} lang={item.code}>
            {item.native}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
