/**
 * Inkline — brand mark. Direction: "The Nib Rise".
 *
 * The glyph is one hand-drawn stroke: a chisel entry at the nib angle, pressure
 * released through the body, a hairline leaving on the rise — nib, line and
 * incline in a single gesture. It is a filled path on a 24-unit grid and takes
 * its colour from `currentColor`, so it themes itself.
 *
 * The wordmark splits "Ink" from "line" structurally — a 320-unit weight step
 * plus an opsz jump from 144 to 40 — so the split survives one colour at nav
 * size. Coral lands on "line" only, as a quotation of the correction stroke the
 * coach draws under the learner's prose.
 *
 * Hard rules (see design/LOGO_SPEC.md):
 *  - never put a space, bullet, slash or camel-case between the halves
 *  - never carry the split on colour alone (`mono` must stay legible)
 *  - never use --critical instead of --coral
 *  - never underline the wordmark, never outline or mirror the glyph
 */

export const INKLINE_GLYPH_PATH =
  "M3.4 18.9 L5.0 21.0 C11.0 20.3 16.9 15.1 21.9 3.5 C16.1 12.3 10.2 17.2 3.4 18.9 Z";

/** Per-size type spec. Below 24px "line" drops to a lighter opsz/weight and the
 *  glyph-to-wordmark gap tightens — the two documented small-size adjustments. */
type Spec = {
  inkTracking: string;
  lineWght: number;
  lineOpsz: number;
  /** undefined = inherit the "Ink" tracking (correct below 24px) */
  lineTracking?: string;
  gapEm: number;
};

function specFor(fontSize: number): Spec {
  if (fontSize < 18)
    return { inkTracking: "-0.015em", lineWght: 360, lineOpsz: 20, gapEm: 0.27 };
  if (fontSize < 24)
    return { inkTracking: "-0.018em", lineWght: 370, lineOpsz: 40, gapEm: 0.3 };
  if (fontSize < 120)
    return {
      inkTracking: "-0.02em",
      lineWght: 380,
      lineOpsz: 40,
      lineTracking: "-0.006em",
      gapEm: 0.26,
    };
  return {
    inkTracking: "-0.022em",
    lineWght: 380,
    lineOpsz: 40,
    lineTracking: "-0.008em",
    gapEm: 0.18,
  };
}

/** The mark alone. Minimum 16px. */
export function InklineGlyph({
  size = 21,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      style={{ display: "block" }}
    >
      <path d={INKLINE_GLYPH_PATH} fill="currentColor" />
    </svg>
  );
}

/**
 * The wordmark. Inherits its ink colour from the parent (`text-ink`).
 * `mono` renders both halves in currentColor — the pass/fail proof that the
 * split is structural. `coralOpacity` dims "line" where another coral element
 * competes (the nav's active-link underline).
 */
export function InklineWordmark({
  fontSize = 20,
  mono = false,
  coralOpacity,
  className,
}: {
  fontSize?: number;
  mono?: boolean;
  coralOpacity?: number;
  className?: string;
}) {
  const s = specFor(fontSize);
  return (
    <span
      className={className ? `font-display ${className}` : "font-display"}
      style={{
        fontSize,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: s.inkTracking,
        fontVariationSettings: "'opsz' 144, 'SOFT' 0, 'WONK' 1",
      }}
    >
      Ink
      <span
        style={{
          fontWeight: s.lineWght,
          letterSpacing: s.lineTracking,
          color: mono ? undefined : "var(--coral)",
          opacity: mono ? undefined : coralOpacity,
          fontVariationSettings: `'opsz' ${s.lineOpsz}, 'SOFT' 40, 'WONK' 1`,
        }}
      >
        line
      </span>
    </span>
  );
}

/**
 * Primary lockup — glyph + wordmark, horizontal.
 * `size` is the glyph height in px; the wordmark is sized off it.
 * Clear space on all four sides is 1× the cap height of the "I"; nothing —
 * no tagline, no divider, no nav link — enters it.
 */
export function InklineLockup({
  size = 21,
  mono = false,
  coralOpacity,
  className,
}: {
  size?: number;
  mono?: boolean;
  coralOpacity?: number;
  className?: string;
}) {
  const fontSize = size >= 24 ? size : Math.round(size * 0.95);
  const s = specFor(fontSize);
  return (
    <span
      className={
        className ? `inline-flex items-center ${className}` : "inline-flex items-center"
      }
      style={{ gap: `${(s.gapEm * fontSize).toFixed(2)}px` }}
    >
      <InklineGlyph size={size} />
      <InklineWordmark fontSize={fontSize} mono={mono} coralOpacity={coralOpacity} />
    </span>
  );
}
