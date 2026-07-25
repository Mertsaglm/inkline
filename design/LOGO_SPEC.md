# Inkline — Logo & brand mark, as shipped

Direction: **"The Nib Rise."** Chosen from six explorations in
`gereksiz/claude/Inkline logo and brand mark/` (open `Inkline Logo.dc.html` in a
browser for the full study: explorations, monochrome proof, size proofs, misuse
sheet, in-context nav).

Implementation: [components/brand/Inkline.tsx](../components/brand/Inkline.tsx).

---

## The idea

The glyph is one stroke: a chisel entry at the nib angle, pressure released
through the body, a hairline leaving on the rise. **Nib, line and incline in a
single gesture** — nothing to assemble and nothing to lose at 16px.

The wordmark splits "Ink" from "line" **structurally** — a 320-unit weight step
plus an optical-size jump from 144 to 40 — so the split survives one colour at
nav size. Coral then lands on "line" and only on "line", not as highlighting but
as a quotation: coral is literally the colour of every line the coach draws under
a learner's sentence. The inverse mapping (coral "Ink" as the editor's red pen)
was rejected — it makes the brand about the corrector, not the writer.

---

## Glyph

24-unit grid, `fill="currentColor"`, single path:

```
M3.4 18.9 L5.0 21.0 C11.0 20.3 16.9 15.1 21.9 3.5 C16.1 12.3 10.2 17.2 3.4 18.9 Z
```

Entry at (3.4, 18.9), chisel cut 2.64u at 52.7°. Exit is a single point at
(21.8, 3.4); the chord of the two edges rises at 40°. Body thickness peaks at
2.4u, never below 1.4u before the taper. Optical centre sits 0.4u below the box
centre. Minimum size **16px**.

## Type spec

Fraunces roman (already loaded), no italic, no custom letterforms.

| axis     | "Ink"                 | "line"                |
| -------- | --------------------- | --------------------- |
| wght     | 700                   | 380 · 370 <24px · 360 <18px |
| opsz     | 144                   | 40 · 20 <18px         |
| SOFT     | 0                     | 40                    |
| WONK     | 1                     | 1                     |
| tracking | -0.020em (-0.018/-0.015em small, -0.022em ≥120px) | -0.006em (inherits below 24px, -0.008em ≥120px) |
| colour   | `--ink` / currentColor | `--coral`            |

Two small-size adjustments are part of the spec: below 24px "line" drops to
opsz 20 / wght 360 and the glyph-to-wordmark gap tightens. Everything else is one
drawing at every size.

## Lockup & clear space

Glyph height = 1.32 × cap height of the "I". Gap glyph↔wordmark = 0.26em of the
wordmark (0.27–0.30em below 24px). Clear space on all four sides = 1× the cap
height of the "I" — nothing enters it, no tagline, no divider, no nav link.
Minimum lockup width 96px; minimum wordmark cap height 11px.

---

## Finding: coral vs. coral in the nav

The active-link underline is a 2px coral bar; "line" is coral letterforms — same
hue, ~400px apart on the same row. They compete mildly. **Rule, applied in
`components/Nav.tsx`: in the nav only, the wordmark's coral drops to 88% opacity
and the active underline stays at 100%**, so the interface state is the brighter
coral and the logo is the quieter one.

Do not solve it by removing the active underline — it is the only state indicator
in the header. If the nav ever gains a second coral element (a badge, a CTA),
take coral out of the nav wordmark entirely and pass `mono` there; the weight
split means nothing breaks.

---

## Misuse — six don'ts

1. **Never break the breath.** No space, bullet, slash, hyphen or camel-case
   between the halves. The moment it reads "Ink line", *incline* is gone.
2. **Never let colour carry the split alone.** Equal weight and opsz with only a
   colour change dies in monochrome, in disabled states and in the favicon mask.
3. **Never substitute `--critical` for `--coral`.** Crimson belongs to errors
   inside the learner's prose; in the logo it makes the brand look like the
   mistake it is meant to fix.
4. **Never outline or flip the glyph.** Hollowed, it stops being ink and its
   taper vanishes under the paper grain. Mirrored, the line descends.
5. **Never re-map the halves to fit a background.** On coral, pure white or pure
   black, use the monochrome lockup (`mono`). "line" is never paper-coloured.
6. **Never underline the wordmark.** The wavy stroke is the correction language
   and the rule is the learner's page; either one under the logo says the brand
   name is a mistake or a heading. The rise lives in the glyph.

---

## Files

| File | What |
| --- | --- |
| `components/brand/Inkline.tsx` | `InklineGlyph`, `InklineWordmark`, `InklineLockup` |
| `app/icon.svg` | tab icon, theme-adaptive via `prefers-color-scheme` |
| `app/favicon.ico` | 16/32/48 fallback — ink glyph on the paper field |
| `app/apple-icon.png` | 180px app icon |
| `public/icon-192.png`, `public/icon-512.png` | manifest icons |
| `app/manifest.ts` | web manifest, `--paper` as background/theme colour |

The app icon is not the small mark enlarged: it is a full square of ruled paper
with the coral margin rule at 20%, the stroke crossing the rules — a page,
mid-sentence. Square corners, no gradient.

Regenerate the rasters with
[scripts/render-icons.py](../scripts/render-icons.py) (needs Pillow) after any
change to the glyph path.
