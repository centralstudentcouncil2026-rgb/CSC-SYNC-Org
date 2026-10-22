# CSC SYNC Org

Standalone org application. Serve `index.html` from this repository root.
Shared JavaScript, styles and images are copied locally; no sibling repository is required.

## Local use

Run `npm run dev`, then open http://127.0.0.1:5173/.
Run `npm run check` to validate local imports and assets.
No dependency installation or build is required. Static hosting can publish the repository root.

## Database

Uses the existing shared CSC SYNC Supabase project and its public client key.
No private credentials are included. Access is enforced by database policies.

`database/migrations` contains the shared backend schema and migrations, copied into this repository for reference and setup. These files do not run automatically. The Admin and Org apps use the same database; apply each migration once to that shared project, not once per repository.
