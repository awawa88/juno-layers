import { Link } from "@tanstack/react-router";
import { HUB_BODIES } from "@/bodies/catalog";
import type { BodyId } from "@/bodies/types";
import type { Lang } from "@/jupiter/i18n";

type Props = {
  active: BodyId;
  lang: Lang;
  label: string;
};

/** Compact hub so students open Jupiter | Earth | Mars | Moon | Sun. */
export function BodyNav({ active, lang, label }: Props) {
  const zh = lang === "zh-Hant" || lang === "zh-Hans";
  return (
    <nav className="body-nav" aria-label={label}>
      {HUB_BODIES.map((body) => {
        const text = zh ? body.labelZh : body.label;
        const className = body.id === active ? "body-nav-link is-active" : "body-nav-link";
        // Explicit routes keep TanStack's typed `to` happy without casting the whole hub.
        if (body.id === "jupiter") {
          return (
            <Link key={body.id} to="/" className={className} aria-current={active === "jupiter" ? "page" : undefined}>
              {text}
            </Link>
          );
        }
        if (body.id === "earth") {
          return (
            <Link key={body.id} to="/earth" className={className} aria-current={active === "earth" ? "page" : undefined}>
              {text}
            </Link>
          );
        }
        if (body.id === "mars") {
          return (
            <Link key={body.id} to="/mars" className={className} aria-current={active === "mars" ? "page" : undefined}>
              {text}
            </Link>
          );
        }
        if (body.id === "moon") {
          return (
            <Link key={body.id} to="/moon" className={className} aria-current={active === "moon" ? "page" : undefined}>
              {text}
            </Link>
          );
        }
        return (
          <Link key={body.id} to="/sun" className={className} aria-current={active === "sun" ? "page" : undefined}>
            {text}
          </Link>
        );
      })}
    </nav>
  );
}

export function bodyNavLabel(lang: Lang): string {
  if (lang === "zh-Hant" || lang === "zh-Hans") return "天體";
  return "Bodies";
}
