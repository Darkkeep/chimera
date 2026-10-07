# Chimera Studio

React/Vite authoring interface for the local Chimera API.

```powershell
npm install
npm run dev
```

The opening workspace is My Work. New Project opens the shared creation dialog; project rows open Storyboard authoring. The Media Library project filter switches the active project without leaving the library, and the file picker is labeled Add media.

Settings includes Appearance and AI connection. The connection dialog reads permissions and safe configuration status from the API; entered keys are write-only and cleared after requests. Never add provider credentials to Vite environment variables, browser storage, screenshots, or source files. Backend OS credential storage and deployment requirements are documented in [AI connection](../docs/ai-connection.md).

Run `npm run build` here for TypeScript/Vite checks. From the repository root, run `npm run test:management` for dashboard regressions or `npm run test:onboarding -- --project chromium` for the complete isolated Chromium workflow suite. AI connection/media specs use mocked credentials and responses; they do not call real providers.
