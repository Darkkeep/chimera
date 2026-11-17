# Chimera 2.0 | Build Information deployment contract

Status: feature branch implementation; do not interpret as proof of any Hostinger deployment.
Related: issue #28, `backend/app/build_information.py`, `frontend/src/BuildInformation.tsx`.

## API access and provenance

`GET /api/management/build-information` is read-only and administrator-scoped through Chimera's existing authorization boundary. It is not listed as a public path. It returns product version, backend/frontend identity values, build timestamp, installation label and the configured Pythia contract version. Unknown values return JSON `null`.

The endpoint does not invoke Git, trust a branch name as a deployed SHA, inspect private secret files, or report a specific environment merely because this repository has an environment example.

Frontend Settings shows **Build Information** for local operators and hosted administrator/owner memberships. It reads the API only after opening the disclosure and handles denied access. The component compares its own supplied frontend SHA with the backend SHA and warns when they disagree, or when identity is incomplete.

## Backend runtime configuration (set on deployment host)

- `CHIMERA_BUILD_SHA`: 7–40 hex characters of the exact source commit used to build the currently running backend.
- `CHIMERA_BUILD_TIMESTAMP`: offset-aware ISO 8601 build time (UTC preferred).
- `CHIMERA_FRONTEND_BUILD_SHA`: optional backend's recorded companion frontend commit.
- `CHIMERA_FRONTEND_BUILD_TIMESTAMP`: optional frontend build timestamp known by deployment.
- `CHIMERA_BUILD_ENVIRONMENT`: bounded label such as `local`, `staging` or `production`.
- `CHIMERA_PYTHIA_CONTRACT_VERSION`: versioned contract identifier, when verified.

## Frontend Vite build configuration

Values are injected by Vite during **frontend build**, not read from mutable runtime env variables:

- `VITE_CHIMERA_BUILD_SHA`
- `VITE_CHIMERA_BUILD_TIMESTAMP`
- `VITE_CHIMERA_BUILD_ENVIRONMENT`

Set the SHA from the exact checked-out commit used to build the frontend, and timestamp at build time; do not substitute a moving branch reference. If the frontend is built separately from the backend, preserve both SHAs and let the UI expose a mismatch.

Do not put any bearer token, login value, private URL or other secret in `VITE_*`; these variables are included in public frontend artifacts.

## Important qualifications

- The semantic version is the source's 1.2.0 release baseline; this branch is still a 2.0 development effort, not a tagged 2.0 release.
- A displayed version is **not** proof of the deployed commit. The SHAs must be set by the actual deployment pipeline and compared to its build/deploy records.
- This feature does not automatically alter Hostinger, Render, production metadata, SSO or current deployments.
- If a production frontend/backend cannot receive these values safely, display Unknown and document the gap rather than claiming a particular release.
- Verify authentication, role denial, and actual Hostinger identity after an independently approved deployment.
