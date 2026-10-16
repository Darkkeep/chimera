# CHIMERA UI Implementation Guide

## 1. Replace the shell before individual controls
Adopt the palette, typography, top bar, navigation rail, inspector, canvas and status language first. Do not recolor isolated buttons inside the old visual system.

Recommended shell:
- one compact command bar across the top
- persistent project/scene rail on the left
- large center storyboard/canvas area
- contextual inspector on the right
- Preview and Deploy remain high-value top-level actions

## 2. Product color behavior
- **Ignition orange** is the transformation/action color. Reserve it for selected state, high-value calls to action, transformation/progress and brand moments.
- **Afterburn amber** indicates caution, pending readiness and secondary energy.
- **Cyan signal** is focus/interactive signaling, particularly keyboard focus and precise technical state.
- **Pythia Link violet** is a family/system accent. Use sparingly where CHIMERA connects to Pythia or shared intelligence features.
- Most surfaces remain Void, Carbon and Gunmetal.

## 3. Workflow language
Use this five-stage vocabulary wherever the application needs a high-level mental model:

`SOURCE → STORYBOARD → ENHANCE → VERIFY → DEPLOY`

Map current capabilities beneath those stages instead of exposing a forest of equally weighted toolbars.

## 4. Component priorities
First pass: app shell, project rail, scene rail, command bar, primary/secondary buttons, inspector sections, validation/readiness badges, deployment/export surface.

Second pass: assessment editor, media library, AI enhancement review, My Work/project health and review/comment states.

## 5. Accessibility
- Never encode readiness or errors by color alone. Pair color with icon/text.
- Use the cyan focus ring for keyboard focus.
- Maintain at least WCAG AA contrast for product text.
- Honor `prefers-reduced-motion`.
- Do not use ember glow behind body text.

## 6. Asset paths
For React/Vite, copy `assets/app-icons/chimera-192.png` and `chimera-512.png` into the public/PWA icon directory and use `assets/marks/chimera-trinity-transparent-1024.png` where the creature needs transparent placement.

## 7. Suggested implementation order
1. Import `tokens/chimera.css`.
2. Add `chimera-components.css`.
3. Swap app/favicon assets.
4. Rebuild the global shell.
5. Consolidate top toolbars into command bar + contextual inspector.
6. Apply workflow naming.
7. Skin editor/preview/validation/export states.
8. Run keyboard, contrast and reduced-motion checks.
