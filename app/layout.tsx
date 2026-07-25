import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Inkline · İngilizce Writing Koçu",
    template: "%s · Inkline",
  },
  applicationName: "Inkline",
  description:
    "Canlı AI destekli, yazma odaklı interaktif İngilizce öğrenme uygulaması.",
};

// Runs before first paint so a stored dark preference never flashes light
// (FOUC). Light needs no class — it is the base :root, and therefore the
// default for every first-time visitor regardless of their OS setting.
const themeScript = `(function(){try{if(localStorage.getItem('ink-theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${fraunces.variable} ${geist.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div className="relative min-h-screen">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0 opacity-[0.04]"
          >
            <svg width="100%" height="100%">
              <filter id="ink-grain">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.9"
                  numOctaves="2"
                  stitchTiles="stitch"
                />
              </filter>
              <rect width="100%" height="100%" filter="url(#ink-grain)" />
            </svg>
          </div>
          <Nav />
          <div className="relative z-10">{children}</div>
        </div>
      </body>
    </html>
  );
}
