# Chimera identity

**Distinct parts. Deliberate design. Powerful learning.**

Chimera represents the instructional designer's work: assembling different disciplines, materials, and technologies into a coherent learning experience. The current application uses the metallic Mechanicus Trinity artwork: a central lion, eagle and dragon with layered wings. The 2026-10-24 refinement preserves that existing composition, glowing eyes and silver/copper palette, adding a broader feline jaw, fuller swept mane and matching faceted wing layers.

## Assets and implementation

- Composite master: `frontend/public/brand/chimera-mark.svg`.
- Transparent PNG: `frontend/public/brand/chimera-mark.png`.
- Editable refinement: `docs/brand/Chimera_Production_Kit_v1/assets/marks/leonine-refinement.svg`.
- Preserved original artwork: `docs/brand/Chimera_Production_Kit_v1/assets/source/`.
- Reusable application component: `frontend/src/BrandMark.tsx`.
- Brand styling: `frontend/src/brand.css`.
- Application placements: navigation wordmark, welcome state, learner-preview header, and browser favicon.

The master is a hybrid SVG: it embeds the original raster creature and overlays editable faceted details. It is not a fully vectorized redraw, and exporting at higher resolution does not recover detail missing from the original raster. Original source files are retained for reversible refinements. Use the dark-backed app icons for small placements and the matching transparent treatment for larger dark surfaces.

Run `python scripts/refine-brand.py` with Pillow and Inkscape installed to rebuild the master, PNG treatments, ten icon sizes, multi-resolution ICO, production-kit copies and SHA-256 manifest. Use `--inkscape` for another executable location. Run `python scripts/refine-brand.py --verify` to validate dimensions, favicon resolutions, kit parity and hashes without regenerating anything.

All application placements use the shared component. Favicon, Apple-touch and PWA references use the refreshed icon family with a revision query to avoid stale cached artwork. Historical PDF and reference boards remain inspiration, not the current asset specification. Interface styling is unchanged.

The enlarged wings sweep upward from behind the shoulders into the space above
the side heads. In the composite, wings precede the original creature layer:
all three heads, the dragon's ear/horns and their dark shadows remain in front.
Do not place wing facets over facial or ear details. The rebuild verifier checks
this rear-to-front layer order.

| Color | Value | Role |
| --- | --- | --- |
| Midnight navy | `#101D30` | Navigation and emblem background |
| Cool silver | `#DCE5EF` | Wordmark and creature body |
| Ember copper | `#C77D54` | Wing and restrained identity accents |
| Light copper | `#E1A580` | Brand text on dark backgrounds |
| Slate silver | `#90A6BE` | Tail reference color |

These are identity tokens; the generated artwork has tonal variation. Interface actions retain blue, and course images retain their authored colors. Avoid adding shields, insignia, or agency seals to imply official endorsement. The existing workspace layout and Light/Dark/System behavior remain in place.

## Historical generation record

The earlier wing/body/tail mark was created with an image generation tool. Two concepts were generated and the first was selected. The application later adopted the production kit's metallic three-headed artwork; that existing artwork is the basis of the 2026-10-24 refinement. No AI image model was used for this refinement. The prompts below are historical, not instructions to remove the mane.

Initial prompt:

> Use case: logo-brand. Create one production-ready symbol for CHIMERA, an instructional design authoring tool used by Air Force and Space Force educators. Meaning: distinct disciplines assembled deliberately into a powerful coherent whole. Single abstract integrated chimera facing right: three bold interlocking geometric masses suggest a poised leonine head/body, one ascending swept wing, and a curling serpentine tail; negative space subtly forms a C. Strong distinctive compact silhouette, intelligent, composed and capable, not snarling. Professional contemporary identity design, flat solid vector-like shapes, precise clean edges, broad negative-space separations, recognizable at 32px. Palette: cool silver #DCE5EF for grounded body and head, restrained ember copper #C77D54 for upward wing, slate silver #90A6BE for curved tail. Genuinely transparent background with alpha. Square image, symbol fills 85% of canvas with generous consistent safety margin. No text, letters as typography, badge, shield, border, stars, sparkles, gradient, shadow, texture, mockup, realism, tiny details, or military insignia. Output one isolated final mark, no alternatives or presentation sheet.

Unselected refinement prompt, using the initial image as its edit target:

> Refine this Chimera logo into a compact professional application symbol. Keep the integrated wing/body/tail concept and silver/copper/slate palette. RADICALLY simplify: exactly three broad solid flat shapes, no gradients or texture. One copper swept wing with a single broad notch; one silver lionlike angular head and strong neck/body merged into a single mass WITHOUT detailed legs, feet, mane, horns or facial detail; one slate crescent tail that curves underneath and around the back. Overall silhouette fits a compact near-circle, negative space evokes a C opening on right. Three pieces fit like an intentional precision assembly, separated by clean generous transparent gaps. Think sophisticated modern aerospace software brand symbol, not an illustrated animal or sports mascot. No text or surrounding badge. Truly transparent background. Sharp smooth edges, no stray pixels. Fill 85% of square frame. Must read at 32px.
