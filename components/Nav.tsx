"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { InklineLockup } from "./brand/Inkline";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Panel" },
  { href: "/write", label: "Yaz" },
  { href: "/essays", label: "Essaylerim" },
  { href: "/progress", label: "Gelişim" },
  { href: "/settings", label: "Ayarlar" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line backdrop-blur-md [background:color-mix(in_srgb,var(--paper)_80%,transparent)]">
      <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-5 px-6 py-3">
        {/* Lockup — coral dips to 88% here so the active-link underline stays
            the brighter coral on this row. Never underline the wordmark. */}
        <Link href="/" className="flex items-center text-ink">
          <InklineLockup size={21} coralOpacity={0.88} />
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative shrink-0 px-3 pt-1.5 pb-3 font-sans text-sm font-medium transition-colors ${
                  active
                    ? "text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {l.label}
                {active && (
                  /* Inside the link box on purpose — the row scrolls
                     horizontally, which clips anything hanging below it. */
                  <span className="absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-coral" />
                )}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}
