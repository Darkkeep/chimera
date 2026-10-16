# Production brand integration

The approved Mechanicus Trinity kit is archived in `Chimera_Production_Asset_Kit_v1.zip` and extracted under `brand/Chimera_Production_Kit_v1` for reference.

The frontend imports the original tokens and framework-independent component skin from `src/production-kit`. `src/production-brand.css` maps these to the existing UI variables and supplies the application integration layer. Keep kit tokens intact; make application adjustments in the integration layer.

The shell uses Void/Carbon surfaces, Ignition actions and selection, Cyan keyboard focus, and restrained violet on intelligence controls. New installations default to dark; saved Light, Dark, and System preferences remain supported. Authored slide colors and exported learning content remain independent.

The workflow bar connects Source to the existing PowerPoint picker, Storyboard to the scene workspace, Enhance to suggestion review, Verify to validation, and Deploy to the existing export dialog. Existing navigation and detailed action names remain available.

Approved app icons and marks are in `frontend/public/brand`. The favicon, Apple touch icon, and web app manifest reference the supplied sizes. The compact app icon is used in application chrome and empty states.

Validation: frontend TypeScript/Vite build; existing visual qualification suite (including editor accessibility, review contrast, mobile editing, and SCORM rendering); targeted browser checks for default dark appearance, loaded approved mark, 1440/768/390/320px widths, reduced motion, and WCAG A/AA axe checks. Screenshots are generated under `workspace/visual-qualification/production-kit-*.png`.

The 12ui CLI installation failed with `spawn EINVAL` on this Windows environment. Implementation follows the supplied approved shell example and production assets directly.

## Application-wide rollout

The component styles now use shared semantic tokens for panels, inputs, raised surfaces, selections, text, borders, links, success, warning, and error states in both Light and Dark modes. This includes authentication/recovery, My Work and project access, scene details and visual inspector, assessments and completion settings, media and generated-media tools, Pythia analysis and enhancement review, accessibility and validation, guided review, course review, and export controls. Authored stages and media keep their content colors.

Typography uses the kit body, display, and monospace stacks. Pythia boundaries use the family violet accent, canvas manipulation uses cyan, and action/progress/selection use ignition orange. Preview progress and visited-scene indicators remain distinct from their tracks.

Validation for the rollout: production build; visual qualification; 42 Chromium workflow tests covering management, accessibility, AI settings/drafting, media library, and assessment groups; two new production-theme tests covering Pythia/export/validation accessibility, mobile dialog fit, and the Source file picker in Light and Dark; isolated HTTPS authentication qualification with zero axe violations and no JavaScript errors.

Run the added coverage with `npx playwright test --config playwright.onboarding.config.cjs production-theme.spec.cjs --project chromium`.
