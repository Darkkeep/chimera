# Chimera Studio

React/Vite authoring interface for the local Chimera API.

```powershell
npm install
npm run dev
```

The opening workspace is My Work. New Project opens the shared creation dialog; project rows open Storyboard authoring. The Media Library project filter switches the active project without leaving the library, and the file picker is labeled Add media.

**User guide** immediately below **Templates** opens the local PDF in a new tab without changing authoring state. Vite imports `../docs/user-guide.pdf` as a URL asset and includes it in production builds; no backend documentation route or GitHub access is needed. Rebuild the PDF using the [guide maintenance instructions](../docs/user-guide/support/README.md) before building the frontend when the guide changes.

The **WORKSPACE** navigation also contains **Assessments**, opening the project question bank and named assessment manager directly. It is not a Review tools entry. **Project background** is above the scene list in **Storyboard**, not in Settings; existing project/edit permissions still apply.

The question editor supports all seven interaction types, including **Fill-in-the-blank** (legacy data identifier `short-answer`). Its bottom **Tags and learning-objective references** section starts collapsed. Both fields use the shared searchable dropdown picker with existing current-project question values, inline creation, removable selections, and keyboard navigation. The adjacent **Question metadata** disclosure holds the other core metadata. Save question persists all changes.

Assessments supports reviewed QTI XML/ZIP and CSV/XLSX imports, template downloads, and CSV/XLSX question exports. See the [user guide](../docs/user-guide.md#5-author-assessments) for limits and QTI interoperability caveats. Focused browser regressions are in `question-import.spec.cjs`, `question-tags.spec.cjs`, `fill-in-the-blank.spec.cjs`, `assessment-groups.spec.cjs`, and `backgrounds.spec.cjs` under `tests/onboarding`.

Settings includes Appearance and AI connection. The connection dialog reads permissions and safe configuration status from the API; entered keys are write-only and cleared after requests. Never add provider credentials to Vite environment variables, browser storage, screenshots, or source files. Backend OS credential storage and deployment requirements are documented in [AI connection](../docs/ai-connection.md).

Run `npm run build` here for TypeScript/Vite checks. From the repository root, run `npm run test:management` for dashboard regressions or `npm run test:onboarding -- --project chromium` for the complete isolated Chromium workflow suite. AI connection/media specs use mocked credentials and responses; they do not call real providers.
