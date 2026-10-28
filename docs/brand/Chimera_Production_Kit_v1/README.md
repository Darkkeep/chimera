# CHIMERA Production Asset Kit v1

Approved direction: **Mechanicus Trinity**, built from the lion + eagle + dragon identity.

2026-10-24 refinement: the existing artwork now has a broader lion jaw, fuller
faceted mane and layered wings in the same silver/copper treatment. Original
sources are retained in `assets/source/`; editable additions are in
`assets/marks/leonine-refinement.svg`. The composite `chimera-mark.svg` embeds
the original raster and is not a fully vectorized redraw. Regenerate with
`python scripts/refine-brand.py` from the repository root (Pillow and Inkscape
required); validate with `--verify`. See [current identity](../../brand-identity.md).
The historical PDF and reference boards are retained, not regenerated.

This package turns the approved concept into implementation-ready web/UI assets and design tokens. It is intended for the CHIMERA product shell, marketing surfaces, prototypes, and developer handoff.

## Start here

- `assets/app-icons/` — installable product icon sizes and favicon
- `assets/marks/` — approved raster logo/mark treatments
- `tokens/chimera.tokens.json` — portable design tokens
- `tokens/chimera.css` — CSS custom properties
- `src/chimera-components.css` — framework-agnostic component skin
- `src/chimera-theme.ts` — typed application theme values
- `src/tailwind.chimera.preset.js` — Tailwind preset
- `examples/index.html` — static shell showing the intended product feel
- `docs/IMPLEMENTATION_GUIDE.md` — recommended migration sequence
- `docs/Chimera_Brand_Bible_v1.pdf` — source brand bible

## Product hierarchy

**CHIMERA** is the product name. **Mechanicus Trinity** is the creature/identity treatment, not a product-name replacement.

## Important production note

The creature artwork originated as approved generated raster art. The included PNG masters are suitable for product UI, web, video, app icons, decks, and ordinary digital publishing. Before large-format print, embroidery, fabrication, or trademark filing, commission a clean vector master redraw and use that as the canonical logo source. Do not auto-trace the detailed creature art and treat the result as a final trademark master.
