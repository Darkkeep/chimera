# Chimera identity

**Distinct parts. Deliberate design. Powerful learning.**

Chimera represents the instructional designer's work: assembling different disciplines, materials, and technologies into a coherent learning experience. Its mark combines an ascending copper wing, a silver creature's head and body, and a slate tail. The silhouette expresses their integration.

## Assets and implementation

- Master transparent PNG: `frontend/public/brand/chimera-mark.png`.
- Reusable application component: `frontend/src/BrandMark.tsx`.
- Brand styling: `frontend/src/brand.css`.
- Application placements: navigation wordmark, welcome state, learner-preview header, and browser favicon.

The master is a generated raster asset, not an editable vector. Preserve its transparency and proportions. Use a midnight background for larger placements so the silver remains visible in either appearance mode. The small navigation mark has been visually checked at 36–44px. The PNG favicon uses the same silhouette.

| Color | Value | Role |
| --- | --- | --- |
| Midnight navy | `#101D30` | Navigation and emblem background |
| Cool silver | `#DCE5EF` | Wordmark and creature body |
| Ember copper | `#C77D54` | Wing and restrained identity accents |
| Light copper | `#E1A580` | Brand text on dark backgrounds |
| Slate silver | `#90A6BE` | Tail reference color |

These are identity tokens; the generated artwork has tonal variation. Interface actions retain blue, and course images retain their authored colors. Avoid adding shields, insignia, or agency seals to imply official endorsement. The existing workspace layout and Light/Dark/System behavior remain in place.

## Generation record

Created with the built-in image generation tool. Two concepts were generated. The user selected the first, more illustrative concept; that original is the shipped asset. The navigation lockup contains only the mark and CHIMERA, without a descriptor. Original generations remain in the generator's output directory, while the application uses the repository copy.

Initial prompt:

> Use case: logo-brand. Create one production-ready symbol for CHIMERA, an instructional design authoring tool used by Air Force and Space Force educators. Meaning: distinct disciplines assembled deliberately into a powerful coherent whole. Single abstract integrated chimera facing right: three bold interlocking geometric masses suggest a poised leonine head/body, one ascending swept wing, and a curling serpentine tail; negative space subtly forms a C. Strong distinctive compact silhouette, intelligent, composed and capable, not snarling. Professional contemporary identity design, flat solid vector-like shapes, precise clean edges, broad negative-space separations, recognizable at 32px. Palette: cool silver #DCE5EF for grounded body and head, restrained ember copper #C77D54 for upward wing, slate silver #90A6BE for curved tail. Genuinely transparent background with alpha. Square image, symbol fills 85% of canvas with generous consistent safety margin. No text, letters as typography, badge, shield, border, stars, sparkles, gradient, shadow, texture, mockup, realism, tiny details, or military insignia. Output one isolated final mark, no alternatives or presentation sheet.

Unselected refinement prompt, using the initial image as its edit target:

> Refine this Chimera logo into a compact professional application symbol. Keep the integrated wing/body/tail concept and silver/copper/slate palette. RADICALLY simplify: exactly three broad solid flat shapes, no gradients or texture. One copper swept wing with a single broad notch; one silver lionlike angular head and strong neck/body merged into a single mass WITHOUT detailed legs, feet, mane, horns or facial detail; one slate crescent tail that curves underneath and around the back. Overall silhouette fits a compact near-circle, negative space evokes a C opening on right. Three pieces fit like an intentional precision assembly, separated by clean generous transparent gaps. Think sophisticated modern aerospace software brand symbol, not an illustrated animal or sports mascot. No text or surrounding badge. Truly transparent background. Sharp smooth edges, no stray pixels. Fill 85% of square frame. Must read at 32px.
