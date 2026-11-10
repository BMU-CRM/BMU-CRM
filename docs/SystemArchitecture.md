# System architecture

## Overview

One Next.js application serves the interface and the backend. On a computer, nothing else needs installing: Postgres runs inside the app (PGlite, from npm) and stores its data in `.data/database`. Uploaded files are kept in `.data/files`.

The live site runs on Vercel, which keeps no disk, so it uses Supabase instead: Supabase Postgres for the database, Supabase Storage for files, `pg_cron` and `pg_net` for scheduled jobs and push requests, and Supabase Realtime for live updates. `DATABASE_PROVIDER=supabase` switches all of them (`src/server/database/appDatabase.ts`). Everything else, including sign-in and every query, is the same code on both. Setup steps are in [SetupGuide.md](SetupGuide.md#going-live-on-vercel-and-supabase).

```text
Browser
  │
  ▼
src/proxy.ts                 Turns away visitors with no session cookie
  │
  ▼
Pages in src/app/            Check the session and permission, then render
  │
  ├─ src/server/services/    Read data as the signed-in user
  └─ src/server/actions/     Change data as the signed-in user
        │
        ▼
src/server/database/         Query engine: runs each query as that user's database role
        │
        ▼
Embedded Postgres            Row level security and triggers make the final decision
```

### How a query runs

Services and actions build queries with the standard PostgREST query builder (`@supabase/postgrest-js`, used only as a library). Instead of sending them over the web, the client hands each one to `queryEngine.ts` in the same process. The engine:

1. Opens a transaction and switches to the `authenticated` role with the signed-in user's id, so row level security applies.
2. Turns the request into SQL, including joined records such as `owner:employees!files_owner_id_fkey(full_name)`, using the database's own list of tables and foreign keys.
3. Returns the rows as JSON, with the same error codes Postgres raises.

Because the request format is PostgREST's, the same code works unchanged against a hosted Postgres service later.

### Startup

The first request opens the database (`appDatabase.ts`). On a computer, that opens the embedded database (`localDatabase.ts`), applies any new migrations (`migrationRunner.ts`) and starts the background services (`backgroundServices.ts`). A lock file stops a second program opening the same folder, because two writers would corrupt it.

On Vercel, it opens a small pool of connections to Supabase's connection pooler (`postgresDatabase.ts`). Migrations are not applied there, because many copies of the app start at once. `npm run db:supabase` applies them instead (`scripts/migrateSupabase.ts`), with `database/platform/supabase_platform.sql` in place of the first migration. Both kinds of database meet the same small interface (`sqlDatabase.ts`), and each query runs in a transaction as the signed-in user's role, so row level security behaves the same on both.

## Three layers of access control

| Layer | Where | Purpose |
| --- | --- | --- |
| Interface | `navigationRegistry.ts`, `dashboardWidgetRegistry.ts` | Show only what the user can use |
| Server | `accessService.ts`, each server action | Refuse early with a clear message |
| Database | Row level security and guard triggers | The real enforcement, which holds even if the app is bypassed |

The database layer is the one that counts. The other two exist for a better experience.

## Roles, scopes and permissions

- A **permission** is one ability, such as `employees.update`.
- A **scope** sets how far it reaches: `own`, `team`, `department` or `organisation`. Each scope includes the narrower ones.
- A **role** is a named set of permissions with scopes. Roles are data, so new ones need no code.
- A **designation** is a job title and management level. It grants no access.

Code never checks a role name. It only checks permissions.

Seeing a colleague's name and seeing them in the staff directory are separate. Every active employee can read names, because tasks, chats, meetings and files need them. The Employees page and profiles follow the scope of `employees.view`, decided in the database by `can_view_employee_profile`. In the same way, client names reach people through `get_client_labels` and finance, while the client record itself, Client 360, client files and client chats need `clients.view`.

## Dynamic dashboards

Each dashboard widget and sidebar item declares the permission it needs. The dashboard is everything the user's permissions allow. A new role therefore gets the right dashboard and menu without any new code.

## Safety rules enforced by the database

- Nobody can grant a role with more access than they hold themselves.
- Nobody can change their own role or deactivate their own account.
- Nobody can manage someone whose role is above their own reach.
- Department transfers need organisation-wide access.
- The Founder role cannot be edited or deleted from the app.
- At least one active employee must always be able to manage roles.
- Reporting lines and department trees cannot form loops.
- Employee records are deactivated, never deleted, so history stays intact.
- Audit log entries cannot be changed or deleted, even by the admin database client.

## Client 360 timeline

The timeline reads from `audit_logs`, which records a `client_id` for any row that has one. A later module joins the timeline just by adding a `client_id` column and an audit trigger, with no timeline code to change.

## Sign-in

Accounts live in `app_auth.users`, outside the public schema, so no user query can reach them. The schema is not called `auth` because Supabase keeps its own sign-in tables there; this app does not use Supabase Auth. Passwords are hashed with scrypt. Signing in creates a session: the browser keeps a random token in an http-only cookie, and the database keeps only its hash. The route guard checks that the cookie exists; every page and action then checks the session itself.

Invitations and password resets are one-time links (`app_auth.one_time_tokens`). Until an email provider is connected, the emails are queued in `app_auth.outgoing_emails` and administrators create links to pass on from the employee page. Sign-in attempts are limited to 10 per email in 15 minutes, counted in the database (`app_auth.sign_in_attempts`) so the limit holds across every copy of the app.

## Real-time updates

Tables in the `live_updates` publication get a trigger that announces each change with only the row's ids. `/api/live` streams these to open pages as server-sent events, after checking with row level security that the user may see that row. Pages then ask the server to rebuild themselves, so no data travels in the event itself. One connection per browser tab is shared by every component (`src/lib/live/liveUpdates.ts`), and it refreshes once on connecting, to catch anything missed. Chat typing signals go through `/api/live/typing`, which only members of the conversation can use.

On Supabase, the same trigger sends the change with `realtime.send` to a Supabase Realtime channel, and pages listen there instead (`/api/live/config` tells a page which way to listen). The channel name is random and given only to signed-in people. It carries only table names and row ids, which say nothing without access to the rows; pages still reload through the usual rules. Typing signals go to a separate channel per conversation, whose name is derived from the signing secret, so only people who may read the conversation are told it (`src/server/live/realtimeChannels.ts`).

## Workload

`calculateWorkload` compares each person's remaining hours with 40 hours a week. Everyone sees their own result on the My workload card; managers also see their team's. Hours are weighted by priority and raised for overdue work. Tasks with no estimate count as 4 hours. Above 100% is overloaded, and below 40% has capacity.

Performance is shown as separate figures: on-time rate, average quality, complexity delivered and estimate accuracy. They are not combined into a single score, so nobody is ranked on task counts.

## Files

File contents are stored on disk by `src/server/storage/objectStore.ts`, and every link is made in `fileStorage.ts`, so moving to another store later means changing only those two files. Each stored file has a row in `storage.objects`, written and read as the signed-in user, so the database's file rules decide who can upload and download.

```text
Browser ── 1. ask to upload ──> server action ── creates the file record
        <── signed upload link (15 minutes) ──
        ── 2. sends the file to /api/storage/upload (with progress) ──>
        ── 3. confirm ──> database reads the real size from storage.objects, marks it ready
```

On Supabase, file contents are kept in Supabase Storage (`supabaseStorage.ts`). The upload link points straight at Storage, so large files never pass through Vercel, which limits request sizes. Storage does not know this app's rules, so the app checks `can_upload_file_object` as the user before making the link. Storage then writes the `storage.objects` row with the real size and type, which step 3 reads as before.

Downloads go through `/files/{id}/download`, which checks access, records it, then redirects to a signed link that expires in a minute. Only images, PDFs, text, audio and browser-playable video open in the browser. Everything else downloads. Links are signed with a secret the app creates on first run and keeps in the database's private settings.

## Finance

Quotations and invoices share one form (`FinanceDocumentForm`), which shows GST totals as the user types (`src/lib/finance/documentTotals.ts`). The figures kept are always the database's:

```text
Form ── save_quotation / save_invoice (one step) ──> rounds every figure to paise
                                                     works out each line and the totals
                                                     guard trigger: who may bill this client, what may still change
                                                     GST trigger: CGST + SGST, or IGST, and the total
Issue ── update status ──> guard trigger gives the next number for that financial year and locks the invoice
Payment ── insert ──> guard checks the amount due; trigger sets part paid or paid, and tells the Client Manager
```

Printable quotations and invoices live in `src/app/(print)/`, outside the app shell, so the browser's print window (or Save as PDF) holds only the document. They carry what a GST invoice needs: both GSTINs, place of supply and state code, HSN or SAC codes, the tax split, the amount in words and a signature line.

The finance report (`/finance`) is built from rows the user may see, by `src/lib/finance/financeReport.ts`, so it is tested without a database. `/finance/export` gives the same invoices as a spreadsheet for the accountant, with cells that could run as formulas made safe.

## Push notifications

```text
Something happens ──> database trigger creates a notification
                                   │
                                   ├──> the bell updates live
                                   └──> net.http_post queues a push request
                                                      │
                                                      └──> the app sends it after the change is saved:
                                                           web-push delivers it to each of the person's devices
```

The service worker in `public/sw.js` shows the notification and opens the app when it is clicked. If `NOTIFICATION_DISPATCH_URL` and `NOTIFICATION_DISPATCH_SECRET` are set, push requests go to that address instead, for a database hosted elsewhere.

## Scheduled jobs

Migrations register jobs with `cron.schedule`, as on a hosted Postgres. The app checks every minute and runs each job whose schedule is due: deadline reminders and escalation every 15 minutes, meeting reminders every 5, overdue invoice reminders every hour. On Supabase, `pg_cron` runs the same jobs inside the database, and `pg_net` sends push requests to `/api/notifications/dispatch`.

## The admin database client

`createAdminDatabaseClient()` bypasses row level security. It is used only in `src/server` and `scripts`, for work a user cannot do themselves: recording an accepted invitation and delivering push notifications, which needs another person's devices. An action must first confirm that the user's own request succeeded, because row level security reports a refused update as zero rows rather than an error.

## Folder structure

```text
.data/                Local database and uploaded files (not in Git)
database/
  migrations/         Database changes, applied automatically on start
  platform/           Supabase's version of the first migration
docs/                 Architecture, schema, permissions, design system, setup
public/images/        WebP images
scripts/              Version snapshots, image conversion, first account, type generation
src/
  app/
    (auth)/           Sign-in, setup and password pages
    (crm)/            Pages for signed-in users
    (print)/          Printable quotations and invoices, without the app shell
    api/live/         Live update stream and typing signals
    api/storage/      Signed upload and download links
    auth/             Opens invitation links, ends stale sessions
  components/         Interface components, one folder per area
  lib/
    access/           Permission keys, navigation, dashboard widgets
    auth/             Route guard
    finance/          Money formatting, GST totals, financial years, the finance report
    live/             Live updates in the browser
    validation/       Form validation
  server/
    actions/          Changes to data
    auth/             Accounts, sessions, passwords, one-time links
    database/         Embedded or Supabase database, migrations, query engine, background services
    jobs/             Schedule matching
    live/             Live change hub
    security/         Signing secret
    services/         Reads of data
    storage/          File store on disk or in Supabase Storage, and file links
  types/              Database types generated from the migrations
  proxy.ts            Route protection
tests/                Unit tests, query engine tests and database rule tests
```

## Planned connections between modules

All modules share the same data. A client connects to projects, tasks, files, conversations, quotations and invoices. A task connects to its creator, assignee, department, project and client. A file connects to its sender, recipient, department, client and project. Clients sign in through a separate portal with their own access rules, so they are not modelled as a department.
