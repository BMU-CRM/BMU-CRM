# CRM 2.0

Internal company operating platform for our own team: CRM, projects and tasks, files, chat, HR, finance and a client portal.

## Project rules (from the owner, always apply)

1. **Git:** Never run git commands or push anything. The owner handles Git manually. Help only when asked.
2. **Versions:** After every task, save a snapshot named `TaskName_VersionNumber` (for example `LeadsPage_1`, then `LeadsPage_2`).
   - Run `powershell -File scripts/saveVersion.ps1 -Name TaskName_1`.
   - Snapshots live in `C:\Users\dhanu\.claude\projects\e--CRM-2-0\versions\`.
   - "Buddy revert back to {TaskName_VersionNumber}" means run `powershell -File scripts/restoreVersion.ps1 -Name TaskName_1`. It saves the current state first, then makes the project match the snapshot exactly.
   - A revert restores code only, not the data in `.data/`. If the task changed the database, tell the owner and give them a migration to undo it.
3. **Discuss first:** Do nothing until the owner says `Start!`. This applies to every task, not just the first one.
4. **Reports:** After every task, give a complete report: what was done, files changed or added, and where, with line and file links.
5. **Naming:** Name files after their area. Landing page sections are `LandingHero.tsx`, `LandingFooter.tsx`. Check existing names before adding new ones.

## Stack

- Next.js (App Router), TypeScript, HTML, CSS Modules. No Tailwind.
- Backend: Next.js server actions and route handlers on Node.js. No separate server.
- Database: on a computer, Postgres embedded in the app (PGlite, from npm), stored in `.data/database`. No Docker.
- Live site: Vercel with Supabase (Mumbai). `DATABASE_PROVIDER=supabase`, set only in Vercel, switches the database, file storage, scheduled jobs and live updates to Supabase. See [docs/SetupGuide.md](docs/SetupGuide.md).
- Queries: the PostgREST query builder (`@supabase/postgrest-js`, a library only), answered in-process by `src/server/database/queryEngine.ts` on both databases.
- Sign-in is the app's own code on both (`src/server/auth`, tables in `app_auth`). Supabase Auth is not used. File storage, live updates and scheduled jobs are in `src/server/storage`, `src/server/live` and `src/server/database/backgroundServices.ts`, with Supabase versions alongside.
- Images: WebP, using `next/image` and `scripts/convertImagesToWebp.ts`.

## Naming conventions

- Components: `PascalCase.tsx` with a matching `PascalCase.module.css`.
- Other code: `camelCase.ts`, for example `employeeService.ts`, `employeeActions.ts`, `employeeSchema.ts`.
- Next.js reserved names stay as they are: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`.
- Migrations: `database/migrations/<timestamp>_<snake_case_name>.sql`. Then run `npm run db:types`.

## Decisions already made

- For our own team only, so the database is single-company.
- Clients get their own login portal.
- Responsive website with mobile push notifications first. No native apps yet.
- The AI assistant only answers questions. It never performs actions.
- Branches: decide later. Do not build multi-branch data yet.
- Google Drive: integrate later.
- Hosting: Vercel with Supabase (Free plan while testing, Pro before real data). The live database started fresh, with no data copied from `.data`.
- Email provider: integrate later. Until then, administrators create invitation and reset links in the app.
- Roles, landing page and branding details: the owner will provide them later.
- Pagerbook attendance: integrate later, behind an integration layer.

## Build rules

- The system is built in phases. See [docs/ProjectRoadmap.md](docs/ProjectRoadmap.md).
- Never hardcode a role check such as `role === 'founder'`. Check permissions instead.
- Dashboards and the sidebar are generated from permissions, not written per role.
- No fake buttons. If a feature has no working backend yet, leave its control out.
- Every important action writes to `audit_logs`.
- Row level security reports a refused update as zero rows, not an error. Always add `.select()` and check that a row came back.
- The owner's database is `.data/database`. Never delete or reset it. If it is ever recreated, recreate the owner's test account: name `mukesh@bmu.in`, email `you@company.com`. The owner knows the password.
- `npm test` uses throwaway in-memory databases, so it never touches the owner's data.
- The owner runs `npm run dev` on port 3000. Do not stop it. It holds `.data/database` open, so scripts that open that folder must wait until it is stopped.
- Test with a production build on port 3100, with its own folders: `DATABASE_DIR=.data/test-database`, `FILE_STORAGE_DIR=.data/test-files`. Browser tests also set `TEST_SUPPORT_SECRET` (32+ characters) on that server only. Never put it in `.env.local`.
- Any change to `.env.local` needs the owner's dev server restarted before it takes effect.
- `createAdminDatabaseClient()` bypasses row level security. Use it only in `src/server/` and `scripts/`.
- Postgres 18 reports a delete blocked by a protected link as `23001`, not `23503`. Use `isStillInUse(error)`.
- Code must work on both databases. Write raw SQL against `SqlDatabase` (`src/server/database/sqlDatabase.ts`), never PGlite directly.
- After adding a migration, the owner runs `npm run db:supabase` before deploying the code that needs it. Say so in the task report.
