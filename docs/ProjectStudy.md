<div class="cover" markdown="1">

<h1>CRM 2.0 — Complete Project Study</h1>

<div class="sub">File structure, architecture, every module, the database, and findings</div>

<div class="meta">
Study date: 17 November 2026 · Codebase state: commit <code>4b459eb</code> ("message emojis"), working tree clean<br>
Method: read-only review of every source folder, all 69 migrations, scripts, tests and docs. No code was changed and the owner's database was not opened.<br>
Readers: the owner (Part A: summary and findings) and developers (Part B: detailed chapters)
</div>

</div>

---

# A1. Executive summary

CRM 2.0 is the company's internal operating platform. It is **one Next.js 16 application**: the same code serves the pages and the backend through server actions and route handlers. It covers CRM (Client 360), projects and tasks, files, chat, meetings and calendar, support tickets, People and HR (attendance, leave, payroll, recruitment, exits) and Finance (quotations, GST invoices, payments, ledger, purchases, budgets, profit and loss).

<div class="stats">
<div class="stat"><b>166</b>pages</div>
<div class="stat"><b>24</b>route handlers</div>
<div class="stat"><b>26</b>server-action files</div>
<div class="stat"><b>33</b>service files</div>
<div class="stat"><b>197</b>components (.tsx)</div>
<div class="stat"><b>107</b>CSS modules</div>
<div class="stat"><b>69</b>migrations</div>
<div class="stat"><b>103</b>tables</div>
<div class="stat"><b>~217</b>SQL functions</div>
<div class="stat"><b>~66</b>permissions</div>
<div class="stat"><b>9</b>seeded roles</div>
<div class="stat"><b>47</b>test files</div>
</div>

**Approximate size (lines):** `src/app` 16.5k · `src/components` 25.8k · `src/lib` 6.3k · `src/server` 13.1k · `database` 18.7k SQL · `tests` 8.1k. About **88,000 lines** in total.

### What is strong

- **The database is the real gatekeeper.** Every query runs as the signed-in user inside a transaction, so row level security and guard triggers decide what is allowed. The interface and server checks exist for a better experience, not for safety.
- **One codebase, two databases.** PGlite (embedded Postgres) on a computer and Supabase on Vercel sit behind one small interface (`SqlDatabase`). The PostgREST query builder runs inside the app through a custom query engine (`queryEngine.ts`, 736 lines), so services are identical on both.
- **Access is data, not code.** Roles are rows. Permissions have scopes (own, team, department, organisation). The sidebar and dashboard are built from permissions, and no hardcoded role checks were found in TypeScript.
- **Money is computed in the database.** Quotation, invoice and purchase-order totals, the GST split (CGST+SGST or IGST) and document numbering are worked out by SQL functions and triggers, never trusted from the browser.
- **Audit by trigger.** Main tables write `audit_logs` automatically, and audit entries cannot be changed or deleted.
- **Good test base.** 47 test files run against throwaway in-memory databases, covering the database rules, not just helper functions.

### What needs attention (details in A5)

| # | Area | Finding | Severity |
| --- | --- | --- | --- |
| 1 | HR privacy | The full PAN reaches the browser on the private-details edit form and on the printed profile, with no password check and no reveal audit | <span class="sev-high">High</span> |
| 2 | HR data | A single attendance correction wipes the real check-in and check-out times when the boxes are left blank | <span class="sev-high">High</span> |
| 3 | Finance | `lpad(n,4,'0')` cuts off numbers above 9999. Quotation numbers can already reach this through Settings | <span class="sev-high">High</span> |
| 4 | Sign-in | A team head can create a reset link for a member who has joined and sign in as them, with no audit entry | <span class="sev-high">High</span> |
| 5 | Notifications | Links with `?…` (for example `/approvals?tab=reimbursements`) open as a 404 through the notification "open" route | <span class="sev-med">Medium</span> |
| 6 | Files | `delete_file` lets organisation-wide file viewers delete private HR or candidate files they cannot see | <span class="sev-med">Medium</span> |
| 7 | Live site | Supabase live and typing channels are public and never rotated. Former employees could keep reading change ids or send fake signals | <span class="sev-med">Medium</span> |
| 8 | Finance | Invoice payments get their bank account when they are read, so changing the main account moves past balances | <span class="sev-med">Medium</span> |
| 9 | HR / Finance | Paying a final settlement marks *every* approved claim paid, even ones not included in the amount | <span class="sev-med">Medium</span> |
| 10 | Rules | `createAdminDatabaseClient()` is used in `src/app/api/integrations/attendance/route.ts:40`, which breaks the CLAUDE.md rule | <span class="sev-med">Medium</span> |
| 11 | Rules | Several updates lack the `.select()` row check: departments, designations, my profile, and the finance document overview | <span class="sev-med">Medium</span> |
| 12 | Repo hygiene | Migrations contain real company bank and UPI details, and one overwrites the quotation terms with no condition | <span class="sev-med">Medium</span> |

---

# A2. Technology stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16.4.5 (App Router), React 19.3 | Server components, server actions, route handlers. `src/proxy.ts` is the route guard (Next 16's replacement for middleware) |
| Language | TypeScript 5.9 | `npm run typecheck`. Generated database types are in `src/types/databaseTypes.ts` |
| Styling | CSS Modules plus tokens in `src/app/globals.css` | No Tailwind. Light and dark themes. Rules are in `docs/DesignSystem.md` |
| Local database | `@electric-sql/pglite` 0.5.15 | Stored in `.data/database`, with a lock file. Migrations are applied when the app starts |
| Live database | Supabase Postgres via `pg` 8.23 | Pool of 3 connections to the pooler (`postgresDatabase.ts`). Mumbai region (`vercel.json` → `bom1`) |
| Queries | `@supabase/postgrest-js` 2.119 | Used only as a query builder. `queryEngine.ts` turns its requests into SQL inside the app |
| Live updates | Server-sent events locally, `@supabase/realtime-js` on Supabase | Changes carry only table names and row ids. Pages reload their own data |
| Sign-in | The app's own code (`src/server/auth`, schema `app_auth`) | scrypt hashing, hashed session tokens, 30-day sessions, rate limit of 10 per 15 minutes |
| Google sign-in | `firebase` 13 (browser only) | The server checks the ID token against Google's keys. Only invited emails are let in |
| Push | `web-push` 3.6 and `public/sw.js` | VAPID keys. A database trigger queues the request, and the app or Supabase `pg_net` sends it |
| Validation | `zod` 4.6 | One schema file per area in `src/lib/validation` |
| Icons, images | `lucide-react`, `sharp` | Images are WebP (`npm run images:webp`) |
| Tests | `vitest` 5 | `npm test`. Each file builds its own in-memory database |
| Hosting | Vercel and Supabase | `DATABASE_PROVIDER=supabase` is set only in Vercel |

---

# A3. Architecture

## How a request flows

<div class="diagram">
<svg width="640" height="330" viewBox="0 0 640 330" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial" font-size="11">
<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1f5f99"/></marker></defs>
<rect x="220" y="6" width="200" height="32" rx="6" fill="#e8f0fa" stroke="#1f5f99"/><text x="320" y="26" text-anchor="middle" font-weight="600">Browser (pages, forms, sw.js)</text>
<line x1="320" y1="38" x2="320" y2="56" stroke="#1f5f99" marker-end="url(#ar)"/>
<rect x="180" y="58" width="280" height="32" rx="6" fill="#fff" stroke="#1f5f99"/><text x="320" y="72" text-anchor="middle" font-weight="600">src/proxy.ts</text><text x="320" y="85" text-anchor="middle" fill="#555">turns away visitors with no session cookie</text>
<line x1="320" y1="90" x2="320" y2="108" stroke="#1f5f99" marker-end="url(#ar)"/>
<rect x="140" y="110" width="360" height="34" rx="6" fill="#fff" stroke="#1f5f99"/><text x="320" y="124" text-anchor="middle" font-weight="600">src/app pages and route handlers</text><text x="320" y="138" text-anchor="middle" fill="#555">requirePagePermission / getActionAccess (accessService)</text>
<line x1="230" y1="144" x2="200" y2="166" stroke="#1f5f99" marker-end="url(#ar)"/><line x1="410" y1="144" x2="440" y2="166" stroke="#1f5f99" marker-end="url(#ar)"/>
<rect x="70" y="168" width="230" height="32" rx="6" fill="#fff" stroke="#1f5f99"/><text x="185" y="182" text-anchor="middle" font-weight="600">src/server/services</text><text x="185" y="195" text-anchor="middle" fill="#555">reads as the signed-in user</text>
<rect x="340" y="168" width="230" height="32" rx="6" fill="#fff" stroke="#1f5f99"/><text x="455" y="182" text-anchor="middle" font-weight="600">src/server/actions</text><text x="455" y="195" text-anchor="middle" fill="#555">zod validation, then writes as the user</text>
<line x1="185" y1="200" x2="280" y2="222" stroke="#1f5f99" marker-end="url(#ar)"/><line x1="455" y1="200" x2="360" y2="222" stroke="#1f5f99" marker-end="url(#ar)"/>
<rect x="150" y="224" width="340" height="34" rx="6" fill="#e8f0fa" stroke="#1f5f99"/><text x="320" y="238" text-anchor="middle" font-weight="600">postgrest-js → queryEngine.ts → SqlDatabase.runAs()</text><text x="320" y="252" text-anchor="middle" fill="#555">one transaction · role authenticated · user id set</text>
<line x1="320" y1="258" x2="320" y2="276" stroke="#1f5f99" marker-end="url(#ar)"/>
<rect x="110" y="278" width="420" height="40" rx="6" fill="#0b3d6e"/><text x="320" y="294" text-anchor="middle" fill="#fff" font-weight="600">Postgres: PGlite (.data/database) or Supabase</text><text x="320" y="309" text-anchor="middle" fill="#cfe0f3">row level security · guard triggers · audit · GST · numbering · notifications</text>
</svg>
</div>

## Three layers of access control

| Layer | Where | Role |
| --- | --- | --- |
| Interface | `src/lib/access/navigationRegistry.ts`, `dashboardWidgetRegistry.ts` | Shows only what the user can use |
| Server | `src/server/services/accessService.ts`, each action's `getActionAccess` | Refuses early with a clear message |
| Database | Row level security policies, guard triggers, SECURITY DEFINER RPCs | **The real check**, which holds even if the app is bypassed |

## Local computer and live site

<div class="diagram">
<svg width="640" height="210" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial" font-size="10.5">
<rect x="230" y="6" width="180" height="40" rx="6" fill="#0b3d6e"/><text x="320" y="23" text-anchor="middle" fill="#fff" font-weight="600">appDatabase.ts</text><text x="320" y="38" text-anchor="middle" fill="#cfe0f3">DATABASE_PROVIDER ?</text>
<line x1="260" y1="46" x2="160" y2="70" stroke="#1f5f99"/><line x1="380" y1="46" x2="480" y2="70" stroke="#1f5f99"/>
<rect x="10" y="70" width="300" height="132" rx="6" fill="#f4f8fd" stroke="#1f5f99"/><text x="160" y="88" text-anchor="middle" font-weight="700">Computer (default)</text>
<text x="22" y="108">• Database: PGlite in .data/database (lock file)</text>
<text x="22" y="124">• Migrations: applied on first open (migrationRunner)</text>
<text x="22" y="140">• Files: .data/files (objectStore.ts)</text>
<text x="22" y="156">• Jobs: backgroundServices checks cron every minute</text>
<text x="22" y="172">• Live: /api/live server-sent events, re-checked by RLS</text>
<text x="22" y="188">• Push: sent in-process after the change is saved</text>
<rect x="330" y="70" width="300" height="132" rx="6" fill="#fdf8ec" stroke="#b54708"/><text x="480" y="88" text-anchor="middle" font-weight="700">Vercel (supabase)</text>
<text x="342" y="108">• Database: Supabase pooler, pg pool of 3</text>
<text x="342" y="124">• Migrations: npm run db:supabase (by the owner)</text>
<text x="342" y="140">• Files: Supabase Storage (supabaseStorage.ts)</text>
<text x="342" y="156">• Jobs: pg_cron inside the database</text>
<text x="342" y="172">• Live: Supabase Realtime channel (public topic)</text>
<text x="342" y="188">• Push: pg_net → /api/notifications/dispatch</text>
</svg>
</div>

## Sign-in flow

<div class="diagram">
<svg width="640" height="165" viewBox="0 0 640 165" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial" font-size="10.5">
<defs><marker id="a2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1f5f99"/></marker></defs>
<rect x="5" y="10" width="140" height="44" rx="6" fill="#e8f0fa" stroke="#1f5f99"/><text x="75" y="28" text-anchor="middle" font-weight="600">Password</text><text x="75" y="44" text-anchor="middle" fill="#555">email + password</text>
<rect x="5" y="90" width="140" height="44" rx="6" fill="#e8f0fa" stroke="#1f5f99"/><text x="75" y="108" text-anchor="middle" font-weight="600">Google (Firebase)</text><text x="75" y="124" text-anchor="middle" fill="#555">browser gets ID token</text>
<line x1="145" y1="32" x2="200" y2="62" stroke="#1f5f99" marker-end="url(#a2)"/><line x1="145" y1="112" x2="200" y2="84" stroke="#1f5f99" marker-end="url(#a2)"/>
<rect x="202" y="46" width="200" height="56" rx="6" fill="#fff" stroke="#1f5f99"/><text x="302" y="64" text-anchor="middle" font-weight="600">authActions.ts</text><text x="302" y="79" text-anchor="middle" fill="#555">rate limit · scrypt check, or</text><text x="302" y="93" text-anchor="middle" fill="#555">firebaseTokens + googleAccounts</text>
<line x1="402" y1="74" x2="450" y2="74" stroke="#1f5f99" marker-end="url(#a2)"/>
<rect x="452" y="46" width="183" height="56" rx="6" fill="#0b3d6e"/><text x="543" y="64" text-anchor="middle" fill="#fff" font-weight="600">app_auth.sessions</text><text x="543" y="79" text-anchor="middle" fill="#cfe0f3">hash stored · token in</text><text x="543" y="93" text-anchor="middle" fill="#cfe0f3">http-only cookie crm_session</text>
<text x="320" y="158" text-anchor="middle" fill="#555">Invitations and resets: one-time links (app_auth.one_time_tokens) → /auth/confirm → session → /set-password</text>
</svg>
</div>

---

# A4. File structure

## Top-level folders

| Path | What it holds |
| --- | --- |
| `.data/` | The owner's local database (`database/`) and uploaded files (`files/`). Not in Git. **Never delete or reset it** |
| `database/migrations/` | 69 SQL migrations, `<timestamp>_<snake_case>.sql`, applied in name order |
| `database/platform/supabase_platform.sql` | Supabase's replacement for the first (local-platform) migration |
| `docs/` | Roadmap, architecture, database schema, permission matrix, design system, setup guide, user guide PDF |
| `public/` | `sw.js` (push service worker), `images/` (brand logos in WebP, notification icons in PNG) |
| `scripts/` | `saveVersion.ps1`, `restoreVersion.ps1`, `migrateSupabase.ts`, `generateDatabaseTypes.ts`, `createFounderAccount.ts`, `convertImagesToWebp.ts` |
| `src/` | The application (below) |
| `supabase/templates/` | Two empty folders named like email templates (unused) |
| `tests/` | 47 test files and `helpers/` (throwaway database setup) |
| Root config | `next.config.ts` (security headers, Firebase rewrite, image cache), `vercel.json` (region `bom1`), `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.env.example` |

## Inside `src/`

```text
src/
├── proxy.ts                    Route guard: no session cookie → /login (public paths listed in lib/auth/routeGuard.ts)
├── app/
│   ├── layout.tsx, page.tsx    Root layout (theme, fonts); "/" redirects to /overview
│   ├── globals.css             Design tokens (colours, spacing, text sizes, corners) for light and dark
│   ├── (auth)/                 login, setup (first Founder), forgot-password, set-password, account-inactive
│   ├── (crm)/                  Every signed-in page, inside AppShell (sidebar + top bar)
│   │   ├── overview/           Permission-built dashboard
│   │   ├── clients/ projects/ tasks/ workload/ calendar/ meetings/ tickets/ files/
│   │   ├── messages/ notifications/ approvals/ profile/
│   │   ├── people/             employees (+personal, private), departments, designations, hierarchy
│   │   ├── attendance/ leave/ payslips/ reimbursements/ resignation/ interviews/   (self-service)
│   │   ├── hr/                 leave, holidays, payroll, recruitment, exits, reports
│   │   ├── quotations/ invoices/
│   │   ├── finance/            dashboard, banks, budgets, follow-ups, ledger, purchases, salaries,
│   │   │                       transactions, profit-loss, reports, export
│   │   └── settings/           roles, audit-log, services, ticket-categories, calendar, finance, hr/*
│   ├── (print)/                Paper layouts without the app shell: invoices, quotations, receipts,
│   │                           purchase orders, payslips, letters, employee profile, HR and P&L reports, settlements
│   ├── api/                    live (SSE, config, typing), storage (signed upload/object), notifications/dispatch,
│   │                           integrations/attendance, test-support
│   ├── auth/                   confirm (redeems one-time links), end-session
│   └── .well-known/assetlinks.json   Android app (PWABuilder) link verification
├── components/                 28 folders, one per area (ui, layout, dashboard, charts, finance, messages, hr, …)
├── lib/                        Code with no server dependency: access registries, validation (zod), finance maths,
│                               calendar, CSV, live updates in the browser, presence store, notification kinds
├── server/
│   ├── actions/                26 files of server actions (writes)
│   ├── services/               33 files of reads and shared server logic
│   ├── auth/                   accounts, sessions, passwords, rate limit, Firebase tokens, Google accounts, founder setup
│   ├── database/               appDatabase, localDatabase (PGlite), postgresDatabase (pg), sqlDatabase interface,
│   │                           queryEngine, queryClients, databaseClient, schema info, migrationRunner, backgroundServices
│   ├── storage/ live/ jobs/ security/   files, live changes, cron matching, signing secret and field encryption
│   └── notificationDispatcher.ts  Sends web push to each of a person's devices
└── types/databaseTypes.ts      Generated by npm run db:types
```

## Component folders

| Folder | Files | Folder | Files | Folder | Files |
| --- | --- | --- | --- | --- | --- |
| ui | 47 | messages | 29 | finance | 27 |
| employees | 25 | dashboard | 20 | tasks | 16 |
| hr | 15 | files | 13 | charts | 12 |
| layout | 12 | meetings | 11 | auth | 7 |
| payroll | 7 | recruitment | 7 | clients | 6 |
| notifications | 6 | presence | 5 | tickets | 5 |
| exits | 4 | projects | 4 | organisation | 3 |
| purchases | 3 | catalog | 2 | hierarchy | 2 |
| reimbursements | 2 | roles | 2 | workload | 2 |
| approvals | 1 | | | | |

## Naming conventions in use

- Components: `PascalCase.tsx` with a matching `PascalCase.module.css`.
- Other code: `camelCase.ts`, grouped by role, for example `employeeService.ts`, `employeeActions.ts`, `employeeSchema.ts`.
- Next.js reserved names: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`.
- Migrations: `database/migrations/<timestamp>_<snake_case_name>.sql`, followed by `npm run db:types`.

---

# A5. Roadmap status and consolidated findings

## Roadmap status (verified against the code)

| Phase | Scope | Status in code |
| --- | --- | --- |
| 1 | Sign-in, employees, hierarchy, roles and permissions, dynamic dashboards, audit log | Built |
| 2 | Clients, Client 360, projects, milestones, tasks, workload | Built |
| 3 | Files, messaging, notifications, push, deadline reminders, escalation | Built |
| 4 | Meetings, calendar, leave, attendance, support tickets | Built |
| 5 | Quotations, GST invoices, payments, finance reports | Built, and extended well beyond the plan: ledger, banks and statements, purchases and vendors, budgets, P&L, salaries, reimbursements |
| — | HR beyond the plan: payroll, recruitment, onboarding, letters, exits and settlement, HR reports | Built (not listed in the roadmap table) |
| — | Content calendar, service catalog with prices, client service plans, signatures, UPI QR | Built |
| 6 | AI assistant (answers questions only), analytics, integrations | Not started. The attendance import API is ready for Pagerbook |
| — | Client portal | **Not started.** There is no portal route or client login yet, although CLAUDE.md lists it as a decision |
| 7 | Security audit, MFA, performance | Partly done: the rate limit is in place. No MFA |
| — | Email provider | Not connected (`emailIsConnected = false`). Links are created by administrators |

`docs/ProjectRoadmap.md` is behind the code: HR, payroll, recruitment, exits, ledger, purchases and budgets are built but not listed there.

## Consolidated findings

Each item was found by reading the code. Items marked *possible* were reasoned from the code but not reproduced in a running app. Items marked ✔ were checked again directly for this report. The chapter numbers point to the full evidence in Part B.

### Security and privacy

| # | Finding | Evidence | Sev. |
| --- | --- | --- | --- |
| S1 ✔ | The full PAN is sent to the browser on the private-details edit page and printed on the profile printout. No password reveal, no `record_private_detail_reveal` | `src/components/employees/EmployeePrivateForm.tsx:48`, `EmployeeProfilePrint.tsx:94`, `employeeService.ts:246` | <span class="sev-high">High</span> |
| S2 | A team head can create a reset link for a member who has joined and is signed in as that member at once. Neither creating nor redeeming the link is audited | `employeeActions.ts:232-250`, `src/app/auth/confirm/route.ts:17-21` | <span class="sev-high">High</span> |
| S3 | `/set-password` changes a password with only a session (no current password) and does not end other sessions | `authActions.ts:132-154`, `authAccounts.ts:59-65` | <span class="sev-med">Medium</span> |
| S4 | `delete_file` checks organisation-wide `files.view` before visibility, so private HR and candidate files can be deleted by id | `20261113000006_file_delete.sql:17-21` | <span class="sev-med">Medium</span> |
| S5 | Supabase live and typing channels are public (`private=false`) with a topic that never rotates. Payloads carry every `*_id`, so DM activity metadata is visible to all employees, and former employees could keep listening | `supabase_platform.sql:120-123`, `realtimeChannels.ts:16-31` | <span class="sev-med">Medium</span> |
| S6 ✔ | Signed-in users keep EXECUTE on internal SECURITY DEFINER helpers (for example `record_system_expense`), because the lockdown revokes only from `public` and `anon`. Not reachable from a browser today; this is a gap in the extra safety layer | `20261106000000_local_platform.sql:21`, `20261112000005_finance_ledger.sql:292` | <span class="sev-med">Medium</span> |
| S7 | Every active employee can read every column of `employees` (phone, status, probation and so on) | `20261109000013_team_access.sql:76-78` | <span class="sev-med">Medium</span> |
| S8 | HR can assign any non-private role, including one with more access than HR has | `20261114000003_hr_access_private_records.sql:102-113` | <span class="sev-med">Medium</span> |
| S9 | Sending a file into a conversation gives everyone who can view that conversation access to the file | `20261114000003…:608` | <span class="sev-med">Medium</span> |
| S10 | The TLS certificate is not verified on the Supabase connection | `postgresDatabase.ts:21` | <span class="sev-med">Medium</span> |
| S11 | Sign-in rate limit is per email only, and counts successful sign-ins too, so anyone can lock a known email out for 15 minutes | `signInRateLimit.ts:9-21` | <span class="sev-low">Low</span> |
| S12 | `/auth/confirm` redeems one-time links on GET, so link-preview bots can use up an invitation (*possible*) | `src/app/auth/confirm/route.ts:10-28` | <span class="sev-low">Low</span> |
| S13 | Signing out leaves the device's push subscription linked, so notifications keep arriving on a shared device (*possible*) | `authActions.ts:78-81` | <span class="sev-low">Low</span> |
| S14 | Interviewers can read a candidate's current, expected and offered salary | `20261112000003_recruitment.sql:177,605` | <span class="sev-low">Low</span> |
| S15 | Payroll staff can see salaries of private-record people (Founder or Co-Founder). To confirm with the owner (*possible*) | `20261112000002_payroll.sql:913-963` | <span class="sev-low">Low</span> |

### Data correctness

| # | Finding | Evidence | Sev. |
| --- | --- | --- | --- |
| D1 ✔ | Single attendance correction: blank time boxes overwrite the real check-in and check-out with null | `src/components/hr/HrForms.tsx:216-223`, `hrActions.ts:159-172` | <span class="sev-high">High</span> |
| D2 ✔ | `lpad(n,4,'0')` cuts off numbers above 9999. Settings allow a next quotation number up to 999999, so 12345 becomes `QUO-1234`. The same cut-off applies to invoices, receipts and POs at the 10,000th document of a year | `20261116000002_quotation_numbering.sql:37`, `FinanceSettingsForm.tsx:109`, `20261109000011_finance.sql:513` | <span class="sev-high">High</span> |
| D3 | Invoice payments store no bank account. The account is filled in when read, so changing the main account moves past balances | `invoiceActions.ts:147-154`, `20261112000005_finance_ledger.sql:399` | <span class="sev-med">Medium</span> |
| D4 | `mark_settlement_paid` marks every approved claim paid, including ones not in the settlement amount | `20261112000009_salaries_reimbursements.sql:464-471` | <span class="sev-med">Medium</span> |
| D5 | Payroll calculated before month end counts the rest of the month as paid days | `20261114000003…:417` | <span class="sev-med">Medium</span> |
| D6 | Payroll expense is posted at net pay only, so P&L understates the employer's cost | `20261112000005_finance_ledger.sql:342` | <span class="sev-med">Medium</span> |
| D7 | The GST split compares free-text state names. A blank state means intra-state (*possible*) | `20261109000011_finance.sql:219-220` | <span class="sev-med">Medium</span> |
| D8 | Quotation autosave racing Save can create a duplicate draft and use up a number (*possible*) | `FinanceDocumentForm.tsx:188-329` | <span class="sev-med">Medium</span> |
| D9 | A meeting save whose participant sync fails returns an error, and the retry creates a duplicate meeting | `meetingActions.ts:65-105` | <span class="sev-med">Medium</span> |
| D10 | Deleting an employee cascades away resignations, settlements, reimbursements, salary structures and files | `20261112000009:54`, `20261112000004:47,99` | <span class="sev-med">Medium</span> |
| D11 | Receipt numbers leave gaps when a payment is removed (hard delete) | `invoiceActions.ts:165` | <span class="sev-low">Low</span> |
| D12 | Several services add money as plain decimals instead of using the paise helpers (ledger summary, payables, claims, follow-ups, cash tiles) | `ledgerService.ts:173-178`, others in chapter 6 | <span class="sev-low">Low</span> |
| D13 | Printouts read the current seller details and signature, so reprinting an old invoice shows today's GSTIN, address or bank | `(print)/invoices/[invoiceId]/print/page.tsx:38-40` | <span class="sev-low">Low</span> |

### Bugs in behaviour

| # | Finding | Evidence | Sev. |
| --- | --- | --- | --- |
| B1 ✔ | The notification "open" route assigns the stored link to `pathname`, so `?` becomes `%3F` and the page is a 404. This affects reimbursement, salary and attendance-report notifications | `src/app/(crm)/notifications/[notificationId]/open/route.ts:23` | <span class="sev-med">Medium</span> |
| B2 | Chat shows only the latest 60 messages, with no "load older". Pinned, starred and reply links and search do nothing beyond that. New messages may not scroll into view once a chat has 60 | `messageService.ts:7,103`, `ScrollToLatest.tsx:22` | <span class="sev-med">Medium</span> |
| B3 | Notice-period and payroll settings forms are shown to `exits.manage` and `payroll.manage` holders, but saving needs `hr.manage`, so they always fail | `exitActions.ts:190-201`, `payrollActions.ts:330-344` | <span class="sev-med">Medium</span> |
| B4 | The HR reports Leave tab errors for viewers with `hr.dashboard` but not `hr.manage` (*possible*) | `hr/reports/page.tsx:31`, `20261111000006_attendance_leave.sql:408-410` | <span class="sev-med">Medium</span> |
| B5 | Editing a task requires `tasks.create`, while the edit page needs only view plus manage rights | `taskActions.ts:61` | <span class="sev-med">Medium</span> |
| B6 | Cancelling a content-calendar entry leaves its per-person tasks open (*possible*) | `20261113000009…:34-42` | <span class="sev-med">Medium</span> |
| B7 | Saving a role is two steps, so a failure can leave a role with no permissions. The default role can also be deleted | `organisationActions.ts:151-165`, `171-186` | <span class="sev-low">Low</span> |
| B8 | Forgot-password can't deliver (email not connected), and each request cancels any reset link an administrator already gave out | `accountEmails.ts:9`, `authAccounts.ts:139-142` | <span class="sev-low">Low</span> |
| B9 | Some screens show the main role instead of the role being worked as (Overview header, profile widget) | `accessService.ts:20`, `overview/page.tsx:15` | <span class="sev-low">Low</span> |
| B10 | Locally, failed push requests and missed cron minutes are never retried. Cron day-of-month and day-of-week are ANDed, unlike pg_cron | `backgroundServices.ts:27-80`, `cronSchedule.ts:27-33` | <span class="sev-low">Low</span> |
| B11 | `/settings` has no index page and returns 404 | `src/app/(crm)/settings/` | <span class="sev-low">Low</span> |

### CLAUDE.md rule checks

| Rule | Result |
| --- | --- |
| Never hardcode a role check | **Kept in TypeScript.** Role names appear only in founder setup and in migrations that seed grants. Those are matched inconsistently (`'Client Manager'` vs `lower(name)='human resource'`), so a renamed role misses later seeds |
| No fake buttons | **Mostly kept.** The exceptions are the settings forms that can never save (B3), and Forgot password, which can't deliver its email (B8) |
| Every important action writes to `audit_logs` | **Gaps:** password sign-in and sign-out, set password, link creation, attendance inserts and imports, onboarding ticks, task comments, collaborators and checklist items, meeting participants, ticket and file comments, finance line items, statement imports, CSV exports, group create and rename |
| Add `.select()` and check a row came back | **Gaps:** `organisationActions.ts:48-50, 62, 90-92, 104`, `employeeActions.ts:450-455` (my profile), `quotationActions.ts:54`, `invoiceActions.ts:55`, `ledgerActions.ts:151`, `fileActions.ts:159-163`, `ticketActions.ts:127`, `messageActions.ts:247-250, 463-471` |
| Admin client only in `src/server/` and `scripts/` | **Broken** at `src/app/api/integrations/attendance/route.ts:40` |
| Raw SQL only against `SqlDatabase`, never PGlite directly | `backgroundServices.ts` is typed against PGlite and uses `db.listen`. This is local-only by design, but outside the interface |
| No breadcrumbs (owner preference) | **Kept.** `BackButton` in the top bar replaces them |

### Documentation and hygiene

- `docs/SystemArchitecture.md` gives presence timings (1 minute, 3 minutes offline, 30 seconds) that differ from the code (2 or 5 minute check-ins, 6 minutes offline). It also says upload links last 15 minutes, while on Supabase they last about 2 hours.
- `docs/PermissionMatrix.md` is missing `content_calendar.manage`. `docs/ProjectRoadmap.md` doesn't list the HR and extended finance work.
- The migrations commit real company bank and UPI details (`20261113000015_fewer_calls_payment_details.sql:113-120`) and live staff names. `20261114000004_upi_qr_quotation_terms.sql:13` overwrites the quotation terms with no condition.
- `supabase/templates/*.html` are empty folders. ESLint ignores a file that doesn't exist (`src/types/supabaseDatabase.ts`). `package.json` allows Node 20.9, but the scripts use `process.loadEnvFile` (Node 20.12 or later).
- Missing indexes on foreign keys that row level security uses for file visibility: `reimbursements.receipt_file_id`, `expense_records.receipt_file_id`, `income_records.file_id`, `vendor_bills.file_id`, and others (chapter 7).

## Suggested order of fixes

1. **Now:** S1 (PAN), D1 (attendance wipe), D2 (`lpad`), B1 (notification links), S2 and S3 (reset link and set-password hardening, with audit).
2. **Before real data on Supabase:** S5 (private realtime channels with RLS), S10 (TLS), S6 and S7 (function and column grants), S4 (`delete_file`), and moving the bank and UPI seeds out of the migrations.
3. **Next:** D3 to D10, B2 to B6, the audit and `.select()` gaps, and updating the docs.

---

# Part B — Detailed chapters

The chapters below are the full study notes, one per area. Each ends with its own **Observations** section, with file and line evidence.

| Chapter | Area |
| --- | --- |
| 1 | Platform and infrastructure: database layer, query engine, storage, live updates, jobs, API routes, scripts, dependencies, environment variables, tests |
| 2 | Sign-in, access control, app shell, dashboards, roles, audit, notifications, profile |
| 3 | CRM and work: clients, service catalog, projects, tasks, workload, calendar, meetings, tickets, files |
| 4 | Messaging, presence, live updates in the browser, GIFs |
| 5 | People and HR: employees, attendance, leave, payroll, recruitment, exits, reimbursements, HR reports |
| 6 | Finance: quotations, invoices, payments, follow-ups, ledger, banks, purchases, salaries, budgets, P&L, printing |
| 7 | Database: migration timeline, schemas, tables, enums, functions and triggers, RLS, permissions and roles, cron, notification kinds, seed data, relationships |


# Chapter 1 — Platform and infrastructure

Scope: the database layer, query engine, storage, live updates, scheduled jobs, security helpers, push dispatch, every route handler under `src/app/api` and `src/app/auth`, `.well-known`, the proxy, root app files, the service worker, build/test/lint config, the Supabase platform SQL, scripts, dependencies, environment variables and test infrastructure.

All paths are repo-relative to `E:\CRM 2.0`. Line numbers were read from the files on 2026-11-17. Nothing in `.data/` was opened, and no `.env.local` values were read.

---

## 1. Overview

CRM 2.0 is a single Next.js 16 (App Router) application that is both the user interface and the backend. It has no separate API server. Data access is built around three ideas:

1. **One SQL interface, two engines.** `SqlDatabase` (`src/server/database/sqlDatabase.ts:14`) is a three-method interface (`query`, `exec`, `transaction`). On a developer machine it is met by **PGlite** (Postgres compiled to WASM, running inside the Node process and storing to `.data/database`). On Vercel it is met by a small **`pg` pool** pointed at Supabase's connection pooler. `DATABASE_PROVIDER=supabase` is the only switch (`src/server/database/appDatabase.ts:7-9`).

2. **PostgREST in-process.** Application code uses the standard `@supabase/postgrest-js` query builder, typed by the generated `src/types/databaseTypes.ts`. The client is given a custom `fetch` (`src/server/database/queryClients.ts:19-22`) that never touches the network. Each request is handed to `handleDatabaseRequest` (`src/server/database/queryEngine.ts:677`), a ~740-line PostgREST subset that turns the URL and body into parameterised SQL. It reads the schema from the Postgres catalogs (`databaseSchemaInfo.ts`) and runs the SQL **inside a transaction as the caller's database role**, so row level security (RLS) decides everything.

3. **The database enforces.** The query engine switches to `anon`, `authenticated` (with `request.jwt.claim.sub` = user id) or `service_role` per transaction (`sqlDatabase.ts:26-35`). RLS policies, `security definer` functions and guard triggers in the 69 migrations do the real authorisation. The app's own checks are only there to give clearer messages.

Platform services are swapped in the same way:

| Concern | Local (PGlite) | Supabase / Vercel |
| --- | --- | --- |
| Scheduled jobs | `cron.job` table emulated in the first migration, run every minute by `backgroundServices.ts` | real `pg_cron` |
| Outgoing HTTP (push) | `net.http_request_queue` + `pg_notify('net_requests')`, drained by `backgroundServices.ts` | real `pg_net` → `/api/notifications/dispatch` |
| Live updates | `pg_notify('live_changes')` → in-process hub → SSE `/api/live` | `realtime.send` → Supabase Realtime public channel |
| File bytes | `.data/files` via `objectStore.ts`, signed tokens to `/api/storage/*` | Supabase Storage signed URLs (`supabaseStorage.ts`) |
| Migrations | applied on first database open | `npm run db:supabase` only |

Sign-in is the app's own code on both (`src/server/auth`, tables in `auth.*` locally, later moved to `app_auth.*`; `app_auth.*` from the start on Supabase).

---

## 2. Per-file explanation

### 2.1 `src/server/database/`

#### `sqlDatabase.ts` (35 lines)
- **Purpose:** the minimal contract every database must meet, plus the identity switch.
- **Exports:**
  - `SqlResult<T>` = `{ rows: T[]; affectedRows?: number }` (`:6`).
  - `SqlRunner` with `query(sql, params?)` and `exec(sql)` (`:8-12`). `exec` runs multi-statement SQL without parameters, which migrations need.
  - `SqlDatabase extends SqlRunner` adds `transaction(work)` (`:14-16`). PGlite's own `PGlite` object satisfies this structurally, so no adapter class is needed for the local engine.
  - `Identity` union: `anon`, `authenticated` + `userId`, `service_role` (`:18-21`).
  - `runAs(db, identity, work)` (`:26-35`) opens a transaction and in **one statement** runs `set_config('request.jwt.claim.sub', $1, true), set_config('role', $2, true)`. Both are transaction-local (`true` = `is_local`), so nothing leaks to the next use of a pooled connection. One round trip is saved on the hosted database (comment `:28`).
- **Note:** `auth.uid()` in both platforms reads `request.jwt.claim.sub` (local platform migration `:80-89`; Supabase provides its own `auth.uid()` that reads the same setting).

#### `appDatabase.ts` (64 lines)
- **Purpose:** the process-wide database singleton and the provider switch.
- `databaseProvider()` (`:7-9`) returns `'supabase'` only when `DATABASE_PROVIDER === 'supabase'`, otherwise `'local'`.
- `openLocal()` (`:16-23`) dynamically imports `localDatabase.ts`, opens the folder from `defaultDatabaseOptions()`, then dynamically imports and runs `startBackgroundServices(db)`. The dynamic import keeps tests and scripts that open their own database from starting timers (comment `:19`).
- `openSupabase()` (`:28-36`) requires `SUPABASE_DB_POOLER_URL`, opens a `pg` pool via `openPostgresDatabase`, then `configureHostedDispatch` (`:40-51`): if `NOTIFICATION_DISPATCH_URL` and `NOTIFICATION_DISPATCH_SECRET` are both set, it compares them with `private.app_settings` and calls `public.configure_notification_dispatch($1,$2)` only when they changed. No migrations and no background services run here (comment `:25-27`).
- `getAppDatabase()` (`:55-64`) memoises the promise on `globalThis[Symbol.for('crm.localDatabase')]` (`:13`), so Next.js dev-mode hot reloads reuse the open PGlite instead of trying to open the locked folder twice. A failed open deletes the cached promise so the next request retries (`:58-61`).

#### `localDatabase.ts` (67 lines)
- **Purpose:** open the embedded PGlite database.
- `defaultDatabaseOptions()` (`:15-24`): `DATABASE_DIR` (or `.data/database`) resolved against `process.cwd()`; `'memory://'` is passed through for throwaway databases. Migrations come from `database/migrations`. `/* turbopackIgnore: true */` comments stop Turbopack tracing these runtime paths.
- `claimLock(dataDir)` (`:35-54`): writes `<dataDir>.lock` with the PID. If an existing lock names a different, still-running PID (`process.kill(pid, 0)`, `:26-33`), it throws "already open in another program". The lock is removed on process `exit` only if it still holds this PID.
- `openDatabase(options)` (`:56-67`): creates the parent folder, claims the lock (skipped for memory), `PGlite.create(dir)`, sets `timezone = 'UTC'`, then `applyMigrations(db, migrationsDir)` (always the `'local'` platform). Returns the raw `PGlite` instance.

#### `postgresDatabase.ts` (67 lines)
- **Purpose:** a `SqlDatabase` backed by `pg.Pool` for Supabase.
- `pg.types.setTypeParser(INT8, …)` (`:8-11`) turns `bigint` into a JS number when it is a safe integer, matching PGlite's behaviour so `count(*)` etc. look the same on both. This is a **global** side effect on the `pg` module.
- `connectionSettings()` (`:18-22`) strips `sslmode` from the URL and forces `ssl: { rejectUnauthorized: false }` (encrypted, certificate not verified).
- `runner(target)` (`:24-34`) adapts `pool.query`/`client.query` to `SqlRunner`, mapping `rowCount` to `affectedRows`.
- `openPostgresDatabase(url, { maxConnections })` (`:36-67`): pool `max` 3 by default (1 for the migration script), `idleTimeoutMillis` 10 s, `connectionTimeoutMillis` 15 s; `pool.on('error')` logs. `transaction()` checks out a client, `begin` → work → `commit`; on error it rolls back and, if the rollback itself failed, releases the client with the error so the pool destroys it (`:55-63`). Adds `close()` → `pool.end()`.

#### `queryClients.ts` (24 lines)
- `createQueryClient(getDatabase, identity)` (`:14-24`) builds `new PostgrestClient<Database>('http://app.database/rest/v1', { fetch })`. The custom `fetch` resolves the database and identity (identity may be a value or an async function) and returns `handleDatabaseRequest(db, who, new Request(input, init))`. The address is never contacted (`:10-12`).
- `DatabaseClient` type = `PostgrestClient<Database>` (`:8`).

#### `databaseClient.ts` (21 lines)
- `import 'server-only'` (`:1`).
- `createDatabaseClient()` (`:11-15`): reads the session (`getSessionUser`, React-`cache`d per request); identity is `authenticated` + userId unless there is no session or the account is blocked, in which case `anon`.
- `createAdminDatabaseClient()` (`:19-21`): `service_role`, which has `bypassrls` (local platform migration `:13`; Supabase's own role likewise).

#### `queryEngine.ts` (736 lines) — the core
Structure:

| Section | Lines | What it does |
| --- | --- | --- |
| `QueryError` | `:11-21` | carries HTTP status, PostgREST/SQLSTATE code, details, hint |
| helpers | `:27-83` | `firstRow`, `quoteIdent` (doubles `"`), `Params` (collects `$n` values, all stringified or null), `splitTopLevel` (comma split outside `()` and `"…"`), `unquote`, `arrayLiteral` |
| select parser | `:89-119` | `parseSelect` → `star` / `column` (alias, `::cast`) / `embed` (`alias:relation!hint!inner(...)`) items. Column regex `:114` allows only identifiers; cast allows `[A-Za-z_][\w ]*` |
| filters | `:125-199` | `parseOperatorValue` (`not.` prefix, `op.value`), `parseLogic` for `or=(…)`/`and=(…)` with nesting, `comparisonOperators` map (`eq neq gt gte lt lte like ilike cs cd ov`), `conditionSql` validates the column exists (`42703`), handles `is` (null/true/false/unknown), `in` (empty list → `false`), `like/ilike` (`*`→`%`), array ops cast to the column type |
| modifiers | `:203-257` | `readModifiers` groups `order`, `limit`, `offset`, filters by embed path (`files.order`, `owner.status=eq.x`); reserved keys `select`, `columns`, `on_conflict`. `orderSql` supports `asc/desc/nullsfirst/nullslast`. `limitSql` floors and clamps to ≥0 |
| embedding | `:263-414` | `findRelationship` finds FKs in both directions, narrows by `!hint` (FK name or single column name), resolves self-references to many-to-one (`:286-290`), errors `PGRST200` (none) or `PGRST201` (ambiguous, status 300). `embedSql` also supports naming the FK column as the relation (`parent:parent_department_id(name)`, `:339-345`), `!inner` → `exists(...)` added to the parent's WHERE (`:364`), `relation(count)` → `json_build_array(json_build_object('count', …))` (`:366-377`), many-to-one → `row_to_json` of a `limit 1` subquery (`:382-384`), one-to-many → `coalesce(json_agg(...), '[]')` with the embed's own order/limit (`:386-390`). Embeds recurse through `projectionSql` (`:393-414`) with aliases `_s0`, `_s1`… |
| reads | `:462-497` | `readRows` builds `select coalesce(json_agg(_t),'[]')::text from (select … from public."t" as _s0 where … order … limit …) _t`. With `Prefer: count=exact|planned|estimated` it first runs `count(*)` (always exact). `HEAD` returns only `Content-Range`. `shapeRows` (`:442-454`) implements `.single()`/`.maybeSingle()` via `Accept: application/vnd.pgrst.object+json` (error `PGRST116`, 406, when not exactly one row; postgrest-js turns that into `null` for `maybeSingle`) |
| writes | `:501-598` | `finishWrite` returns 201/204 without body unless `Prefer: return=representation`, then wraps the write in `with _w as (… returning _s0.*) select json_agg(projection) from _w` so embeds and RLS-select apply to the returned rows (`:518-520`). `insertRows` uses `json_populate_recordset(null::table, $1::json)` for any number of rows; upsert via `Prefer: resolution=merge-duplicates|ignore-duplicates` and `on_conflict` (default: primary key) (`:552-564`). `updateRows` uses `update … set c = _v.c from json_populate_record(null::table, $1) _v where …` (`:576-592`). `deleteRows` (`:594-598`). `writeColumns` validates every column (`PGRST204`) |
| RPC | `:604-663` | `chooseFunction` picks the first overload whose named args are all known and whose required args are all supplied (`PGRST202` otherwise). `argumentSql` casts each value to the catalogue type (`json/jsonb` → JSON text, arrays → Postgres array literal). Calls use named notation `"arg" => $n::type`. Void → 204; set-returning → `json_agg`; row type → `row_to_json`; scalar → `to_json` (`:642-662`) |
| entry | `:669-736` | `errorStatus` maps SQLSTATE: `42501` → 401 (anon) / 403; `23505 23503 23001` → 409; `P0002` → 404; `22*`, `23*`, `P0001`, `42*` → 400; else 500. `handleDatabaseRequest` strips `…/rest/v1/`, parses the JSON body, loads cached schema, then `runAs(db, identity, …)` dispatches `rpc/<name>` or table by method (GET/HEAD/POST/PATCH/DELETE; others `PGRST117` 405). Errors are serialised as `{ code, message, details, hint }` so postgrest-js produces a normal `PostgrestError`. 5xx and `PGRST*` errors are logged (`:722-724`) |

Every identifier is quoted with `quoteIdent` and checked against the catalogue before use; every value is a bind parameter. The only raw interpolations are: catalogue-derived type names (`argumentSql`, `conditionSql` cast), the regex-restricted select cast, integer limit/offset, and fixed keyword maps.

#### `databaseSchemaInfo.ts` (150 lines)
- `getSchemaInfo(db)` (`:41-48`) caches one `Promise<SchemaInfo>` per database object in a `WeakMap`. Never invalidated for the life of the process.
- `loadSchemaInfo` (`:52-150`) runs four catalogue queries in parallel: columns of `public` relations of kind `r v m p` with `regtype::text` (`:54-60`); primary keys (`:61-68`); FKs where **both** sides are in `public` (`:69-80`); `public` functions (`prokind = 'f'`) with argument names, modes, types and default count (`:81-98`). Names are cast to `text` because `pg` returns `name[]` as a single string (comment `:50-51`).
- Functions: only input modes `i b v` are kept; trailing `pronargdefaults` args are marked `hasDefault` (`:117-127`). `returnKind` is `void`, `row` (composite or `record`) or `scalar` (`:129-134`). Overloads are kept as a list per name.

#### `migrationRunner.ts` (83 lines)
- `applyMigrations(db, dir, platform = 'local')` (`:32-69`): ensures `app_meta.schema_migrations`, reads applied versions, sorts `*.sql` by name, applies each new one **in its own transaction** together with its version row, wraps failures as `Migration <file> failed: …` (the app then refuses to start). Returns the versions applied.
- `readMigration` (`:21-29`): strips a UTF-8 BOM; on `'supabase'` swaps `20261106000000_local_platform` for `database/platform/supabase_platform.sql` (`:12`, `:23-26`) and rewrites `references auth.users` → `references app_auth.users` (`adaptForSupabase`, `:17-19`).
- `ensureLiveTriggers(db)` (`:73-83`): after every run, every `public` table in the `live_updates` publication gets `create or replace trigger zz_live_broadcast after insert or update or delete … execute function live.broadcast_change()`. Adding a table to the publication in a migration is all that is needed.

#### `backgroundServices.ts` (113 lines) — local only
- Typed against `PGlite` (`:4`) because it uses `db.listen`, which `SqlDatabase` does not offer.
- `configureNotificationDispatch` (`:19-25`): points `public.configure_notification_dispatch` at `internal://notifications/dispatch` with secret `'internal'`, unless both `NOTIFICATION_DISPATCH_URL` and `_SECRET` are set.
- `runDueJobs` (`:27-45`): truncates now to the minute (UTC), reads active `cron.job` rows, skips those whose schedule does not match (`scheduleMatches`) or that already ran this minute (`last_run_at`), stamps `last_run_at` **before** running, then `db.exec(job.command)` as the connection's own (superuser) role; failures are logged.
- `sendQueuedRequests` (`:49-85`): a module-level `sending` flag prevents overlap. Loop: `delete from net.http_request_queue where id = (select min(id) …) returning *`. Internal URL → `dispatchNotification(body.id)` (result stored on `globalThis[Symbol.for('crm.lastDispatchResult')]` for test support); other URLs → `fetch` POST with the stored headers and `AbortSignal.timeout`. Errors are logged; the row is already deleted, so there is **no retry**.
- `startBackgroundServices(db)` (`:87-113`): configures dispatch; `LISTEN live_changes` → `publishChange(JSON.parse(payload))`; `LISTEN net_requests` → drain queue; aligns a timer to 2 s past the next minute, then `setInterval(tick, 60_000).unref()`; drains once at start.
- `lastDispatchResult()` (`:15-17`) — used only by `/api/test-support`.

### 2.2 `src/server/storage/`

#### `fileStorage.ts` (66 lines) — the single place file links are made
- `import 'server-only'`. Bucket is fixed to `'files'` (`:12`). Download links live 60 s, upload links 15 min (`:16-17`).
- `requireUserId()` (`:19-23`) — throws if no session or blocked.
- `createUploadLink(path)` (`:26-40`): on Supabase it first checks `canUploadObject` as the user (Storage itself knows nothing of the app's rules) and returns a Storage signed upload URL; locally it returns `/api/storage/upload/<signToken({k:'upload', b, n, u})>`; the disk store checks the RLS insert policy when the bytes arrive.
- `removeStoredFiles(paths)` (`:44-51`): Supabase → Storage bulk delete; local → `removeObjects`. Called after `delete_file` succeeded.
- `createDownloadLink(path, { downloadAs })` (`:53-66`): checks `canReadObject` as the user on both platforms, then a Storage signed URL (with `download=` name) or `/api/storage/object/<signToken({k:'read', b, n, d})>`.

#### `objectStore.ts` (156 lines) — local disk store
- `StorageError(status, message)` (`:12-19`).
- `storageRoot()` (`:22-24`): `FILE_STORAGE_DIR` or `.data/files`.
- `objectPath(root, bucket, name)` (`:28-37`): bucket must match `^[\w-]+$`; name may not contain NUL, `..` or empty segments; the resolved path must stay under `root/bucket/` (path traversal guard).
- `putObject(db, identity, object, root?)` (`:52-108`): loads the bucket (`storage.buckets`), checks the MIME type against `allowed_mime_types` (415), inserts the `storage.objects` row **as the uploader via `runAs`** (so the RLS insert policy `files_bucket_insert` → `can_upload_file_object(name)` decides; `23505`→409, `42501`→403), then streams the body to `<target>.uploading` counting bytes and aborting past `file_size_limit` (413), renames into place, and records `metadata.size` (as the connection role). On any failure it removes the partial file and the row.
- `canUploadObject` (`:113-119`) — `select public.can_upload_file_object($1)` as the user; any bucket other than `files` → false.
- `canReadObject` (`:122-130`) — `exists(select 1 from storage.objects …)` as the user, i.e. the RLS select policy `files_bucket_select` → `can_read_file_object(name)` decides.
- `openObject` (`:132-149`) — reads metadata (no identity; caller has already verified a signed token), `stat`s the file, returns size, content type and a web stream factory.
- `removeObjects` (`:151-156`) — deletes rows and files one by one.

#### `supabaseStorage.ts` (71 lines) — Supabase Storage REST client
- `settings()` (`:9-14`) requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- `objectPath` (`:17-22`) encodes each segment and refuses `''`, `.`, `..`.
- `storageRequest` (`:24-41`) — `fetch` to `${url}/storage/v1…` with `apikey: <secret key>`, 15 s timeout, `cache: 'no-store'`; non-OK responses throw with status and body text.
- `createSignedUploadUrl` (`:45-52`) — `POST /object/upload/sign/<bucket>/<path>` with `x-upsert: false`. Comment says the link is valid for **two hours** (Supabase's fixed lifetime), not the 15 minutes `fileStorage.ts:17` implies.
- `createSignedDownloadUrl` (`:56-65`) — `POST /object/sign/…` with `expiresIn`, adds `download=<name>`.
- `removeStoredObjects` (`:67-71`) — `DELETE /object/<bucket>` with `{ prefixes }`.

### 2.3 `src/server/live/`

#### `liveEvents.ts` (41 lines)
In-process pub/sub hub on `globalThis[Symbol.for('crm.liveEvents')]` (`:17-23`) with two listener sets. Exports `publishChange`/`onChange` (`:25-32`) and `publishTyping`/`onTyping` (`:34-41`). Local mode only; on Vercel each function instance would have its own hub, which is why Supabase uses Realtime.

#### `realtimeChannels.ts` (35 lines)
- `getChangesTopic(db)` (`:16-23`): `changes-<first 32 chars of private.app_settings['live_topic']>`, created on first use via `loadSecret`, cached per db. Same name the SQL trigger `live.broadcast_change()` computes (`database/platform/supabase_platform.sql:110`).
- `getTypingTopic(db, conversationId)` (`:25-28`): `typing-` + first 32 hex of `HMAC-SHA256(signing_secret, 'typing:<id>')`.
- `broadcastTyping(db, signal)` (`:30-35`): `select realtime.send($1::jsonb, 'typing', topic, false)` — a **public** (non-private) broadcast.

#### `liveConfigService.ts` (37 lines)
`getLiveConfig(userId, name, typingConversationIds)` (`:13-37`): local → `{ mode: 'stream' }`. Supabase → requires `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (503 otherwise), checks `can_view_conversation` as the user for each requested conversation, and returns `{ mode: 'realtime', url, key, changesTopic, userId, name, typingTopics }`. The browser side is `src/lib/live/liveUpdates.ts` (379 lines): one `EventSource('/api/live?…')` per tab locally (`:84`), or a lazily imported `RealtimeClient` joining the changes channel and typing channels (`:162-221`), with debounced `router.refresh` (`:316-336`).

### 2.4 `src/server/jobs/cronSchedule.ts` (34 lines)
`scheduleMatches(expression, moment)` (`:22-34`) evaluates a 5-field cron expression in UTC. `fieldMatches` (`:4-20`) supports `*`, lists, ranges, `*/n` and `a-b/n`, and `a/n` meaning `a-max/n`. Day-of-week accepts 0 or 7 for Sunday (`:32`). Day-of-month and day-of-week are **AND**ed (`:27-33`), whereas standard cron (and pg_cron) ORs them when both are restricted. Any malformed expression (extra fields, non-integers, step < 1) returns `false`.

### 2.5 `src/server/security/`

#### `signingSecret.ts` (53 lines)
- `loadSecret(db, key)` (`:9-17`): `insert … on conflict do nothing` a random 32-byte hex value into `private.app_settings`, then read it back. Race-safe across instances.
- `getSigningSecret(db)` (`:19-26`): `loadSecret(db, 'signing_secret')`, cached per db in a `WeakMap`.
- `signToken(db, payload, seconds)` (`:30-36`): `base64url(JSON{…payload, exp}) + '.' + base64url(HMAC-SHA256)`.
- `readToken(db, token)` (`:38-53`): constant-time signature compare (`timingSafeEqual`, length checked first), then JSON parse and `exp` check.

#### `fieldEncryption.ts` (46 lines)
AES-256-GCM, 12-byte random nonce, stored as `v1:` + base64(nonce ‖ 16-byte tag ‖ ciphertext) (`:8-9`, `:29-36`). Key from `FIELD_ENCRYPTION_KEY` (base64, must decode to exactly 32 bytes, `:19-23`). `isEncryptionReady()` (`:25-27`); `EncryptionNotSetUpError` (`:13-17`). Used by employee and bank-account code (`employeeActions.ts`, `ledgerActions.ts`, finance bank pages, employee private-details pages).

### 2.6 `src/server/notificationDispatcher.ts` (117 lines)
`dispatchNotification(notificationId)` (`:20-117`), service role throughout:
1. Returns `{ skipped: 'push is not configured' }` unless `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` are set (`:12-16`).
2. Loads the notification; skips if missing or already read (`:31-37`).
3. Skips if the recipient's `notification_preferences.push_enabled` is false for that kind (`:39-46`), or if `employee_presence.chosen_status = 'do_not_disturb'` (`:49-54`).
4. Loads `push_subscriptions` for the recipient (`:56-61`).
5. If the link is `/tasks/<uuid>`, loads the task's due date and priority (`:64-67`); builds the wording with `buildPushMessage` (`src/lib/notifications/pushMessage.ts`).
6. Payload: id, title, body, `url: /notifications/<id>/open`, `readUrl: /notifications/<id>/read`, `fallbackUrl`, `tag`, `priority` (`:81-90`).
7. `web-push.sendNotification` to every device in parallel with TTL 24 h and `urgency` high/normal (`:95-111`); 404/410 subscriptions are deleted (`:107`, `:113`); `notifications.pushed_at` is stamped (`:114`).

### 2.7 Route handlers

#### `src/app/api/live/route.ts` (142 lines) — SSE stream, local only
- Session required (401); returns 404 on Supabase (`:56-59`).
- `topics` query param: JSON array of `{ table, column?, value? }`, table/column must match `^\w+$`, max 20 (`readSubscriptions`, `:11-29`).
- `typing` query param: up to 5 conversation ids, each kept only if `can_view_conversation` as the user (`:65-72`).
- On each hub change matching a subscription, `canSee` (`:32-51`) re-checks visibility as the user: `exists(select 1 from public."<table>" where id = $1)` or `can_view_conversation(conversation_id)`; DELETE events are always considered visible. Only `{ table, event }` is sent (`:96`), never row data.
- Typing signals from others in allowed conversations are forwarded (`:101-105`). Heartbeat comment every 25 s (`:107-113`). Cleanup on abort/cancel. Headers disable buffering (`X-Accel-Buffering: no`).

#### `src/app/api/live/config/route.ts` (35 lines)
GET. Session required; the caller must have an employee row (`current_employee_id()`) or gets 403 (`:18-25`). `typing` param filtered to lower-case UUIDs, max 5. Returns `getLiveConfig(...)` with `Cache-Control: private, no-store`.

#### `src/app/api/live/typing/route.ts` (34 lines)
POST `{ conversationId: uuid }`. Session required; one query as the user returns `can_view_conversation` and the user's `full_name` (name comes from the database, not the browser) (`:19-26`). Supabase → `broadcastTyping`; local → `publishTyping`. 204.

#### `src/app/api/notifications/dispatch/route.ts` (32 lines)
POST, called by `pg_net` on Supabase (or the local queue when an external URL is configured). Requires header `x-dispatch-secret` equal (constant-time) to `NOTIFICATION_DISPATCH_SECRET` (`:10-18`). Body `{ id: uuid }`. Returns the dispatch result JSON.

#### `src/app/api/integrations/attendance/route.ts` (48 lines)
POST, for Pagerbook-style systems. Header `x-integration-key` constant-time-compared with `ATTENDANCE_IMPORT_SECRET` (`:20-28`); body `{ rows: [{ employee, date, check_in?, check_out? }] }`, 1–5000 rows, validated by zod (`:11-18`). Calls `rpc('import_attendance', { p_rows })` **with the admin client** (`:40-41`). 500 on database error.

#### `src/app/api/storage/upload/[token]/route.ts` (33 lines)
PUT, local only (404 on Supabase). Verifies a `k:'upload'` token, then `putObject` as `{ authenticated, userId: token.u }` with the request body stream and `Content-Type`. Returns `{ Key: 'files/<path>' }` (Storage-compatible shape). `StorageError` → its status.

#### `src/app/api/storage/object/[token]/route.ts` (39 lines)
GET, local only. Verifies a `k:'read'` token, `openObject`, streams it with `Content-Type` from metadata, `Content-Length`, `Content-Disposition` `attachment; filename*=UTF-8''…` when `d` is set or `inline` otherwise, `Cache-Control: private, no-store`.

#### `src/app/api/test-support/[...path]/route.ts` (80 lines)
All methods (`:80`). Returns 404 unless `TEST_SUPPORT_SECRET` is ≥32 chars and the `apikey` header or `Authorization: Bearer` matches (constant time) (`:15-22`). Mimics a slice of Supabase's HTTP API so browser tests written for Supabase keep working:
- `rest/v1/*` → query engine as `service_role` (`:30-32`).
- `as/<uuid>/rest/v1/*` → query engine as that user (`:35-38`).
- `GET dispatch/last` → last push result (`:40-42`).
- `POST auth/v1/admin/users` → `createAuthUser` (`:44-55`); `DELETE auth/v1/admin/users/<uuid>` → `deleteAuthUser` (`:57-61`).
- `DELETE storage/v1/object/<bucket>` → remove objects on either provider (`:63-69`).
- `GET mail?to=&kind=` → latest queued invite/recovery link (`:71-75`).

#### `src/app/auth/confirm/route.ts` (28 lines)
GET `?token=&type=invite|recovery`. `redeemOneTimeLink` → on success `startSession(userId)` and redirect to `/set-password`; otherwise `/login?error=link-expired`.

#### `src/app/auth/end-session/route.ts` (9 lines)
GET. `finishSession()` (deletes the session row and cookie) and redirects to `/login`.

#### `src/app/.well-known/assetlinks.json/route.ts` (29 lines)
GET, `force-dynamic`. Builds the Android Digital Asset Links statement from `ANDROID_APP_PACKAGE` and comma-separated `ANDROID_APP_SHA256` (each must match the 32-byte colon-hex pattern, `:16`). Empty array otherwise. Cached publicly for an hour.

#### Other route handlers (owned by feature areas, listed for completeness)
`src/app/(crm)/files/[fileId]/download/route.ts` (GET; checks the file and version as the user, records access with `record_file_access`, picks view vs download by `previewKindOf`, then 302 to `createDownloadLink`), `notifications/[notificationId]/open` (GET), `notifications/[notificationId]/read` (POST, used by the service worker), `calendar/import-template` and nine spreadsheet `…/export` routes under finance, HR and people.

### 2.8 `src/proxy.ts` (35 lines) and the route guard
- Next.js 16 "proxy" (the renamed middleware). `proxy()` calls `guardRoute` (`src/lib/auth/routeGuard.ts:33-47`).
- **Matcher** (`:22-35`): everything except static assets, `sw.js`, `manifest.webmanifest`, `images/`, `.well-known/`, `__/` (Firebase auth handler) and `api/live`; and only when the request is **missing** all of: `next-action` header, `next-router-prefetch` header, `purpose: prefetch` header, and the `crm_session` cookie. The proxy therefore runs only for visitors without a session cookie (cost saving on Vercel, comment `:8-21`).
- `guardRoute`: if no session cookie and the path is not public (`/login`, `/forgot-password`, `/setup`, `/auth/confirm`, `/auth/end-session`, `/api/notifications/dispatch`, `/api/integrations/attendance`, `/api/storage/upload`, `/api/storage/object`, `/api/test-support`, `routeGuard.ts:6-17`), redirect to `/login?next=…`. It has a second branch that sends signed-in users away from `/login` (`:42-44`) — unreachable because of the matcher (see Observations).

### 2.9 Root app files
- `src/app/layout.tsx` (33 lines): loads Geist via `next/font/google` as `--font-sans`; metadata title template `%s | BMU Workspace`, `robots: noindex,nofollow`; viewport `interactiveWidget: 'resizes-content'` so the mobile keyboard shrinks the page (chat composer stays visible); reads the `theme` cookie and sets `data-theme` on `<html>` (light/dark/unset = follow system). Calling `cookies()` makes every route dynamic.
- `src/app/manifest.ts` (27 lines): PWA manifest, `id`/`start_url` `/overview`, standalone, theme `#1f6f5c`, three PNG icons including a maskable one; read by PWABuilder for the Android TWA.
- `src/app/page.tsx` (6 lines): redirects `/` to `/overview`.
- `src/app/not-found.tsx` (14 lines): `EmptyState` with a link to the overview.
- `icon.png`, `apple-icon.png`: file-convention icons.
- `src/app/globals.css` (206 lines), summary: design tokens on `:root` (`--color-primary #1f6f5c`, page/surface/border/text/good/warning/critical colours, shadows, radii 6/8/12 px, type scale `--text-small` 0.8125 rem to `--text-display` 1.875 rem, `--sidebar-width: 240px`), a dark palette under `@media (prefers-color-scheme: dark)` (guarded so an explicit light theme wins) and again under `:root[data-theme='dark']`, a small reset (`box-sizing`, `html`, `body`, lists, links, form controls), `:focus-visible` outline, `.visually-hidden`, `prefers-reduced-motion` and an `@page` print rule.

### 2.10 `public/sw.js` (64 lines)
Push-only service worker (no caching, `:1-2`). `push` (`:4-31`): parses JSON (falls back to a generic title), `showNotification` with icon/badge PNGs, `tag`, `requireInteraction` for high priority, and **Open** / **Mark as read** actions when `readUrl` is present. `notificationclick` (`:39-64`): "read" POSTs `readUrl` with same-origin credentials; otherwise navigates/focuses an existing window or opens a new one. `sameSite()` (`:34-37`) refuses any cross-origin URL.

### 2.11 Build, lint and test configuration
- `next.config.ts` (48 lines): `poweredByHeader: false`; `serverExternalPackages: ['@electric-sql/pglite']` so PGlite loads its WASM files from `node_modules` (`:12`); `experimental.staleTimes.dynamic = 30` (client router cache for 30 s, `:13-18`); `images.formats: ['image/webp']`; rewrite `/__/auth/:path*` → `https://<NEXT_PUBLIC_FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/:path*` when the project id is set (`:22-25`); security headers `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` on everything except `/__/` (`:26-36`); a one-day cache with a week of stale-while-revalidate on `/images/*` (`:37-43`). No Content-Security-Policy.
- `vercel.json`: `regions: ["bom1"]` (Mumbai, next to the Supabase project).
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `moduleResolution: bundler`, path alias `@/*` → `src/*`, excludes `supabase`.
- `eslint.config.mjs`: flat config from `eslint-config-next` (`core-web-vitals` + `typescript`); ignores `.next`, `node_modules`, `next-env.d.ts` and `src/types/supabaseDatabase.ts` (a file that does not exist).
- `vitest.config.mts`: alias `@`, `include: tests/**/*.test.ts`, `testTimeout` 30 s, `hookTimeout` 120 s (each file builds a database from all migrations in `beforeAll`).

### 2.12 `database/platform/supabase_platform.sql` (129 lines)
Replaces `20261106000000_local_platform.sql` on Supabase. It:
- sets default privileges in `public` to grant all on tables, sequences and functions to `anon`, `authenticated`, `service_role` (`:9-11`); each later migration revokes what a role should not have;
- enables `pg_cron` and `pg_net` (in `extensions`) only if their functions do not already exist (`:18-27`);
- creates `app_auth` (revoked from `public`) with `users`, `sessions` (token **hash** only), `one_time_tokens`, `outgoing_emails` (`:34-85`);
- creates the `live_updates` publication and `live.broadcast_change()` (`:95-129`): `security definer`, `search_path = ''`, reads `live_topic` from `private.app_settings` (does nothing until it exists), collects only `id`, `*_id`, `assigned_to`, `created_by` keys from the row, and calls `realtime.send(payload, 'change', topic, false)`. Any exception is swallowed so a live update can never roll back a write.

The local counterpart `20261106000000_local_platform.sql` (245 lines) builds the same building blocks itself: the three roles (`service_role bypassrls`, `:11-13`), `auth.users/sessions/one_time_tokens/outgoing_emails` and `auth.uid()` (`:27-89`), `storage.buckets/objects` (`:95-120`), an emulated `cron` schema with `cron.schedule/unschedule` (`:126-154`), an emulated `net.http_post` that queues into `net.http_request_queue` and `pg_notify('net_requests', id)` (`:160-193`), the publication and a `live.broadcast_change()` that uses `pg_notify('live_changes', …)` (`:199-220`), and a stand-in `realtime` schema (`:224-245`).

### 2.13 `supabase/templates/`
Contains `inviteEmail.html` and `recoveryEmail.html`, but both are **empty directories**, not files. Nothing in `src`, `scripts` or `docs` references them.

### 2.14 `scripts/`
- `generateDatabaseTypes.ts` (348 lines): opens a `memory://` PGlite with all migrations (`:333-341`), reads enums, columns (with array element types, nullability, defaults, identity, generated), FKs (with an `isOneToOne` flag from unique indexes, `:96-114`) and functions (excluding trigger functions, skipping those with unnamed inputs, `:208`), and writes `src/types/databaseTypes.ts` in the Supabase CLI shape (`Tables`, `Views`, `Functions` with overload unions, `Enums`, `Constants`, helper types `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`). Safe to run while dev runs (memory database).
- `migrateSupabase.ts` (39 lines): loads `.env.local`, requires `SUPABASE_DB_SESSION_URL` (session pooler, port 5432, needed because migrations hold one connection), opens a 1-connection pool, `applyMigrations(db, …, 'supabase')`, prints the host and applied versions.
- `createFounderAccount.ts` (48 lines): optional `.env.local`, `--name --email --password` (≥10 chars, letters and digits), opens the **default local folder** with `openDatabase` (runs migrations, takes the lock), `createFounder`, closes. Dev server must be stopped.
- `convertImagesToWebp.ts` (38 lines): recursively converts JPG/PNG in `public/images` to WebP quality 82 with `sharp` and **deletes the originals**.
- `saveVersion.ps1` (36 lines): validates `Name_<n>` or `BeforeRevert_<date>_<time>`, refuses an existing name, `robocopy /E` the project into `C:\Users\dhanu\.claude\projects\e--CRM-2-0\versions\<Name>` excluding `node_modules .next .git .vercel .temp coverage .data`, `.env*` files and `tsconfig.tsbuildinfo`.
- `restoreVersion.ps1` (37 lines): saves `BeforeRevert_<timestamp>` first via `saveVersion.ps1`, then `robocopy /MIR` back with the same exclusions (so `.data` and env files are untouched).

---

## 3. Request and query lifecycle

### 3.1 A page read (local)
1. Browser requests `/tasks`. If it carries `crm_session`, the proxy does not run (matcher `missing` cookie). Without it, `guardRoute` redirects to `/login?next=/tasks`.
2. The page (server component) calls `requireAccess`/a service, which calls `createDatabaseClient()` (`databaseClient.ts:11`).
3. `getSessionUser()` (`currentSession.ts:15-19`, React `cache` per request) reads the cookie and calls `findSessionUser(await getAppDatabase(), token)`, which hashes the token and looks up `auth.sessions` / `app_auth.sessions`.
4. On the first request in the process `getAppDatabase()` opens PGlite, claims the lock, applies pending migrations, ensures live triggers, configures dispatch, starts LISTENers and the minute timer.
5. The service calls e.g. `db.from('tasks').select('id, title, assignee:employees!tasks_assigned_to_fkey(full_name)').eq('status','open').order('due_date')`. postgrest-js builds `GET http://app.database/rest/v1/tasks?select=…&status=eq.open&order=due_date` and calls the custom `fetch`.
6. `handleDatabaseRequest` parses the URL, loads the cached `SchemaInfo`, and inside `runAs(db, {authenticated, userId}, …)` executes `begin; select set_config(...), set_config('role','authenticated'); select coalesce(json_agg(_t),'[]')::text …; commit`.
7. Postgres applies RLS on `tasks` and on the embedded `employees` subquery, returns one text column of JSON. The engine wraps it in a `Response` with `Content-Type: application/json` (and `Content-Range` if counting).
8. postgrest-js parses it into `{ data, error, count, status }`.

### 3.2 A write from a server action
Same path with POST/PATCH/DELETE. Without `.select()` the engine returns 201/204 and **no indication of how many rows changed**, since RLS filters an UPDATE/DELETE silently (CLAUDE.md rule: always `.select()` and check a row came back). With `.select()` it uses `with _w as (… returning _s0.*)` and the returned rows also pass the select policy. Errors keep their SQLSTATE (`23505`, `23001`, `P0001`, `42501`…) in `error.code`.

### 3.3 Supabase differences in the same path
Step 4 opens a `pg.Pool` (max 3) to the transaction pooler instead; there are no migrations, LISTENers or timers. Step 6 runs over the network: four round trips per query (`begin`, `set_config`, query, `commit`). The schema-info load (4 catalogue queries) happens once per warm function instance.

### 3.4 Database-triggered side effects
- **Notification created** → trigger calls `net.http_post(dispatch_url, {id})`.
  - Local: row in `net.http_request_queue` + `NOTIFY net_requests` → `sendQueuedRequests` → `dispatchNotification` in process.
  - Supabase: `pg_net` POSTs to `/api/notifications/dispatch` with `x-dispatch-secret` → `dispatchNotification`.
- **Row changed in a `live_updates` table** → `zz_live_broadcast` trigger.
  - Local: `NOTIFY live_changes` → `publishChange` → every open `/api/live` stream filters by subscription and `canSee`, then sends `event: change`.
  - Supabase: `realtime.send(..., 'change', changes-<topic>, false)` → browsers on that public channel filter by their own topics (`changeMatches`, `src/lib/live/liveConfig.ts:25-30`) and refresh.
- **Scheduled jobs**: migrations call `cron.schedule`. Local: `runDueJobs` each minute; Supabase: `pg_cron`.

### 3.5 File upload and download
- Upload (local): action creates the file record and calls `createUploadLink` → `/api/storage/upload/<token>` (15 min) → browser PUTs bytes → `putObject` inserts `storage.objects` as the user (RLS) → bytes to disk → size recorded → action "confirm" reads the real size from `storage.objects`.
- Upload (Supabase): `canUploadObject` as user → Supabase signed upload URL → browser PUTs directly to Storage → Storage writes the `storage.objects` row with real size/type.
- Download: `/files/<id>/download` → RLS reads of `files` and `file_versions` → `record_file_access` → `createDownloadLink` (`canReadObject` as user) → 302 to a 60 s link (local `/api/storage/object/<token>` or Storage signed URL).

---

## 4. Local vs Supabase differences

| Aspect | Local (`DATABASE_PROVIDER` unset) | Supabase (`DATABASE_PROVIDER=supabase`) | Code |
| --- | --- | --- | --- |
| Engine | PGlite (WASM Postgres) in-process, `.data/database` or `DATABASE_DIR` | `pg.Pool` to `SUPABASE_DB_POOLER_URL` (port 6543), max 3 | `appDatabase.ts:16-36`, `postgresDatabase.ts:36-42` |
| Concurrency guard | `<dir>.lock` PID file | none needed | `localDatabase.ts:35-54` |
| Migrations | auto on first open, `local` platform | `npm run db:supabase` via `SUPABASE_DB_SESSION_URL`; `supabase_platform.sql` replaces the first migration; `references auth.users` rewritten to `app_auth.users` | `migrationRunner.ts:17-29`, `scripts/migrateSupabase.ts` |
| Account tables | `auth.*` first, moved to `app_auth` by a later migration | `app_auth.*` from the start; Supabase's `auth.*` untouched | `supabase_platform.sql:34-85` |
| Roles | created by first migration | provided by Supabase | local platform `:11-13` |
| `bigint` decoding | numbers (PGlite) | parsed to number if safe | `postgresDatabase.ts:8-11` |
| TLS | n/a | encrypted, cert not verified | `postgresDatabase.ts:18-22` |
| Scheduled jobs | `cron.job` emulation run by app timer each minute | `pg_cron` | `backgroundServices.ts:27-45` |
| Push requests | `net.http_request_queue` drained in-process, `internal://` URL | `pg_net` → `/api/notifications/dispatch` | `backgroundServices.ts:19-25,49-85`; `appDatabase.ts:40-51` |
| Live changes | `pg_notify` → hub → SSE `/api/live` with per-row RLS check | `realtime.send` on public channel `changes-<secret>`; no per-row check, ids only | `api/live/route.ts:32-51`; `supabase_platform.sql:99-129` |
| Typing | `publishTyping` hub → SSE | `realtime.send` on `typing-<HMAC>` public channel | `api/live/typing/route.ts:31-32` |
| `/api/live`, `/api/storage/*` | active | return 404 | `api/live/route.ts:59`, storage routes `:12` |
| File bytes | `.data/files` or `FILE_STORAGE_DIR` | Supabase Storage via secret key | `objectStore.ts:22-24`, `supabaseStorage.ts` |
| Upload link | app token, 15 min, RLS checked on arrival | Storage signed URL (Supabase fixed ~2 h), RLS checked before issuing | `fileStorage.ts:26-40` |
| Download link | app token, 60 s | Storage signed URL, 60 s | `fileStorage.ts:53-66` |
| Background services | started | not started | `appDatabase.ts:20-21` |
| Region | n/a | Vercel `bom1` | `vercel.json` |

---

## 5. API routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/live` | session cookie (not blocked); 404 on Supabase | SSE stream of change and typing events, filtered by RLS |
| GET | `/api/live/config` | session + employee row | Live-update mode, Realtime URL/key/topics, typing topics for ≤5 allowed conversations |
| POST | `/api/live/typing` | session + conversation member | Announce typing (hub or Realtime) |
| POST | `/api/notifications/dispatch` | `x-dispatch-secret` = `NOTIFICATION_DISPATCH_SECRET` | Deliver one notification as web push |
| POST | `/api/integrations/attendance` | `x-integration-key` = `ATTENDANCE_IMPORT_SECRET` | Bulk attendance import via `import_attendance` (admin client) |
| PUT | `/api/storage/upload/[token]` | signed upload token (+ RLS as token's user); 404 on Supabase | Receive file bytes to disk |
| GET | `/api/storage/object/[token]` | signed read token (60 s); 404 on Supabase | Stream a stored file |
| GET/POST/PATCH/DELETE/HEAD | `/api/test-support/[...path]` | `TEST_SUPPORT_SECRET` (≥32 chars) in `apikey` or Bearer; else 404 | Supabase-shaped helpers for browser tests |
| GET | `/auth/confirm?token=&type=` | one-time link | Redeem invite/recovery link, start session, go to `/set-password` |
| GET | `/auth/end-session` | none | Delete session and cookie, go to `/login` |
| GET | `/.well-known/assetlinks.json` | public | Android TWA Digital Asset Links |
| GET | `/manifest.webmanifest` | public | PWA manifest (`src/app/manifest.ts`) |
| GET | `/__/auth/*` | public | Rewrite to Firebase's auth handler (`next.config.ts:22-25`) |

---

## 6. Scripts

| Command | File | What it does | Touches `.data`? |
| --- | --- | --- | --- |
| `npm run dev` | — | `next dev` (port 3000) | yes, opens and locks it |
| `npm run build` / `start` | — | production build / server | `start` opens it unless `DATABASE_DIR` set |
| `npm run lint` | `eslint.config.mjs` | ESLint (Next core-web-vitals + TS) | no |
| `npm run typecheck` | `tsconfig.json` | `tsc --noEmit` | no |
| `npm test` / `test:watch` | `vitest.config.mts` | all `tests/**/*.test.ts`, in-memory databases | no |
| `npm run images:webp` | `scripts/convertImagesToWebp.ts` | JPG/PNG → WebP, deletes originals | no |
| `npm run founder:create -- …` | `scripts/createFounderAccount.ts` | create the Founder login + employee | **yes** (must stop dev) |
| `npm run db:types` | `scripts/generateDatabaseTypes.ts` | regenerate `src/types/databaseTypes.ts` from a memory DB | no |
| `npm run db:supabase` | `scripts/migrateSupabase.ts` | apply pending migrations to Supabase | no |
| `powershell -File scripts/saveVersion.ps1 -Name X_1` | `scripts/saveVersion.ps1` | snapshot project to the versions folder | excluded |
| `powershell -File scripts/restoreVersion.ps1 -Name X_1` | `scripts/restoreVersion.ps1` | save current state, mirror snapshot back | excluded |

---

## 7. Dependencies

| Package | Version | Kind | Purpose / where used |
| --- | --- | --- | --- |
| `next` | 16.4.5 | runtime | framework, App Router, server actions, proxy |
| `react`, `react-dom` | 19.3.1 | runtime | UI |
| `@electric-sql/pglite` | 0.5.15 (pinned) | runtime | embedded Postgres (`localDatabase.ts`), tests, type generator; marked `serverExternalPackages` |
| `pg` | 8.23.1 (pinned) | runtime | hosted Postgres pool (`postgresDatabase.ts`) |
| `@supabase/postgrest-js` | 2.119.0 (pinned) | runtime | query builder, used only as a library (`queryClients.ts`) |
| `@supabase/realtime-js` | 2.119.0 (pinned) | runtime | browser Realtime client, lazy-loaded (`src/lib/live/liveUpdates.ts:3,163`) |
| `firebase` | ^13.2.0 | runtime | browser-only Google sign-in popup/redirect; server verifies tokens itself (`firebaseTokens.ts`) |
| `web-push` | ^3.6.7 | runtime | VAPID web push (`notificationDispatcher.ts`) |
| `zod` | ^4.6.7 | runtime | request/form validation (route handlers, `src/lib/validation`) |
| `lucide-react` | ^1.70.0 | runtime | icons |
| `server-only` | ^0.0.1 | runtime | build-time guard against importing server modules into client code |
| `sharp` | ^0.35.5 | runtime | `scripts/convertImagesToWebp.ts`; also used by `next/image` optimisation |
| `typescript` | ^5.9.0 | dev | type checking |
| `eslint`, `eslint-config-next` | ^9, 16.4.5 | dev | linting |
| `vitest` | ^5.1.0 | dev | tests |
| `tsx` | ^4 | dev | running TypeScript scripts |
| `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom`, `@types/web-push` | various | dev | typings |

Engine requirement: Node ≥ 20.9.0 (`package.json:5-7`). Note `process.loadEnvFile` (used by both scripts) needs Node ≥ 20.12/21.7, slightly newer than the declared minimum.

---

## 8. Environment variables

| Name | Read at | Purpose | Where set |
| --- | --- | --- | --- |
| `DATABASE_PROVIDER` | `src/server/database/appDatabase.ts:8` | `supabase` switches DB, storage, jobs, live | Vercel only |
| `DATABASE_DIR` | `src/server/database/localDatabase.ts:18` | local DB folder or `memory://` | optional; test server uses `.data/test-database` |
| `FILE_STORAGE_DIR` | `src/server/storage/objectStore.ts:23` | local file folder | optional |
| `SUPABASE_DB_POOLER_URL` | `appDatabase.ts:29` | transaction pooler (6543) for the app | Vercel |
| `SUPABASE_DB_SESSION_URL` | `scripts/migrateSupabase.ts:14` | session pooler (5432) for migrations | `.env.local` |
| `SUPABASE_URL` | `src/server/storage/supabaseStorage.ts:10`, `src/server/live/liveConfigService.ts:20` | Storage REST and Realtime base | Vercel |
| `SUPABASE_PUBLISHABLE_KEY` | `liveConfigService.ts:21` | sent to browsers for Realtime | Vercel |
| `SUPABASE_SECRET_KEY` | `supabaseStorage.ts:11` | Storage admin calls | Vercel (secret) |
| `NOTIFICATION_DISPATCH_URL` | `appDatabase.ts:41`, `backgroundServices.ts:20` | where the DB posts push requests | Vercel (optional locally) |
| `NOTIFICATION_DISPATCH_SECRET` | `appDatabase.ts:42`, `backgroundServices.ts:21`, `src/app/api/notifications/dispatch/route.ts:11` | shared secret for dispatch | Vercel (secret) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `src/server/notificationDispatcher.ts:14,25`, `src/app/(crm)/layout.tsx:21`, `src/app/(crm)/profile/notifications/page.tsx:14` | web push public key | both |
| `VAPID_PRIVATE_KEY` | `notificationDispatcher.ts:14,26` | web push signing | both (secret) |
| `VAPID_SUBJECT` | `notificationDispatcher.ts:14,24` | `mailto:` contact for push services | both |
| `ATTENDANCE_IMPORT_SECRET` | `src/app/api/integrations/attendance/route.ts:21` | integration key; empty disables the API | optional |
| `NEXT_PUBLIC_SITE_URL` | `src/server/auth/accountEmails.ts:12` | base URL in invite/reset links | both |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `src/lib/auth/firebaseConfig.ts:13` | Firebase web config | both |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.ts:14` | Firebase auth domain (site's own domain on Vercel) | both |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `firebaseConfig.ts:15`, `next.config.ts:7` | token audience check and `/__/auth` rewrite | both |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `firebaseConfig.ts:16` | Firebase web config | both |
| `FIELD_ENCRYPTION_KEY` | `src/server/security/fieldEncryption.ts:19` | AES-256-GCM key for Aadhaar/bank/PAN | both, different values |
| `ALLOW_INSECURE_COOKIES` | `src/server/auth/currentSession.ts:26` | drop `Secure` on cookies over plain HTTP | rare |
| `ANDROID_APP_PACKAGE` | `src/app/.well-known/assetlinks.json/route.ts:12` | TWA package name | Vercel |
| `ANDROID_APP_SHA256` | `assetlinks.json/route.ts:13` | TWA signing fingerprints | Vercel |
| `GIPHY_API_KEY` | `src/server/services/gifService.ts:13,23` | GIF/sticker search | optional |
| `TEST_SUPPORT_SECRET` | `src/app/api/test-support/[...path]/route.ts:16` | enables test API (≥32 chars) | port-3100 test server only |
| `NODE_ENV` | `currentSession.ts:26`, `src/server/auth/authAccounts.ts:178` | secure cookies; dev-only console output | framework |

All names in `.env.example` are read somewhere. `TEST_SUPPORT_SECRET` is deliberately absent from `.env.example`.

---

## 9. Tests

### 9.1 Infrastructure
- Runner: Vitest 5, `tests/**/*.test.ts`, 30 s per test, 120 s hooks (`vitest.config.mts`). 47 test files, about 605 `it(` cases.
- **`tests/helpers/testDatabase.ts` (110 lines)**:
  - `testDatabase()` (`:20-23`) lazily opens **one PGlite per test file** with `dataDir: 'memory://'` and the real `database/migrations` (so no lock file and nothing on disk). Vitest runs each file in its own worker module scope, so files never share a database.
  - File bytes go to a fresh `mkdtemp` folder under the OS temp directory (`:17`).
  - `anonymousClient()` / `adminClient()` (`:31-32`) and `signIn(email)` (`:40-44`, uses the real `checkPassword`) return real `PostgrestClient`s from `createQueryClient`, so tests exercise the **same query engine and RLS** the app uses. A `WeakMap` remembers each client's identity (`:18`, `:25-29`).
  - `createLogin` (`:36-38`) → `createAuthUser`.
  - `uploadAs` (`:47-59`) → `putObject` as the client's identity; `canDownload` (`:62-68`) → `canReadObject`.
  - `createTestPeople(runId)` (`:70-110`): `addPerson(key, role, department, managerKey?)` creates a login, inserts an `employees` row with the admin client, signs in, and stores the id and client. `removeEveryone` is a no-op because the database is thrown away.
- `tests/supabasePlatformRules.test.ts` builds its own PGlite with a `supabaseShell` (`:16-84`) that imitates Supabase (roles, Supabase-shaped `auth.*`, `storage.*`, `realtime.messages`/`send`, `cron`, `net.http_post` into `net.requests`) and then runs `applyMigrations(…, 'supabase')`.
- 13 files are pure unit tests with no database (listed below with "unit").

### 9.2 Test files

| File | Lines | Kind | Covers |
| --- | --- | --- | --- |
| `accessRegistries.test.ts` | 53 | unit | navigation and dashboard built from permissions, including unknown roles |
| `attendanceBulkCorrection.test.ts` | 121 | DB | correcting attendance for many people/days, skipping leave, holidays, week offs; one audit entry |
| `attendanceHelpers.test.ts` | 165 | unit | `summariseAttendance`: working days, lateness after grace, early leaving, leave/holidays |
| `attendanceLeave.test.ts` | 205 | DB | work from home, breaks, HR day status, leave carry-forward, leave report, holiday types |
| `calendarHelpers.test.ts` | 67 | unit | calendar date validation, month ranges as whole weeks, India time helpers |
| `calendarSheetImport.test.ts` | 138 | unit | CSV/XLSX reading (custom zip parser), calendar sheet dates/times |
| `chatActionsRules.test.ts` | 200 | DB | 5-minute edit/delete, delete for me, star, message info, ticks, task times |
| `chatReactionsGifs.test.ts` | 137 | DB+unit | one reaction per person, outsiders blocked, emoji and GIPHY URL validation |
| `chatStatusRules.test.ts` | 228 | DB | read ticks, contact cards, polls, events, availability, task reviewers |
| `clientServicesHelpers.test.ts` | 45 | unit | service/sub-service selection checks and wording |
| `contentCalendarFiles.test.ts` | 158 | DB | content calendar categories and who files under them, permanent file delete, unused leave type delete |
| `cronSchedule.test.ts` | 34 | unit | `scheduleMatches` steps, ranges, lists, Sunday 0/7, malformed |
| `databaseAccessRules.test.ts` | 348 | DB | anonymous blocked everywhere, role permissions, self-role change refused, escalation rules |
| `documentOverview.test.ts` | 59 | DB+unit | project overview ≤3 lines, editable only on draft, carried to invoice |
| `documentOverviewWriter.test.ts` | 68 | unit | generated overview/title wording, 400-char limit |
| `documentSignatureRules.test.ts` | 150 | DB | signatures and seals on documents, who may save/see them, service details on items |
| `employeeRecord.test.ts` | 263 | DB+unit | private details access, identity/bank details, recorded reveals, history, field encryption |
| `fewerCallsRules.test.ts` | 86 | DB | mark-read only when new, dispatch only when someone can receive push, payment details |
| `financeHelpers.test.ts` | 203 | unit | rupee formatting, amount in words, GST split, finance report, financial periods, due/overdue |
| `financeLedger.test.ts` | 206 | DB+unit | bank statement CSV parsing, ledger visibility, removal with reason, salary expenses, balances, reconciliation |
| `followUpsReceipts.test.ts` | 110 | DB | payment follow-ups, receipt number series, reminders |
| `googleSignInRules.test.ts` | 141 | DB+unit | Firebase ID token verification with a test key, invited-only Google sign-in, identity linking |
| `hrAccessPrivateRecords.test.ts` | 160 | DB | HR manages everyone except private-record roles; attendance exclusions |
| `hrFinanceFoundation.test.ts` | 163 | DB | HR/Finance dashboards, HR-only leave approval, dual-role switching, sidebar |
| `hrReports.test.ts` | 105 | DB+unit | HR report figures, notifications review |
| `leaveVisibilityTaskNotices.test.ts` | 74 | DB | who sees leave on the calendar; deadline-moved notices |
| `organisationHelpers.test.ts` | 84 | unit | org tree, audit entry wording, action result helpers, auth/profile schemas |
| `payroll.test.ts` | 240 | DB | net pay, LOP, PF/ESI/PT/TDS rules, revisions, prepare/approve/pay permissions |
| `phase3Rules.test.ts` | 438 | DB | files (storage rules, shares, size from storage, forged paths), messages, notifications, deadline jobs, push address validation |
| `phase4Rules.test.ts` | 371 | DB | leave, attendance, meetings, support tickets |
| `phase5Rules.test.ts` | 373 | DB | quotations, invoices, GST/IGST, payments |
| `privateNumberPassword.test.ts` | 57 | DB | password re-check before revealing numbers, Google-only logins, 10-failure limit, PAN reveals |
| `profitLossBudgets.test.ts` | 146 | DB+unit | P&L statement maths, period comparisons, department budget warnings |
| `purchasesVendors.test.ts` | 142 | DB | vendors, purchase orders, vendor bills, one-time expense filing |
| `pushMessage.test.ts` | 46 | unit | push notification wording |
| `queryEngine.test.ts` | 148 | DB | engine: select/alias/order, embeds, column-named embeds, nested filters, `!inner`, `or/in/not/is/ilike`, paging + count, single, insert/update/upsert/delete, RPC typing, error codes |
| `quotationFinalStep.test.ts` | 83 | DB | draft → final → sent; invoices marked sent separately |
| `quotationNumberingWorkload.test.ts` | 69 | DB | quotation number prefix/next number, no repeats, immutability; founders off workload |
| `quotationTerms.test.ts` | 30 | unit | "Valid until" in default terms |
| `recruitmentExit.test.ts` | 231 | DB | candidates, interviews, feedback, conversion, onboarding, exits, F&F, nightly access end |
| `reimbursements.test.ts` | 131 | DB | claims, approval by manager/HR, payment by Finance, F&F inclusion |
| `serviceCatalogRules.test.ts` | 203 | DB | service/industry lists, price list, who may change prices |
| `supabasePlatformRules.test.ts` | 202 | DB (Supabase shell) | Supabase migration path: platform swap, idempotence, `app_auth` separation, rate limit, pg_cron jobs, bucket, RLS via engine, Realtime change/typing channels |
| `taskEngineRules.test.ts` | 765 | DB | clients, projects, task engine workflow and rules |
| `taskWorkingDays.test.ts` | 33 | unit | due dates in working days |
| `teamAccessRules.test.ts` | 213 | DB | department-head team scope, staff directory, Clients section |
| `workHelpers.test.ts` | 310 | unit | overdue logic, task actions/stages, project health, workload, search cleaning, safe URLs |

There are no tests for route handlers, `objectStore` path traversal edge cases beyond `phase3Rules`, `signingSecret`, `postgresDatabase` or the proxy matcher.

---

## 10. Observations

Each item was checked in code. "Possible" marks items whose impact depends on behaviour outside the files read.

### 10.1 CLAUDE.md build-rule violations
1. **Admin client used outside `src/server` / `scripts`.** `src/app/api/integrations/attendance/route.ts:4,40` imports and calls `createAdminDatabaseClient()` from a route handler in `src/app`. The rule says it may be used only in `src/server/` and `scripts/`. (Functionally guarded by the integration key; the fix is to move the call into a `src/server/services/attendanceImport.ts` function.)
2. **Raw PGlite API outside `sqlDatabase`.** `src/server/database/backgroundServices.ts:4,19,27,49,87` is typed against `PGlite` and uses `db.listen` (`:90`, `:97`), which is not part of `SqlDatabase`. This is local-only by design (Supabase uses pg_cron/pg_net/Realtime), but it is the one production module that does not "write raw SQL against `SqlDatabase`". `scripts/generateDatabaseTypes.ts:5,71` and `tests/supabasePlatformRules.test.ts:5,90` also use PGlite directly (scripts/tests, lower concern).
3. **Raw SQL against the app database from pages, outside `src/server`.** `src/app/(auth)/login/page.tsx:20` and `src/app/(auth)/setup/page.tsx:11` pass `getAppDatabase()` straight to `founderExists`. Not forbidden by a written rule, but it bypasses the query client/RLS layer from `src/app`.

### 10.2 Security and correctness risks
4. **Supabase live channels are public and unfiltered.** `live.broadcast_change()` sends with `private = false` (`database/platform/supabase_platform.sql:120-123`), and `broadcastTyping` likewise (`src/server/live/realtimeChannels.ts:31`). On local, `/api/live` re-checks every change with RLS (`src/app/api/live/route.ts:32-51`); on Supabase every holder of the topic receives the ids (`id`, every `*_id`, `assigned_to`, `created_by`) of every change in every live table, regardless of access. The topic is given to every signed-in employee (`liveConfigService.ts:35`) and never rotates, so a former employee who saved it keeps receiving metadata, and anyone with the publishable key and topic can also **send** forged `change`/`typing` broadcasts (forged typing names, forced refresh storms). Documented as intentional ("ids say nothing"), but it is a real asymmetry with the local rules.
5. **TLS certificate not verified on Supabase.** `postgresDatabase.ts:21` sets `rejectUnauthorized: false` and strips `sslmode`, so the database connection (which carries the pooler password) is open to an active man-in-the-middle. Supabase publishes a CA certificate that could be pinned.
6. **Signed upload link lifetime mismatch.** `fileStorage.ts:17` and `docs/SystemArchitecture.md` say upload links last 15 minutes; on Supabase the link is Supabase's signed upload URL, which `supabaseStorage.ts:43-44` itself says lasts **two hours**. `uploadLinkSeconds` is unused on that path.
7. **No retry for push or outgoing requests (local).** `backgroundServices.ts:60` deletes the queue row before sending; a failed `fetch` or dispatch (`:78-80`) is logged and lost.
8. **Missed cron minutes are not caught up (local).** `runDueJobs` (`backgroundServices.ts:27-45`) only runs jobs whose schedule matches the current minute. If the event loop is blocked past a minute boundary, or the process is down, that run is skipped. Job state is stamped before execution (`:38`), so a failing job is also not retried within the minute.
9. **Cron day-of-month/day-of-week semantics differ from pg_cron.** `scheduleMatches` ANDs the two fields (`src/server/jobs/cronSchedule.ts:27-33`); standard cron and pg_cron OR them when both are restricted. Any schedule like `0 9 1 * 1` would run on different days locally vs on Supabase. (Possible: depends on whether any migration uses such a schedule; the tested ones use `*` in one of them.)
10. **Schema cache never refreshes.** `getSchemaInfo` caches forever per db object (`databaseSchemaInfo.ts:39-48`). Locally this is fine (migrations only run at open). On Supabase, if `npm run db:supabase` is run while instances of the *same* deployment are warm, they will reject new columns/functions (`42703`/`PGRST202`) until they recycle. The documented order (migrate, then deploy) avoids this for new code.
11. **Unchecked `JSON.parse` before the error handler.** `queryEngine.ts:686` parses the request body outside the `try` that starts at `:689`, so a malformed body rejects the `fetch` promise instead of returning a PostgREST error. postgrest-js always sends valid JSON, so the practical exposure is the `/api/test-support` passthrough only.
12. **One-to-one reverse embeds: types vs runtime (possible).** The type generator emits `isOneToOne` from unique indexes (`scripts/generateDatabaseTypes.ts:103-108,178`), which makes postgrest-js type a reverse embed through a unique FK as a single object. The engine always returns an **array** for one-to-many direction (`queryEngine.ts:386-390`) and has no one-to-one case. Any code embedding the child side of a unique FK would get an array typed as an object.
13. **`chooseFunction` silently picks the first matching overload.** `queryEngine.ts:604-617` returns `candidates[0]`; PostgREST would report ambiguity. Ordering depends on catalogue order.
14. **`count=planned|estimated` are treated as `exact`** (`queryEngine.ts:437-439,477-480`). An extra full `count(*)` runs; harmless but costly on large tables.
15. **Object endpoint serves stored type `inline`.** `/api/storage/object/[token]/route.ts:22-24,27` uses the MIME type recorded at upload (chosen by the browser's `Content-Type`), inline unless `downloadAs`. The bucket allow-list (`database/migrations/20261109000001_files.sql:472-487`) excludes HTML/SVG/JS and `nosniff` is set globally (`next.config.ts:33`), so stored XSS is not currently possible; it depends on keeping that allow-list free of active types.
16. **`/api/live` treats every DELETE as visible** (`src/app/api/live/route.ts:33`). Only `{table, event}` is sent, so the leak is "something in table X you subscribed to was deleted".
17. **State-changing GET endpoints.** `/auth/end-session` (`src/app/auth/end-session/route.ts:6-9`) logs out on GET (cross-site logout via a link or image, low impact). `/auth/confirm` (`src/app/auth/confirm/route.ts:10-27`) redeems the one-time token on GET, so a link scanner or preview bot that fetches the URL can consume an invite (possible; depends on how links are shared).
18. **`/api/test-support` ships in production builds.** It is off unless `TEST_SUPPORT_SECRET` (≥32 chars) is set (`route.ts:15-22`) and returns 404 otherwise, and the proxy lists it as public (`routeGuard.ts:16`). Safe as long as the secret never reaches Vercel; when set it grants full `service_role` access.
19. **`postgresDatabase.ts:8-11` mutates the global `pg` type parser** at import time; any other `pg` user in the process (none today) would inherit it.

### 10.3 Inconsistencies and dead code
20. **Unreachable branch in `guardRoute`.** The proxy matcher only runs when the `crm_session` cookie is missing (`src/proxy.ts:31`), so `routeGuard.ts:42-44` (redirect signed-in users away from `/login`) never runs. The login page does its own redirect instead.
21. **Empty template "files".** `supabase/templates/inviteEmail.html` and `recoveryEmail.html` are empty directories, referenced nowhere.
22. **ESLint ignores a file that does not exist:** `src/types/supabaseDatabase.ts` (`eslint.config.mjs:8`); only `src/types/databaseTypes.ts` exists.
23. **Stale comment in `src/app/page.tsx:3`** says the site "opens at sign-in" but the code redirects to `/overview`. Likewise `src/app/api/notifications/dispatch/route.ts:6-9` describes the route as an alternative "if the database is moved to a hosted service", but it is the normal production path on Supabase.
24. **`appDatabase.ts:13` reuses the key `crm.localDatabase`** for the Supabase pool too (harmless naming leftover).
25. **Docs say the admin client is used for "accepted invitation and push"** (`docs/SystemArchitecture.md`, "The admin database client"), but it is also used for the attendance import (`api/integrations/attendance/route.ts:40`) and for cached company settings (`src/server/services/hrService.ts:46`).
26. **`setPasswordAction` relies on the admin update without `.select()`** (`src/server/actions/authActions.ts:144-151`). It bypasses RLS so a zero-row result is not a refusal, but the "always add `.select()` and check a row came back" rule is not followed, and a missing employee row goes unnoticed (only errors are logged).
27. **Node version.** `package.json:6` declares `>=20.9.0`, while `scripts/migrateSupabase.ts:12` and `scripts/createFounderAccount.ts:11` use `process.loadEnvFile`, added in Node 20.12. On 20.9–20.11 `migrateSupabase` would throw and `createFounderAccount` would silently skip `.env.local` (its `try` swallows the error).
28. **`/api/live` `typing` ids are not UUID-validated** (`src/app/api/live/route.ts:66`), unlike `/api/live/config` (`config/route.ts:9,27-30`). A bad id makes `can_view_conversation` raise, which is caught (`:70`) — harmless but inconsistent, and costs a transaction each.
29. **Pool size on Vercel is 3 per instance** (`postgresDatabase.ts:39`) and each `runAs` holds a client for the whole transaction. Pages that run many queries in parallel (`Promise.all`) will queue behind three connections per instance (possible performance concern, not a bug).


# Chapter 2 — Sign-in, access control, app shell, dashboards, settings/roles, audit, notifications, profile

Scope of this chapter: everything a person passes through before and around the business modules. That covers how they sign in and out, how the app decides what they can see, the frame every signed-in page is drawn in (sidebar, top bar, bell, status, role switch), the generated dashboard, role management, the audit log, notifications and push, the profile pages and the Approvals hub.

All paths are relative to the repository root (`E:\CRM 2.0`). Line numbers are those at the time of reading (2026-11-17, HEAD `4b459eb`). Nothing was modified, no git or server commands were run, and `.data/` was not touched.

Primary sources read: `CLAUDE.md`, `docs/SystemArchitecture.md`, `docs/PermissionMatrix.md`, every file listed in each section below, and the relevant parts of `database/migrations/20261106000001_organisation_foundation.sql`, `20261109000013_team_access.sql` and `20261111000004_hr_finance_foundation.sql`.

---

## 1. Big picture

```text
Browser
  │  cookie crm_session (random 32-byte token, http-only, SameSite=Lax, 30 days)
  ▼
src/proxy.ts ──► src/lib/auth/routeGuard.ts      Runs ONLY when there is no crm_session cookie
  │                                              (matcher excludes cookie-bearing requests).
  │                                              No cookie + private path → /login?next=…
  ▼
(auth) pages: /login /forgot-password /setup /set-password /account-inactive
(crm) layout: src/app/(crm)/layout.tsx → requireAccess()
  │     getSessionUser()  → app_auth.sessions ⨝ app_auth.users   (hash of cookie token)
  │     get_my_permissions() RPC + own employees row (as the user, RLS on)
  │     status: signed-out → /auth/end-session (clears cookie) → /login
  │             blocked / no active employee → /account-inactive
  ▼
Page: requirePagePermission(key) → notFound() if key missing (looks like a 404)
Action: getActionAccess(key) → null → "You do not have permission to do this."
  ▼
queryEngine (in-process PostgREST) as role `authenticated` + user id → RLS + guard triggers decide
```

Three layers (from `docs/SystemArchitecture.md:44-52`):

| Layer | Code | Job |
| --- | --- | --- |
| Interface | `src/lib/access/navigationRegistry.ts`, `src/lib/access/dashboardWidgetRegistry.ts` | Show only what the permission map allows |
| Server | `src/server/services/accessService.ts`, each server action | Refuse early with a clear message |
| Database | RLS policies, `guard_*` triggers, `has_permission`, `permission_scope_for`, `current_role_id` | The real enforcement |

Sign-in tables live in schema `app_auth` (not `auth`, which Supabase reserves): `users`, `sessions`, `one_time_tokens`, `outgoing_emails`, `sign_in_attempts`, `user_identities`. No user query can reach them; only trusted server code in `src/server/auth/*` uses raw SQL against `SqlDatabase`.

---

## 2. Sign-in flows, step by step

### 2.1 Building blocks (`src/server/auth/*`, `src/lib/auth/*`)

| File | Lines | What it does |
| --- | --- | --- |
| `src/server/auth/passwordHashing.ts` | 1-30 | scrypt (N=16384, r=8, p=1, 64-byte key, 16-byte salt, NFKC-normalised input). Stored as `scrypt$N$r$p$salt$hash`. `verifyPassword` uses `timingSafeEqual` (`:29`). |
| `src/server/auth/authAccounts.ts` | 7-8 | Session lifetime 30 days; link lifetime invite 7 days (168 h), recovery 1 h. |
| | 12-18 | Tokens are `randomBytes(32)` base64url; only the SHA-256 hash is stored. |
| | 26-32 | `findAuthUserByEmail` (lower-cased), also returns `banned`. |
| | 34-53 | `createAuthUser`: inserts `app_auth.users`; `email_confirmed_at` is set only if a password is given; unique violation `23505` → `EmailTakenError`. |
| | 59-65 | `setAuthUserPassword`: re-hashes, sets `email_confirmed_at` if empty. |
| | 70-75 | `setAuthUserBlocked`: `banned_until = 'infinity'` or null. |
| | 79-90 | `checkPassword`: always runs scrypt (dummy hash when the email is unknown) to keep timing flat; returns `invalid`, `blocked` (only after a correct password) or `ok`. |
| | 94-103 | `confirmOwnPassword`: re-check for sensitive reveals; `no-password` for Google-only logins. |
| | 105-118 | `createSession`: inserts session, stamps `last_sign_in_at`, deletes expired sessions, in one transaction. |
| | 120-128 | `findSessionUser`: joins session to user, returns `{userId, email, blocked}`. |
| | 130-132 | `endSession`: deletes the session row. |
| | 136-150 | `createOneTimeLink`: marks all earlier unused links of the same kind used, then inserts the new one. |
| | 153-168 | `redeemOneTimeLink`: one atomic `update … returning` (single use), then refuses blocked users. |
| | 170-181 | `queueEmail`: writes `app_auth.outgoing_emails`; in non-production also `console.log`s the link. |
| | 185-194 | `latestEmailedLink`: newest unexpired link (used only by `/api/test-support`). |
| `src/server/auth/currentSession.ts` | 10-19 | `getSessionUser` (React `cache`, once per request). |
| | 21-30 | `startSession`: sets cookie `crm_session`, `httpOnly`, `sameSite:'lax'`, `secure` in production unless `ALLOW_INSECURE_COOKIES`. |
| | 32-36 | `finishSession`: deletes the DB row and the cookie. |
| `src/server/auth/signInRateLimit.ts` | 6-21 | `isRateLimited`: records an attempt and counts the earlier ones in one statement. Over 10 in 15 min means refused. Clears rows older than a day. |
| | 25-36 | `hasTooManyFailures` / `recordFailure`: count only wrong attempts (used for own-password re-checks elsewhere). |
| `src/server/auth/firebaseTokens.ts` | 7-47 | Downloads Google's x509 certs, caches them for the `max-age` time, and fetches again once for an unknown `kid`. |
| | 59-108 | `verifyFirebaseIdToken`: RS256 only; signature; `aud`=project; `iss`=`securetoken.google.com/<project>`; `exp`/`iat`/`auth_time` with 60 s skew; sign-in no older than 10 min; `sign_in_provider==='google.com'`; `email_verified===true`; Google subject id from `firebase.identities['google.com'][0]`. |
| `src/server/auth/googleAccounts.ts` | 14-38 | Writes `audit_logs` rows (`entity_type='google_account'`) with raw SQL. |
| | 40-93 | `signInWithGoogleIdentity` (one transaction, `for update` on the user): not-invited / blocked / other-google-account are refused and audited; the first use links `app_auth.user_identities`; later uses stamp `last_used_at`; marks the invitation accepted; audits "signed in with". |
| `src/server/auth/founderSetup.ts` | 6-13 | `founderExists`: any employee whose role is named `'Founder'`. |
| | 15-38 | `createFounder`: auth user plus an employee with role, designation `'Founder'` and department `'Management'`. Deletes the auth user if the employee insert fails. |
| `src/server/auth/accountEmails.ts` | 9 | `emailIsConnected = false` (hard-coded). |
| | 15-26 | `sendInvitation` → link `/auth/confirm?type=invite&token=…`, queued. |
| | 28-39 | `sendPasswordReset` → `/auth/confirm?type=recovery&token=…`, queued. |
| `src/lib/auth/routeGuard.ts` | 6-17 | Public paths: `/login`, `/forgot-password`, `/setup`, `/auth/confirm`, `/auth/end-session`, `/api/notifications/dispatch`, `/api/integrations/attendance`, `/api/storage/upload`, `/api/storage/object`, `/api/test-support`. |
| | 33-47 | No cookie on a private path → `/login?next=<path+search>`. Cookie on `/login` or `/forgot-password` → `/overview` (see Observation O-14). |
| `src/lib/auth/sessionCookieName.ts` | 3 | `crm_session`. |
| `src/lib/auth/firebaseConfig.ts` | 11-20 | Returns config only if all four `NEXT_PUBLIC_FIREBASE_*` values are set; otherwise the Google button is hidden. |
| `src/proxy.ts` | 22-35 | Matcher skips static files, `.well-known/`, `__/` (Firebase auth handler), `api/live`, server-action and prefetch requests, and every request carrying `crm_session`. |

### 2.2 Password sign-in

1. `/login` → `src/app/(auth)/login/page.tsx:15-26`. A valid unblocked session redirects to `/overview` (`:17-18`). If no Founder exists, it redirects to `/setup` (`:20`). `?error=link-expired` becomes a notice (`:23`).
2. `LoginForm` (`src/components/auth/LoginForm.tsx:18-59`) posts `email`, `password` and hidden `next` to `signInAction`.
3. `signInAction` (`src/server/actions/authActions.ts:22-40`):
   - zod `loginSchema` (`src/lib/validation/authSchema.ts:5-8`);
   - `isRateLimited(db, email)` records the attempt; more than 10 in 15 min gives "Too many attempts" (`:30-32`);
   - `checkPassword` → "The email or password is incorrect." or "Your account is not active…" (`:34-36`);
   - `startSession(userId)` (`:38`);
   - `redirect(safeNextPath(next))`: only same-site `/…` paths, not `//` or `/\` (`:18-20`).
4. Every following request: the `(crm)` layout calls `requireAccess()` (section 3.4).
5. Not audited (see O-5).

### 2.3 Google sign-in (Firebase)

1. The login page passes `getFirebaseConfig()` to `LoginForm`; `GoogleSignInButton` renders only when it is non-null (`LoginForm.tsx:28-33`).
2. `GoogleSignInButton` (`src/components/auth/GoogleSignInButton.tsx`):
   - lazy-loads `firebase/app` and `firebase/auth` after mount (`:57-95`, `:117-143`), with in-memory persistence and app name `crm-sign-in`;
   - in a normal browser it uses `signInWithPopup`; in an installed PWA or TWA (`runningAsApp`, `:33-41`) it uses `signInWithRedirect` and a `sessionStorage` marker `crm-google-sign-in` (`:28`, `:77-84`), and the result is read on return (`:89-93`, `:123-127`);
   - gets the ID token, then signs Firebase out at once (`tokenFor`, `:67-71`);
   - calls `signInWithGoogleAction(idToken, next)` (`:104-110`).
3. `signInWithGoogleAction` (`authActions.ts:44-76`):
   - refuses if Firebase is not configured (`:45-46`);
   - `verifyFirebaseIdToken`; a network failure gives a soft error (`:48-54`); an invalid token is logged with its reason (`:55-58`);
   - rate limit on key `google:<email>` (`:61-63`);
   - `signInWithGoogleIdentity` (`googleAccounts.ts:40-93`): the email must already exist in `app_auth.users` (an invitation); one Google subject per login;
   - `startSession` and redirect to `next` (`:74-75`).
4. Audit: `google_account` rows for `linked`, `signed in with` and `refused` (with the reason).

### 2.4 Invitation (new employee)

1. An administrator creates an employee (`src/server/services/employeeCreation.ts:60` calls `sendInvitation`), or later presses "create link" on the employee page → `createSignInLinkAction` (`src/server/actions/employeeActions.ts:232-250`). This needs `employees.create` and `controls.canCreateSignInLink` (`src/server/services/employeeService.ts:324-328`: within reach of `employees.create`, the person is active, the role is assignable, the record is visible, and it is not yourself).
2. A one-time `invite` token is created (older unused ones are voided), the email is queued, and the link is **returned to the administrator** to pass on, because email is not connected.
3. The invitee opens `/auth/confirm?type=invite&token=…` → `src/app/auth/confirm/route.ts:10-28`: `redeemOneTimeLink` (single use, unexpired, not blocked) → `startSession` → redirect to `/set-password`. Failure → `/login?error=link-expired`.
4. `/set-password` (`src/app/(auth)/set-password/page.tsx`) → `SetPasswordForm` → `setPasswordAction` (`authActions.ts:132-154`): schema (10+ characters, a letter and a digit, matching), session required, `setAuthUserPassword`, then the **admin client** sets `employees.invite_accepted_at` where null (`:144-151`, an error is only logged), then `/overview`.
5. Alternative: the invitee uses Google directly. `signInWithGoogleIdentity` marks `email_confirmed_at` and `invite_accepted_at` (`googleAccounts.ts:82-89`).

### 2.5 Password reset

- **Self-service:** `/forgot-password` → `ForgotPasswordForm` → `requestPasswordResetAction` (`authActions.ts:83-102`). If not rate-limited (key `reset:<email>`) and the user exists and is not banned, `sendPasswordReset` queues a 1-hour recovery link. It always gives the same reply. With `emailIsConnected=false` that reply is "Email is not connected yet… ask your administrator" (`:97-101`). Nobody receives the link (see O-3).
- **Administrator:** `createSignInLinkAction` returns a recovery link for someone who has already joined (`employeeActions.ts:249`).
- **Redeem:** the same `/auth/confirm` route with `type=recovery` → session → `/set-password`.

### 2.6 Founder setup (fresh install)

1. `/login` redirects to `/setup` while `founderExists()` is false (`login/page.tsx:20`).
2. `/setup` (`src/app/(auth)/setup/page.tsx:10-13`) redirects to `/login` once a Founder exists.
3. `FirstAccountForm` → `createFirstAccountAction` (`authActions.ts:105-130`): schema `firstAccountSchema` (`authSchema.ts:28-38`), re-checks `founderExists`, `createFounder`, `startSession`, `/overview`.
4. A CLI path also exists (`founder:create`, per the comment at `founderSetup.ts:1-2`).

### 2.7 Session end

| Trigger | Path |
| --- | --- |
| User clicks Sign out (top bar menu `src/components/layout/AppTopbar.tsx:70-75`, or the `/account-inactive` page) | `signOutAction` (`authActions.ts:78-81`) → `finishSession` deletes the session row and cookie → `/login` |
| Session expired or deleted, cookie still present | `requireAccess` sees `signed-out` → `/auth/end-session` (`accessService.ts:51`) → `src/app/auth/end-session/route.ts:6-9` clears it → `/login` |
| Account blocked (`setEmployeeAccountActiveAction` → `setAuthUserBlocked`, `employeeActions.ts:211-222`) or employee inactive | `findSessionUser` returns `blocked`, or the employee query returns nothing → `/account-inactive` (`accessService.ts:53`) |
| Natural expiry | 30 days, fixed and not sliding (`authAccounts.ts:7`, `:107`). Expired rows are purged on each new sign-in (`:115`). |

### 2.8 Auth route table

| URL | File | Guard | Shows / does |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | none | `redirect('/overview')` (the comment says "opens at sign-in") |
| `/login` | `src/app/(auth)/login/page.tsx` | public | Password and Google sign-in; redirects to `/setup` on a fresh install |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | public | Reset request form |
| `/setup` | `src/app/(auth)/setup/page.tsx` | public, closes once a Founder exists | First (Founder) account |
| `/set-password` | `src/app/(auth)/set-password/page.tsx` | cookie (not public); the action needs a session | Choose a password after a link |
| `/account-inactive` | `src/app/(auth)/account-inactive/page.tsx` | cookie | "Your account is not active" and Sign out |
| `/auth/confirm` | `src/app/auth/confirm/route.ts` | public GET | Redeems the token, starts a session |
| `/auth/end-session` | `src/app/auth/end-session/route.ts` | public GET | Clears the session and cookie |
| Layout | `src/app/(auth)/layout.tsx` | — | Card with `BrandLogo` and the "BMU Workspace" name |

---

## 3. Access control

### 3.1 Scope model

- `permissionScopes = ['own','team','department','organisation']` (`src/lib/access/permissionKeys.ts:72`). Order matters: each one includes the narrower ones (`navigationRegistry.ts:191-194` compares indexes).
- `PermissionMap = Partial<Record<string, PermissionScope>>` (`permissionKeys.ts:76`). A key is present only if the current role grants it.
- Each permission row in `public.permissions` has `allowed_scopes`. The trigger `guard_role_permission` (`20261106000001_organisation_foundation.sql:492-510`) rejects a scope that is not allowed.
- DB helpers: `current_employee_id()`, `permission_scope_for(key)`, `has_permission(key)`, `get_my_permissions()`, and since `20261111000004_hr_finance_foundation.sql:160-195`, `current_role_id()`. That is the employee's `acting_role_id` when it is one of their `employee_extra_roles`, otherwise their main `role_id`. All permission checks follow the role the person is **working as**.
- Meaning by scope (from `docs/PermissionMatrix.md`): Org means everyone; Dept means own department; Team means you plus everyone below you in the reporting line, at any depth (`get_my_team_ids`); Own means self (and for `employees.view`, also your manager and the colleagues who share them).
- App code mostly checks only that a key is present (`permissions[key] !== undefined`). Scope is checked in code in a few places: `minimumScope` in the navigation, `statsDepartmentFilter` (`dashboardService.ts:7-11`), the ticket-categories page (`settings/ticket-categories/page.tsx:15-16`), and `canTransfer` and `canEdit` in `employeeService.ts:315-320`. Everything else is left to RLS.

### 3.2 All permission keys (66; they match the DB seed exactly)

`src/lib/access/permissionKeys.ts:2-68`. Meanings come from `docs/PermissionMatrix.md` and the seed descriptions. "App uses" counts `permissionKeys.<name>` references in `src`.

| Key | Code name | Meaning | Typical scopes |
| --- | --- | --- | --- |
| `dashboard.view` | dashboardView | Open Overview; shows the My profile widget | own |
| `employees.view` | employeesView | Employees directory and profiles (reach decided in the DB by `can_view_employee_profile`) | own/team/org |
| `employees.create` | employeesCreate | Add people; create invitation or reset links | team/org |
| `employees.update` | employeesUpdate | Edit employee records (Team cannot move someone outside the team) | team/org |
| `employees.assign_role` | employeesAssignRole | Change someone's role; give additional roles | org |
| `employees.deactivate` | employeesDeactivate | Activate or deactivate accounts (blocks the login) | org |
| `team.view` | teamView | My team widget | team |
| `organisation.view` | organisationView | Hierarchy chart | org |
| `organisation.stats` | organisationStats | Organisation stats and headcount widgets (dept or org) | dept/org |
| `departments.manage` | departmentsManage | CRUD departments | org |
| `designations.manage` | designationsManage | CRUD designations | org |
| `roles.manage` | rolesManage | Settings > Roles | org |
| `audit.view` | auditView | Audit log and the Recent activity widget | org |
| `clients.view` | clientsView | Clients section, Client 360, client follow-ups widget | own/org |
| `clients.create` | clientsCreate | New clients | org |
| `clients.update` | clientsUpdate | Edit clients | own/org |
| `projects.view` | projectsView | Projects; client and project stats widget | own/dept/org |
| `projects.create` | projectsCreate | New projects | dept/org |
| `projects.update` | projectsUpdate | Edit projects | own/dept/org |
| `tasks.view` | tasksView | Tasks, My tasks, Task stats, My workload | own/dept/org |
| `tasks.create` | tasksCreate | Create tasks (for self) | own |
| `tasks.assign` | tasksAssign | Assign to others (DB only; app uses 0) | team/dept/org |
| `tasks.assign_heads` | tasksAssignHeads | Assign to department heads (DB only) | org |
| `tasks.assign_project_team` | tasksAssignProjectTeam | Assign within the same project (DB only) | own |
| `tasks.manage` | tasksManage | Manage and review others' tasks | team/dept/org |
| `workload.view` | workloadView | Workload page and Team workload widget | dept/org |
| `files.view` | filesView | Files beyond your own | own/dept/org |
| `files.upload` | filesUpload | Files menu item; add own documents on Profile | own |
| `messages.use` | messagesUse | Messages | own |
| `messages.announce` | messagesAnnounce | Post announcements | org |
| `leave.request` | leaveRequest | Leave page, Leave balance widget | own |
| `leave.approve` | leaveApprove | Approvals (leave), Leave to approve widget; `/hr/leave` needs org | org |
| `attendance.view` | attendanceView | Attendance; Attendance today widget | own/team/dept/org |
| `attendance.manage` | attendanceManage | Correct attendance | dept/org |
| `hr.manage` | hrManage | HR settings, holidays, leave report | org |
| `meetings.create` | meetingsCreate | Calendar; Upcoming meetings widget | own |
| `meetings.view` | meetingsView | See all meetings (DB only; app uses 0) | own/org |
| `tickets.create` | ticketsCreate | Support | own |
| `tickets.manage` | ticketsManage | Ticket queue; categories at org | dept/org |
| `quotations.view` / `quotations.manage` | quotationsView / quotationsManage | Quotations; awaiting widget; signature widget | own/org |
| `invoices.view` / `invoices.manage` | invoicesView / invoicesManage | Invoices; overdue widget; signature widget | own/org |
| `payments.record` | paymentsRecord | Record or remove payments | org |
| `finance.reports` | financeReports | Finance reports; Finance stats widget | org |
| `finance.manage` | financeManage | Finance settings | org |
| `catalog.manage` | catalogManage | Services and industries | org |
| `hr.dashboard` | hrDashboard | `/hr`, HR reports; switches on the HR sidebar section | org |
| `finance.dashboard` | financeDashboard | `/finance` | org |
| `employees.private_view` | employeesPrivateView | ID and bank details, employee documents | org |
| `payroll.manage` | payrollManage | Salary structures, rules, runs, appraisals | org |
| `payroll.approve` | payrollApprove | Approve runs; mark paid; settlements | org |
| `payslips.view` | payslipsView | Own payslips | own |
| `recruitment.manage` | recruitmentManage | Openings, candidates, interviews, letters | org |
| `exits.manage` | exitsManage | Decide resignations, exit checklist | org |
| `resignation.submit` | resignationSubmit | Resign | own |
| `ledger.manage` | ledgerManage | Income and expenses, Transactions, Profit & loss, categories | org |
| `banks.manage` | banksManage | Bank accounts, statements, reconciliation | org |
| `followups.manage` | followupsManage | Payment follow-ups board | org |
| `purchases.manage` | purchasesManage | Vendors, POs, vendor bills | org |
| `reimbursements.submit` / `.approve` / `.pay` | reimbursements* | Claim / decide / pay | own / org / org |
| `budgets.manage` | budgetsManage | Department budgets | org |
| `content_calendar.manage` | contentCalendarManage | Plan the content calendar (seed module "Meetings") | org |

The seed also has `app.*` pseudo-keys (for example `app.trusted_ledger`, `app.finance_internal`) used as internal flags by triggers. They are not in `permissionKeys` and are not shown in role editing unless they are seeded into `public.permissions` (not checked in detail).

### 3.3 Navigation items (`src/lib/access/navigationRegistry.ts:75-182`)

Rules (`buildNavigation`, `:197-213`): an item shows if (the permission exists **and** its scope is at least `minimumScope` **and** `alsoRequires` exists), **or** any key in `anyOf` exists. Each `href` appears only once, in the first section that offers it, so the HR section "claims" Employees and Attendance for HR people. Empty sections are dropped.

| Section | Label | href | Permission | Extra |
| --- | --- | --- | --- | --- |
| Workspace | Overview | `/overview` | dashboard.view | |
| | Messages | `/messages` | messages.use | |
| | Calendar | `/calendar` | meetings.create | |
| | Support | `/tickets` | tickets.create | |
| | Tasks | `/tasks` | tasks.view | |
| | Files | `/files` | files.upload | |
| | Projects | `/projects` | projects.view | |
| | Workload | `/workload` | workload.view | |
| HR | HR dashboard | `/hr` | hr.dashboard | |
| | Employees | `/people/employees` | employees.view | alsoRequires hr.dashboard |
| | Attendance | `/attendance` | attendance.view | alsoRequires hr.dashboard |
| | Leave requests | `/hr/leave` | leave.approve | minimumScope organisation; alsoRequires hr.dashboard |
| | Holidays | `/hr/holidays` | hr.manage | alsoRequires hr.dashboard |
| | Payroll | `/hr/payroll` | payroll.manage | |
| | Recruitment | `/hr/recruitment` | recruitment.manage | |
| | Exits | `/hr/exits` | exits.manage | |
| | HR reports | `/hr/reports` | hr.dashboard | |
| | HR settings | `/settings/hr` | hr.manage | alsoRequires hr.dashboard |
| CRM | Clients | `/clients` | clients.view | |
| Finance | Finance dashboard | `/finance` | finance.dashboard | |
| | Quotations | `/quotations` | quotations.view | |
| | Invoices | `/invoices` | invoices.view | |
| | Income & expenses | `/finance/ledger` | ledger.manage | |
| | Transactions | `/finance/transactions` | ledger.manage | |
| | Bank accounts | `/finance/banks` | banks.manage | |
| | Payment follow-ups | `/finance/follow-ups` | followups.manage | |
| | Purchases | `/finance/purchases` | purchases.manage | |
| | Salaries & reimbursements | `/finance/salaries` | reimbursements.pay | |
| | Profit & loss | `/finance/profit-loss` | ledger.manage | |
| | Department budgets | `/finance/budgets` | budgets.manage | |
| | Payroll approvals | `/hr/payroll` | payroll.approve | duplicate href of HR > Payroll |
| | Settlements | `/hr/exits` | payroll.approve | duplicate href of HR > Exits |
| | Finance reports | `/finance/reports` | finance.reports | |
| | Finance settings | `/settings/finance` | finance.manage | alsoRequires finance.dashboard |
| Team | Leave | `/leave` | leave.request | |
| | Attendance | `/attendance` | attendance.view | |
| | My payslips | `/payslips` | payslips.view | |
| | Reimbursements | `/reimbursements` | reimbursements.submit | |
| | Resignation | `/resignation` | resignation.submit | |
| | Approvals | `/approvals` | leave.approve | **or** anyOf reimbursements.approve, payroll.approve, exits.manage |
| | Leave requests | `/hr/leave` | leave.approve | minimumScope organisation |
| People | Employees | `/people/employees` | employees.view | |
| | Hierarchy | `/people/hierarchy` | organisation.view | |
| | Departments | `/people/departments` | departments.manage | |
| | Designations | `/people/designations` | designations.manage | |
| Settings | Roles | `/settings/roles` | roles.manage | |
| | HR settings | `/settings/hr` | hr.manage | |
| | Finance settings | `/settings/finance` | finance.manage | |
| | Content calendar | `/settings/calendar` | content_calendar.manage | |
| | Services & industries | `/settings/services` | catalog.manage | |
| | Ticket categories | `/settings/ticket-categories` | tickets.manage | minimumScope organisation |
| | Audit log | `/settings/audit-log` | audit.view | |

`isMainPage(pathname)` (`:186-189`): `/`, `/profile`, `/notifications` and every href above count as "main". Any other path shows the top-bar **Back** button (`src/components/layout/BackButton.tsx`). This replaces breadcrumbs, as the owner asked. No breadcrumb component exists anywhere in `src` (grep for "breadcrumb" finds only the two comments that say so).

### 3.4 `src/server/services/accessService.ts`

| Lines | Function | Behaviour |
| --- | --- | --- |
| 8-39 | `loadCurrentAccess` | No session → `signed-out`; blocked → `no-employee`; otherwise, in parallel, own **active** employee row (`id, employee_code, full_name, work_email, department_id, avatar_url, role:roles(name), designation, department`) and `get_my_permissions()`. No row → `no-employee`. |
| 42 | `getCurrentAccess` | React `cache`, so it runs once per request. |
| 46-55 | `requireAccess` | `signed-out` → `/auth/end-session`; not ready → `/account-inactive`. |
| 58-63 | `requirePagePermission(key)` | Key missing → `notFound()` (hidden, looks like a 404). |
| 65-71 | `getActionAccess(key?)` | Returns `null` instead of redirecting, for server actions. |

Note: `employee.role` is the **main** role (FK `employees.role_id`). The permission map follows the **acting** role (`current_role_id()`). See O-11.

### 3.5 Dashboard widgets (`src/lib/access/dashboardWidgetRegistry.ts:35-60`)

`buildDashboard` keeps a widget if **any** of its permissions is present, at any scope (`:62-66`). `DashboardGrid` (`src/components/dashboard/DashboardGrid.tsx:64-85`) places `full` widgets on top, then a `main` column and a `side` column. Each widget is wrapped in `<Suspense fallback={<LoadingPanel height={160}/>}>`.

| Order | Key | Permission | Size | Component (file:line) | Data source |
| --- | --- | --- | --- | --- | --- |
| 1 | financeStats | finance.reports | full | `FinanceWidgets.tsx:15-28` | `getFinanceReport(this-month)`: invoiced, collected, owed, overdue |
| 2 | organisationStats | organisation.stats | full | `OrganisationStatsWidget.tsx` | `dashboardService.getOrganisationStats` |
| 3 | clientProjectStats | projects.view | full | `ClientProjectStatsWidget.tsx` | client stats (if clients.view), project stats |
| 4 | taskStats | tasks.view | full | `TaskStatsWidget.tsx` | `getTaskStats`: open, overdue, to review, completion |
| 5 | attendanceToday | attendance.view | side | `HrWidgets.tsx:9-13` | hidden if the role does not track attendance |
| 6 | myWorkload | tasks.view | side | `MyWorkloadWidget.tsx` | `getMyWorkload`; null when not tracked |
| 7 | leaveApprovals | leave.approve | main | `HrWidgets.tsx:32-61` | `listLeaveAwaitingDecision`; Review → `/approvals` |
| 8 | myTasks | tasks.view | main | `MyTasksWidget.tsx` | `listMyOpenTasks(6)` |
| 9 | upcomingMeetings | meetings.create | main | `MeetingWidgets.tsx` | `listUpcomingMeetings(5)` |
| 10 | ticketsToHandle | tickets.manage | main | `TicketWidgets.tsx` | `listTicketsToHandle(5)` |
| 11 | overdueInvoices | invoices.view | main | `FinanceWidgets.tsx:30-56` | `listOverdueInvoices(5)` |
| 12 | awaitingQuotations | quotations.view | side | `FinanceWidgets.tsx:58-84` | `listAwaitingQuotations(5)` |
| 13 | documentSignature | quotations.manage **or** invoices.manage | side | `DocumentSignatureWidget.tsx` | `getSavedSignature`; links to `/profile#signature` |
| 14 | leaveBalance | leave.request | side | `HrWidgets.tsx:15-30` | `getLeaveBalances()` |
| 15 | teamWorkload | workload.view | main | `TeamWorkloadWidget.tsx` | `getWorkloads()` top 5 |
| 16 | departmentHeadcount | organisation.stats | main | `DepartmentHeadcountWidget.tsx` | `getDepartmentHeadcount` |
| 17 | myProfile | dashboard.view | side | `MyProfileWidget.tsx` | from `access.employee` (no query) |
| 18 | followUps | clients.view | side | `FollowUpsWidget.tsx` | `listDueFollowUps(6)` (client `next_follow_up_date`) |
| 19 | myTeam | team.view | side | `MyTeamWidget.tsx` | `dashboardService.listMyTeam` (`get_my_team_ids`) |
| 20 | recentActivity | audit.view | main | `RecentActivityWidget.tsx` | `auditService.listRecentActivity(6)` |

`src/server/services/dashboardService.ts`:
- `:7-11` `statsDepartmentFilter`: org scope → no filter, otherwise the user's `department_id`.
- `:13-26` `loadScopedEmployees` loads **all** matching employees (no pagination) and counts in JS.
- `:28-49` `getOrganisationStats`: total, active, pending invitations (active and `invite_accepted_at` null), active departments.
- `:51-64` `getDepartmentHeadcount`: active employees grouped by department name.
- `:66-81` `listMyTeam`.

Overview page: `src/app/(crm)/overview/page.tsx:9-19`. `requirePagePermission('dashboard.view')`, header "Welcome back, <first name>" with the main role name, then `DashboardGrid`.

### 3.6 Roles management

Pages:

| URL | File | Permission | What it shows / does |
| --- | --- | --- | --- |
| `/settings/roles` | `src/app/(crm)/settings/roles/page.tsx:16-83` | roles.manage | Table: name and description, count of permissions, count of employees (main role only, `employees(count)`). Protected roles show a "Protected" badge; others get Edit and Remove (`OrganisationRowActions`). "New role" button. |
| `/settings/roles/new` | `.../roles/new/page.tsx:11-24` | roles.manage | `RoleForm` with all permissions |
| `/settings/roles/[roleId]` | `.../roles/[roleId]/page.tsx:17-33` | roles.manage | `parseId`; protected role → `notFound()`; `RoleForm` prefilled |

`src/components/roles/RoleForm.tsx`:
- Name and Description (`:52-55`).
- "People in this role" switches: `privateRecords` (`:59-68`), `tracksAttendance` (default on, `:69-77`) and `tracksWorkload` (default on, `:78-87`).
- One fieldset per permission `module`. Each permission has a `SearchableSelect` named `permission:<key>`, placeholder "No access", with options from `allowed_scopes` (`:90-114`).

Server (`src/server/actions/organisationActions.ts`):
- `saveRoleAction` (`:129-169`): needs roles.manage; `roleSchema` (name 2-100 characters, optional description, `organisationSchema.ts:31-34`). An update uses `.select('id')`, and zero rows → no permission (`:152-154`). An insert returns the id (`:156-158`). Then RPC `set_role_permissions(p_role, [{key, scope}])` (`:161-165`), filtered against the catalogue from `listPermissions()` (`:120-127`). Then revalidate and redirect.
- `deleteRoleAction` (`:171-186`): `delete({count:'exact'})`; `isStillInUse` → "Employees still have this role"; count 0 → "This role cannot be removed."

Database rules (`20261106000001_organisation_foundation.sql`):
- `roles` RLS (`:673-681`): select for any employee; insert, update and delete need `roles.manage` and `not is_protected`.
- `role_permissions` RLS (`:686-705`): insert and update need roles.manage, a role that is not protected, and **`permission_scope_for(key) >= scope`**. You cannot grant beyond your own reach. Select is for roles.manage or the person's own main role.
- `set_role_permissions` (`:283-303`) is `security invoker`, so RLS applies. It deletes keys that are missing and upserts the changed ones.
- `role_is_assignable(role)` (`:203-216`): every permission of the role is within the caller's own scope. `get_assignable_role_ids` (`:272-279`) uses it, and the employee guards (`:440-490`) use it for role changes, deactivation and inserts.
- `ensure_role_administrator_exists` (`:512-543`): a deferred constraint trigger on employees, roles and role_permissions keeps at least one active employee whose main role has `roles.manage`.
- Default role: `roles.is_default` (one only, `20261109000013_team_access.sql:18-20`), given to people added by someone without `employees.assign_role`.
- All changes to `roles` and `role_permissions` are audited by trigger (`:622-625`).

Services (`src/server/services/organisationService.ts`): `listDepartments` (`:4-18`), `getDepartment`, `listDesignations`, `getDesignation`, `listRoles` (`:59-69`), `listAssignableRoles` (`:71-85`), `getRoleWithPermissions` (`:87-98`), `listPermissions` (`:100-110`, ordered by `sort_order`).

Department and designation actions (same file, `:30-114`) back the `/people/departments` and `/people/designations` pages, which are covered in another chapter.

### 3.7 Working as a second role

- `listMyRoles` (`src/server/services/employeeService.ts:163-168`) → RPC `get_my_roles`.
- `RoleSwitcher` (`src/components/layout/RoleSwitcher.tsx:13-54`) is hidden with fewer than 2 roles. It calls `switchMyRoleAction` (`src/server/actions/employeeActions.ts:175-186` → RPC `switch_my_role`), then `router.push('/overview')`.
- The switch is recorded in `audit_logs` through the employees trigger (`acting_role_id` has its label "role in use" in `describeAuditEntry.ts:77`).
- The layout shows the acting role in the user menu (`src/app/(crm)/layout.tsx:20`, `:33`).

---

## 4. App shell

### 4.1 `src/app/(crm)/layout.tsx` (41 lines)

1. `requireAccess()` and `cookies()` in parallel (`:12`).
2. `getSessionUser()` (cached) (`:13`).
3. In parallel: `getNotificationSummary()`, `listMyRoles()`, `getLiveConfig(userId, fullName)` (`:15-19`).
4. Renders `AppShell` with permissions, `initiallyCollapsed` from the `sidebar` cookie, live config, notifications, and the user (name, email, acting role name, roles).
5. `PushPrompt` is rendered inside `<main>` above the page when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set (`:37`).

Siblings: `src/app/(crm)/loading.tsx` (`LoadingPanel`) and `src/app/(crm)/error.tsx` (`EmptyState` with "Try again"). There is **no** `src/app/(crm)/settings/page.tsx`, so `/settings` itself returns 404 (see O-19).

### 4.2 Layout components (`src/components/layout/`)

| Component | Lines | Notes |
| --- | --- | --- |
| `AppShell.tsx` | 52 | Client. Seeds the live config (`:25`). Manages collapsed (cookie `sidebar`, 1 year) and mobile-open state. Mounts `PresenceHeartbeat` and `ListInteractions` once for the whole app. Sidebar, top bar, then `<main>`. |
| `AppSidebar.tsx` | 93 | `buildNavigation(permissions)` runs on the client. The current item is the longest matching href (`:32-35`), so `/finance/reports` does not also light up `/finance`. Mobile backdrop and close; collapse toggle; brand link to `/overview`. |
| `AppTopbar.tsx` | 80 | Mobile menu button; `BackButton`; `NotificationBell`; `ThemeToggle`; avatar button opening a `popover="auto"` user menu with name, email, role, `StatusMenu`, `RoleSwitcher`, "My profile", "Sign out" (form → `signOutAction`). |
| `BackButton.tsx` | 28 | Hidden on main pages; `router.back()` if `history.length > 1`, otherwise `/overview`. |
| `BrandLogo.tsx` | 25 | Both light and dark WebP logos (`/images/brand/bmu-*.webp`) through `next/image`; CSS picks one by theme. |
| `RoleSwitcher.tsx` | 54 | See 3.7. |
| `ThemeToggle.tsx` | 23 | Flips `data-theme` on `<html>` and writes the `theme` cookie. |
| CSS | — | `AppShell.module.css`, `AppSidebar.module.css` (224 lines), `AppTopbar.module.css`, `BrandLogo.module.css`, `RoleSwitcher.module.css`. |

### 4.3 Presence (`src/components/presence/`)

| Component | Notes |
| --- | --- |
| `PresenceHeartbeat.tsx` | `startCheckingIn(employeeId)` from `src/lib/presence/presenceStore.ts`. The comment says every 2 min when active and 5 min when idle, shared across tabs. (The architecture doc says "about once a minute", a minor doc drift.) |
| `PresenceDot.tsx` | Coloured dot or label from the shared store; renders nothing until the status is known. |
| `StatusMenu.tsx` | Teams-style choices (`presenceStatuses`), plus Reset (null) → `setMyStatusAction`; updates the local store. |

### 4.4 UI component catalogue (`src/components/ui/`)

The count is the number of files importing the component (grep over `src`).

| Component | File (lines) | Purpose | Used by (count / examples) |
| --- | --- | --- | --- |
| `ActionButton` | `ActionButton.tsx` (31) | One-click server action without confirmation; shows the error inline | 13 — "Mark all read" on `/notifications` |
| `AppLink` | `AppLink.tsx` (10) | `next/link` with `prefetch=false` by default, to save Vercel requests | 96 |
| `Button`, `ButtonLink` | `Button.tsx` (21) + `Button.module.css` | Variants primary, secondary, ghost, danger; `type="button"` by default | 128 |
| `ConfirmActionButton` | `ConfirmActionButton.tsx` (61) | Button, then a `<dialog>` confirm, then the action; closes on success | 22 — role, department and designation Remove |
| `DataTable.module.css` | (90) | Shared table styles (`scroller`, `table`, `numeric`, `rowActions`, `primaryText`, `pagination`) | 53 |
| `DecisionButtons` | `DecisionButtons.tsx` (72) | Approve or Reject dialog; a reason is required to reject | 2 — Approvals claims, reimbursement detail |
| `EmptyState` | `EmptyState.tsx` (21) | Icon, title, description, optional action | 51 |
| `FormFields` | `FormFields.tsx` (100) | `FieldShell`, `describedBy`, `TextField`, `TextAreaField`, `SelectField` (wraps `SearchableSelect`), `FormGrid`, `FormActions` | 87 |
| `FormMessage` | `FormMessage.tsx` (17) | `role=alert` / `status` for an `ActionResult` | 58 |
| `InlineActionForm` | `InlineActionForm.tsx` (44) | Small add-form inside a panel; clears on success, keeps values on error | 8 |
| `KeepValuesForm` | `KeepValuesForm.tsx` (10) | `<form>` that stops React's automatic reset, so input survives errors | 38 |
| `ListFilters.module.css` | (18) | Filter bar styles | 31 |
| `ListInteractions` | `ListInteractions.tsx` (115) | Global: GET filter forms apply themselves (500 ms typing pause); clicking a table row opens its first link | 1 (`AppShell`) |
| `LoadingPanel` | `LoadingPanel.tsx` (5) | Skeleton block | 2 — `(crm)/loading.tsx`, `DashboardGrid` |
| `PageHeader` | `PageHeader.tsx` (20) | `<h1>`, description, actions | 146 |
| `PageTabs` | `PageTabs.tsx` (17) | Link tabs (`aria-current`) | 15 — Approvals |
| `PaginationBar` | `PaginationBar.tsx` (26) | Previous / Next; hidden for a single page | 30 |
| `Panel` | `Panel.tsx` (27) | Section card with optional header, action, `flush` | 165 |
| `PasswordField` | `PasswordField.tsx` (49) | Password input with show/hide eye | 3 — auth forms |
| `PeriodFilter` | `PeriodFilter.tsx` (38) | Named period or from/to dates (GET form) | 5 — finance and HR reports |
| `PersonAvatar` | `PersonAvatar.tsx` (21) | Initials circle (no images) | 13 |
| `ProgressBar` | `ProgressBar.tsx` (21) | `role=progressbar`, 0-100 | 10 |
| `ReasonForm` | `ReasonForm.tsx` (34) | "Why?" text area before a remove or cancel that stays on record | 3 |
| `SearchableMultiSelect` | `SearchableMultiSelect.tsx` (132) | Type-to-filter checkboxes sharing one name | 7 |
| `SearchablePicker` | `SearchablePicker.tsx` (260) | Combobox (single or multi), keyboard and ARIA, hidden inputs | 3 — client forms and service fields |
| `SearchableSelect` | `SearchableSelect.tsx` (250) | Type-to-filter dropdown backed by a hidden native `<select>` | 4 directly (plus every `SelectField`) — `RoleForm` scope pickers |
| `StatTiles` | `StatTiles.tsx` (29) | `<dl>` of figure tiles, optional links | 30 — dashboard stats |
| `StatusBadge` | `StatusBadge.tsx` (11) | Tones neutral, good, warning, critical | 46 |
| `SubmitButton` | `SubmitButton.tsx` (21) | `useFormStatus` pending label | 40 |
| `WorkspaceLayout.module.css` | (161) | Shared layout classes (`stack`, `list`, `row`, `muted`, `clickableRows`, `fieldRow`) | 92 |

### 4.5 Approvals hub — `/approvals` → `src/app/(crm)/approvals/page.tsx`

- Guard: `requireAccess()`, then the tabs are worked out (`:41-51`): `leave` if leave.approve; `reimbursements` if reimbursements.approve **or** the person has claims to decide (as reporting manager); `payroll` if payroll.approve; `resignations` if exits.manage. No tab → `notFound()`.
- `?tab=` picks one; otherwise the first (`:52-53`).
- **Leave and work** (`:69-156`): pending leave with each person's balance for the year the leave falls in (`getLeaveBalances(employeeId, year)` per unique key), attachment link, `LeaveDecisionButtons`. Below, "Work to review" = `listTasks(view:'review')` when tasks.view, in `TaskTable`.
- **Reimbursements** (`:158-210`): `listClaimsToDecide`, total amount, receipt link, `DecisionButtons` → `decideClaimAction`.
- **Payroll runs** (`:212-239`): `listPayrollRuns({status:'in_review'})` → Review link `/hr/payroll/<id>/review`.
- **Resignations** (`:241-270`): `listResignations({status:'submitted'})` → `/hr/exits/<id>`.

### 4.6 Settings section route table

| URL | File | Permission (page) | What it shows / does |
| --- | --- | --- | --- |
| `/settings` | — (none) | — | 404 (no index page) |
| `/settings/roles`, `/new`, `/[roleId]` | see 3.6 | roles.manage | Roles CRUD |
| `/settings/audit-log` | `settings/audit-log/page.tsx` | audit.view | Paged audit table (50 per page): When, Who, What (`describeAuditEntry`) |
| `/settings/hr` (+ `exits`, `payroll`, `recruitment`, sub-forms) | `settings/hr/**` | hr.manage; exits.manage; payroll.manage; recruitment.manage | HR settings (other chapter) |
| `/settings/finance`, `/settings/finance/categories` | `settings/finance/**` | finance.manage; ledger.manage | Finance settings (other chapter) |
| `/settings/calendar` | `settings/calendar/page.tsx` | content_calendar.manage | Content calendar categories |
| `/settings/services` | `settings/services/page.tsx` | catalog.manage | Services and industries |
| `/settings/ticket-categories` | `settings/ticket-categories/page.tsx` | tickets.manage **at organisation** (`:15-16`) | Ticket categories |

### 4.7 Other route table for this area

| URL | File | Guard | What it shows / does |
| --- | --- | --- | --- |
| `/overview` | `src/app/(crm)/overview/page.tsx` | dashboard.view | Welcome and generated dashboard |
| `/approvals` | `src/app/(crm)/approvals/page.tsx` | requireAccess plus computed tabs | Approvals hub (4.5) |
| `/notifications` | `src/app/(crm)/notifications/page.tsx` | requireAccess | All / Unread tabs, 30 per page, Mark all read, link to settings; each row → `/notifications/<id>/open` |
| `/notifications/[id]/open` | `.../[notificationId]/open/route.ts` | GET, RLS | Marks read and redirects to `safeNotificationLink(link)` |
| `/notifications/[id]/read` | `.../[notificationId]/read/route.ts` | POST, same-origin check, RLS | 204 / 404; used by the service-worker "Mark as read" |
| `/profile` | `src/app/(crm)/profile/page.tsx` | requireAccess | Own details, phone and skills form, signature and seal (if quotations or invoices manage), personal, private (edit only with employees.private_view), documents (add only with files.upload) |
| `/profile/notifications` | `src/app/(crm)/profile/notifications/page.tsx` | requireAccess | This-device push toggle (if the VAPID key is set) and per-kind push checkboxes |

---

## 5. Audit

- Writes: almost all through the DB trigger `public.audit_row_change()` (`20261106000001_organisation_foundation.sql:552`, replaced at `20261106000005_phase2_access_and_reporting.sql:106`). Triggers exist on about 60 tables, including employees, departments, designations, roles, role_permissions, clients, projects, tasks, files, messages, leave, meetings, tickets, finance, payroll, recruitment, exits, ledger, purchases, reimbursements, budgets, calendar categories and document signatures. Explicit SQL inserts are used for Google sign-in events (`googleAccounts.ts:27-37`).
- Immutability: `audit_logs_immutable` (before update or delete) and `audit_logs_no_truncate` (`organisation_foundation.sql:636-638`).
- Reads (`src/server/services/auditService.ts`): `listAuditLogs({entityType?, page})` (`:6-23`, 50 per page, exact count, newest first) and `listRecentActivity(limit)` (`:25-37`). RLS decides visibility.
- Rendering (`src/lib/audit/describeAuditEntry.ts`): `entityLabels` (`:1-60`), `fieldLabels` (`:64-130`), hidden derived fields (`:132-148`), `describeAuditEntry` (`:160-182`; "revealed" entries read "Viewed the full Aadhaar number of …"; updates list field labels only), and `describeTaskChanges` (`:194-210`) for task history.
- Page: `src/app/(crm)/settings/audit-log/page.tsx` (section 4.6). Widget: `RecentActivityWidget`.

---

## 6. Notifications and push

### 6.1 Data flow

```text
DB trigger / cron job ──► public.notify(recipient, kind, title, body, link, …)
   ├─► notifications row (RLS: recipient only)
   ├─► live_updates trigger ──► /api/live (SSE) or Supabase Realtime ──► NotificationBell useLiveRefresh
   └─► net.http_post ──► /api/notifications/dispatch ──► web-push to push_subscriptions
                                     (respects notification_preferences.push_enabled; wording via pushMessage.ts)
```

### 6.2 Files

| File | Lines | Notes |
| --- | --- | --- |
| `src/server/services/notificationService.ts` | 11-28 | `getNotificationSummary` (cached): 8 newest unread and the unread count. |
| | 32-47 | `listNotifications({unreadOnly, page})`, 30 per page. |
| | 49-57 | `getPushPreferences`: every kind, defaulting to on. |
| `src/server/actions/notificationActions.ts` | 11-18 | `markAllNotificationsReadAction` → RPC `mark_all_notifications_read`. |
| | 22-38 | `markNotificationReadAction`: `.is('read_at', null).select('id')`, row check. |
| | 40-57 | `savePushPreferencesAction`: upserts a row for every kind. |
| | 59-78 | `savePushSubscriptionAction`: zod (https endpoint, key lengths) → RPC `save_push_subscription`. |
| | 80-86 | `removePushSubscriptionAction`: delete by endpoint. |
| `src/lib/notifications/notificationKinds.ts` | 5-48 | 42 kinds with user-facing labels (task, file, message, meeting, leave, ticket, finance, payroll, recruitment, exit, reimbursement, budget, attendance). |
| | 53-55 | `safeNotificationLink`: only same-site paths, otherwise `/notifications`. |
| `src/lib/notifications/pushDevice.ts` | 44-50 | `checkPushDevice` → `unsupported`, `blocked`, `on` or `off`. |
| | 64-77 | `refreshPushDevice`: subscribes again if the VAPID key changed, then saves again. |
| | 79-95 | `turnOnPush`: asks permission, waits for the worker to activate (15 s limit), subscribes (60 s limit), saves. |
| `src/lib/notifications/pushMessage.ts` | 18-57 | `buildPushMessage`: actor-based titles; adds due date, priority and "+N more". |
| `src/components/notifications/NotificationBell.tsx` | 32-102 | Bell with unread count (99+), `popover` menu, Mark all read, live refresh on `notifications.recipient_id`, optimistic clear (put back on error). |
| | 107-205 | `BellItem`: swipe-to-clear on touch only; the link is `/notifications/<id>/open`. |
| `src/components/notifications/PushPrompt.tsx` | 54-129 | Shown when push is `off` or `blocked` and not dismissed in the last 7 days (`localStorage crm.pushPromptDismissedAt`). Refreshes the device link once a day or when the person on this device changes (`crm.pushDeviceRefreshedAt`). |
| `src/components/notifications/PushSettings.tsx` | 17-79 | `PushDeviceToggle`: on/off for this device. |
| | 83-103 | `PushPreferencesForm`: one checkbox per kind. |
| Service worker | `public/sw.js` | Shows the push; buttons Open and Mark as read (POST to `/read`). Not read in detail. |

---

## 7. Profile

`src/app/(crm)/profile/page.tsx:22-78`:
- `canSign` = invoices.manage or quotations.manage (`:25-26`).
- In parallel: `getEmployee`, `getPersonalDetails`, `getPrivateDetails`, `listEmployeeDocuments`, and when `canSign`, `getSavedSignature` and `getFinanceSettings` (`:27-34`).
- Panels: `EmployeeProfileDetails`; `MyProfileForm` (phone and skills only); `DocumentSignatureForm` at anchor `#signature` (the target of the dashboard widget's link); `EmployeePersonalPanel canEdit`; `EmployeePrivatePanel` (edit only with employees.private_view; the encryption readiness flag); `EmployeeDocumentsPanel` (add with files.upload).
- There is no change-password control for a signed-in user (only reset links). See O-21.

`/profile/notifications`: see 6.2.

---

## 8. Per-file quick reference (area files not detailed above)

- `src/app/(auth)/AuthLayout.module.css`, `src/components/auth/AuthForms.module.css`, `GoogleSignInButton.module.css`: styling only.
- `src/components/auth/FirstAccountForm.tsx:13-46`, `ForgotPasswordForm.tsx:13-37`, `SetPasswordForm.tsx:12-39`, `LoginForm.tsx:18-59`: all use `useActionState` with `KeepValuesForm` and `FormMessage`.
- `src/components/dashboard/DashboardWidgets.module.css`, `DashboardGrid.module.css`, `DepartmentHeadcountWidget.module.css`: styling.
- `src/components/organisation/OrganisationRowActions.tsx:26-43`: Edit link and Remove confirm, shared by roles, departments and designations.
- `src/app/api/test-support/[...path]/route.ts:15-22`: 404 unless `TEST_SUPPORT_SECRET` is 32+ characters and matches (timing-safe). It can run queries as `service_role` or as any user id, and read emailed links. It is listed as a public path in `routeGuard.ts:16`.

---

## 9. Observations

Each item gives evidence as file:line. "Possible" means the problem was inferred from reading the code and not reproduced.

### Security and sign-in

**O-1. Reset links let a manager sign in as a team member, and this is not audited.** `createSignInLinkAction` (`src/server/actions/employeeActions.ts:232-250`) gives anyone with `employees.create` within reach (department heads at Team scope, per `employeeService.ts:324-328`) a **recovery** link for a person who has already joined (`:249`). Opening it starts a session as that person straight away (`src/app/auth/confirm/route.ts:17-21`). Nothing forces a new password: the person is already signed in before `/set-password`. Neither creating the link nor redeeming it writes to `audit_logs`: `app_auth.one_time_tokens` has no audit trigger, and nothing in `authAccounts.ts:136-168` writes one. The result is impersonation that leaves no trace, and an "important action" with no audit entry (CLAUDE.md build rule).

**O-2. `setPasswordAction` changes the password with only a session.** `src/server/actions/authActions.ts:132-154` accepts any valid session. It does not require the session to have come from a one-time link, or the current password. Anyone with a borrowed or stolen session cookie can open `/set-password` and take over the account. The change is not audited, and it does not end the account's other sessions (`authAccounts.ts:59-65` touches only the password).

**O-3. Forgot-password gives no help and can break an administrator's link (possible fake-button concern).** `emailIsConnected = false` (`src/server/auth/accountEmails.ts:9`), so "Send reset link" (`src/components/auth/ForgotPasswordForm.tsx:30`) never reaches the user. Worse, each request calls `createOneTimeLink`, which **voids every earlier unused recovery link** (`authAccounts.ts:139-142`). If someone submits the form for a colleague's email, the reset link an administrator just handed to that colleague stops working. CLAUDE.md says "No fake buttons… leave its control out". The form does write a row, but the person gets nothing from it.

**O-4. The sign-in rate limit can lock a victim out (possible).** `isRateLimited` is keyed only by email and counts **every** attempt, successful or not (`src/server/auth/signInRateLimit.ts:9-21`, called at `authActions.ts:30`). Anyone can block a known email for 15 minutes with 10 wrong tries. There is no per-IP limit, and a successful sign-in also uses up the budget.

**O-5. Most sign-in events are not audited, but Google sign-in is.** Google sign-in, linking and refusals are audited (`googleAccounts.ts:43`, `:72`, `:90`). Password sign-in (`authActions.ts:22-40`), failed password attempts, sign-out (`:78-81`), founder setup (`:105-130`), setting a password (`:132-154`), reset requests (`:83-102`) and invitation or reset link creation (`employeeActions.ts:232-250`) write nothing. This conflicts with "Every important action writes to `audit_logs`".

**O-6. `/auth/confirm` redeems tokens on GET (possible).** `src/app/auth/confirm/route.ts:10-28`. Link scanners and preview bots (email security tools, chat link previews in WhatsApp or Slack) that fetch the URL will use up the single-use token and receive the session cookie. The real user then sees "link-expired". Tokens also sit in query strings, so they reach proxy and access logs.

**O-7. Sessions are long-lived and cannot be revoked per user.** Sessions last a fixed 30 days and are never rotated (`authAccounts.ts:7`, `:105-118`). No "sign out everywhere" exists. Resetting or changing a password leaves every existing session alive (`setAuthUserPassword`, `:59-65`). Blocking does stop access at once (`findSessionUser` returns `blocked`).

**O-8. Founder setup has a race (possible).** `createFirstAccountAction` checks `founderExists` (`authActions.ts:115`), and `createFounder` checks again (`founderSetup.ts:16`), but nothing serialises two setup requests. No unique constraint on "one Founder" was seen, so two concurrent submissions on a fresh install could both create Founder employees. `/setup` is public (`routeGuard.ts:9`).

**O-9. The bootstrap code looks roles up by name.** `founderSetup.ts:9` (`r.name = 'Founder'`), `:25-27` (role, designation `'Founder'`, department `'Management'`). This is not an access check, so it does not break the "never hardcode a role check" rule in spirit. But `founderExists` decides whether `/setup` is open (`setup/page.tsx:11`, `login/page.tsx:20`). The Founder role is protected and cannot be renamed in the app, so the risk is low.

**O-10. Signing out leaves the device's push subscription linked (possible privacy risk).** `signOutAction` (`authActions.ts:78-81`) does not remove `push_subscriptions` for the device. Until someone else signs in and `refreshPushDevice` re-links the endpoint (`PushPrompt.tsx:34-42`, `:67`), the previous user's notification titles and bodies keep arriving on a shared or handed-over device.

### Access and roles

**O-11. Some screens show the main role, not the role being worked as.** `accessService.ts:20` selects `role:roles(name)`, which is the main `role_id`. It is shown on the Overview header (`src/app/(crm)/overview/page.tsx:15`), the My profile widget (`src/components/dashboard/MyProfileWidget.tsx:30`), the signature title fallback (`DocumentSignatureWidget.tsx:10`) and the profile signature (`profile/page.tsx:53`). The layout correctly uses the acting role (`layout.tsx:20`, `:33`). A person "working as Finance Head" therefore sees "Human Resource" under "Welcome back".

**O-12. Department and designation saves lack the `.select()` row check (CLAUDE.md violation).** `organisationActions.ts:48-50` (`departments.update(row).eq(...)`) and `:90-92` (`designations.update(...)`) do not add `.select()` or check for zero rows. A refused update is reported as success and redirects. The deletes at `:62` and `:104` also do not check the count, so they report "Department removed." / "Designation removed." even when RLS refused (compare `deleteRoleAction`, `:175-182`, which does check).

**O-13. Saving a role is not atomic.** `saveRoleAction` inserts or updates the role (`organisationActions.ts:151-159`), then calls `set_role_permissions` separately (`:161-165`). If the second step fails, for example when a scope is beyond the editor's reach and RLS refuses, the new role remains with no permissions, and the user sees an error. Retrying gives "A role with this name already exists." The error from `set_role_permissions` under RLS may also be generic.

**O-14. Dead branch in the route guard.** `routeGuard.ts:42-44` redirects requests that have a cookie away from `/login`. But the proxy matcher skips every request with a `crm_session` cookie (`src/proxy.ts:31`), so this code never runs. The login and forgot-password pages do their own redirect (`login/page.tsx:17-18`, `forgot-password/page.tsx:10-11`), so behaviour is correct, but the guard code misleads.

**O-15. The default role can be deleted (possible).** `deleteRoleAction` (`organisationActions.ts:171-186`) and the RLS (`organisation_foundation.sql:680-681`) protect only `is_protected` roles. The `is_default` role ("Employee", `20261109000013_team_access.sql:18-20`) can be removed once nobody holds it. Team-scope adds then cannot pick a role (that code reads the default role at `team_access.sql:165`). The roles page also does not say which role is the default.

**O-16. The Approvals menu item can be hidden from someone who has approvals.** The page shows a Reimbursements tab to any reporting manager with claims to decide (`approvals/page.tsx:47`). The menu item needs leave.approve or one of reimbursements.approve, payroll.approve or exits.manage (`navigationRegistry.ts:145-151`). A plain reporting manager can only reach `/approvals` from a notification link.

**O-17. Dashboard stats can be org-wide for a department-scoped user without a department (possible).** `statsDepartmentFilter` returns `access.employee.department_id` (`dashboardService.ts:8-10`). When that is `null`, `if (departmentId)` (`:21`) applies no filter, while the tile still says "Active in your department" (`OrganisationStatsWidget.tsx:11`). RLS on `employees` still limits the rows, so the damage depends on `employees.view` scope. `loadScopedEmployees` also loads every employee row to count in JS, with no pagination (`:17-23`).

**O-18. Permission keys that app code never uses.** `meetings.view`, `tasks.assign`, `tasks.assign_heads` and `tasks.assign_project_team` have 0 references in `src` (they are enforced only in the DB, which is acceptable). `content_calendar.manage` is missing from `docs/PermissionMatrix.md` entirely (0 matches), so the documented matrix is incomplete.

**O-19. No Settings index page.** No `src/app/(crm)/settings/page.tsx` exists, so `/settings` returns 404. `isMainPage` does not list it either. Not harmful, since the sidebar links straight to the sub-pages, but the brief's "Settings index page" does not exist.

### Notifications, audit and UI

**O-20. Notification links with a query string break (bug, high confidence).** `src/app/(crm)/notifications/[notificationId]/open/route.ts:23` assigns `destination.pathname = safeNotificationLink(data.link)`. The URL `pathname` setter percent-encodes `?`, so `'/approvals?tab=reimbursements'` becomes `/approvals%3Ftab=reimbursements` (a 404). Such links exist in the migrations:
- `20261112000009_salaries_reimbursements.sql:272` (`/finance/salaries?view=reimbursements`)
- `:333` (`/approvals?tab=reimbursements`)
- `20261113000003_hr_reports_notifications.sql:65` (`/attendance/report?month=…`)

The bell and `/notifications` both open notifications through this route (`NotificationBell.tsx:184`, `notifications/page.tsx:63`). The push "Open" action may use the stored link directly (not verified in `public/sw.js`). The route also does not filter on `read_at is null`, so opening a notification again overwrites the original read time (`:16-21`).

**O-21. No change-password option for signed-in users.** The profile (`profile/page.tsx`) offers no change-password option. People can only use reset links, which administrators create (O-1) or which are queued with no email (O-3). Not a bug, but a gap that pushes people towards the riskier paths.

**O-22. The audit log shows raw table names for some entities.** `describeAuditEntry.ts:1-60` has no label for tables that do have audit triggers: `tickets`, `ticket_categories`, `meetings`, `messages`, `conversation_members`, `file_shares`, `file_versions`, `company_settings`, `leave_requests`, `document_signatures`. Their entries read like "Updated ticket_categories" or "Created leave_requests" (raw fallback at `:161`). The audit page also offers no entity filter, although `listAuditLogs` supports `entityType` (`auditService.ts:6`, `:17`; the page passes only `page`, `audit-log/page.tsx:25`).

**O-23. Turning push off can report success when it failed.** `PushDeviceToggle.turnOff` (`PushSettings.tsx:39-53`) ignores the `ActionResult` from `removePushSubscriptionAction`, has no `catch`, and always shows "Push notifications are off". `removePushSubscriptionAction` (`notificationActions.ts:80-86`) does not check that a row was deleted. If the server delete fails while the browser unsubscribes, the server keeps a dead endpoint.

**O-24. Some notification actions skip the access check.** `markAllNotificationsReadAction` and `markNotificationReadAction` (`notificationActions.ts:11-38`) do not call `getActionAccess()`. They rely on RLS alone. That is safe, but not the server-layer pattern used elsewhere. `savePushSubscriptionAction` (`:64-78`) likewise.

**O-25. Small UI inconsistencies.**
- "Delayed projects" links to `/projects` with no filter (`ClientProjectStatsWidget.tsx:21`).
- The `followUps` widget is gated on `clients.view` and shows client follow-up dates, while a separate `followups.manage` permission exists for *payment* follow-ups (`dashboardWidgetRegistry.ts:57`). The naming invites confusion.
- `BackButton` uses `history.length > 1` (`BackButton.tsx:20`), so a page opened from another site's tab can go "back" out of the app (possible).
- `src/app/page.tsx:3` says "the site opens at sign-in" but redirects to `/overview`.
- The architecture doc says the heartbeat runs "about once a minute", while `PresenceHeartbeat.tsx:6-8` says every 2 or 5 minutes.

**O-26. The set-password admin update has no row check (minor).** `authActions.ts:144-151` uses `createAdminDatabaseClient()` (allowed in `src/server`) without `.select()`, and only logs errors. For an invitation this means a missed `invite_accepted_at` goes unnoticed, and the employee stays "pending" on the dashboards (`dashboardService.ts:46`).

### Rule checks with nothing found

- No hardcoded role checks (`role === '…'` or a role-name comparison) were found in `src`. The only role-name literals are the bootstrap ones in O-9.
- No breadcrumbs. `BackButton` replaces them, and "breadcrumb" appears only in two comments (`BackButton.tsx:8`, `navigationRegistry.ts:185`).
- `createAdminDatabaseClient()` is used in this area only under `src/server/` (`authActions.ts:144`).
- Every `requirePagePermission` key in the Settings pages matches its sidebar item, except the extra org-scope check on ticket categories, which is enforced in the page (`ticket-categories/page.tsx:15-16`).


# Chapter 3 — CRM and work management modules

Scope: Clients (Client 360), service catalog, projects and milestones, tasks (workflow, time tracking, oversight), workload, calendar and content calendar, meetings, support tickets, files.

All paths are repo-relative to `E:\CRM 2.0`. `file:line` points at the start of the item. Migrations are in `database/migrations/` and are cited by file name only.

---

## 0. Cross-cutting patterns used by every module

| Concern | How it is done | Evidence |
| --- | --- | --- |
| Page guard | `requirePagePermission(key)`: signs in or redirects, then `notFound()` if the permission key is missing at any scope | `src/server/services/accessService.ts:58` |
| Action guard | `getActionAccess(key?)`: returns `null` if there is no ready session, or the key is missing. Each action turns that into `failure('You do not have permission to do this.')` | `src/server/services/accessService.ts:65` |
| Database client | `createDatabaseClient()` runs as `authenticated` with the session user id, or as `anon` without a session, so RLS always applies | `src/server/database/databaseClient.ts:11` |
| Real enforcement | RLS policies plus `guard_*` BEFORE triggers (security definer) in the migrations | see each module |
| Update/delete row check | `.update(...).eq(...).select('id')`, then `if (data.length === 0) return failure(noPermission)` | used throughout (exceptions listed in Observations) |
| Audit | Done by the database, not by app code. `audit_row_change()` AFTER triggers write to `audit_logs`, and stamp `client_id` when the row has one (this feeds the Client 360 timeline) | `20261106000005_phase2_access_and_reporting.sql:103-191` |
| Notifications | Done by the database. Triggers call `public.notify(recipient, kind, title, body, link, priority, [group], [dedupe])`. `notify` skips the actor. Scheduled jobs use `cron.schedule` | `20261109000003_notifications.sql` |
| Live refresh | `TaskLiveRefresh` / `TicketLiveRefresh` subscribe to the `live_updates` publication (tables `tasks`, `task_comments`, `tickets`) | `src/components/tasks/TaskLiveRefresh.tsx:13-16`, `src/components/tickets/TicketLiveRefresh.tsx:10`, `20261106000005…:381-382`, `20261109000009_phase4_access.sql:99` |
| Client names for non-client users | `get_client_labels(uuid[])` returns `id, company_name` for any active employee. Used by the project, task, meeting and file services | `20261106000005…:249`, `src/server/services/clientService.ts:158` |

Audit triggers in this area (`… after insert or update or delete` unless noted):
`clients`, `client_records`, `client_services`, `projects`, `project_members` (insert/delete), `project_milestones`, `tasks` (`20261106000005…:179-191`); `files`, `file_shares` (insert/delete), `file_versions` (insert) (`20261109000001_files.sql:410-414`); `meetings` (`20261109000007_meetings.sql:285`); `tickets` (insert/update), `ticket_categories` (`20261109000008_support_tickets.sql:384-386`); `service_groups`, `services`, `industries` (`20261109000014_service_catalog.sql:189-193`); `calendar_categories`, `calendar_category_members` (`20261113000005_content_calendar.sql:131-133`).
Not audited: `task_comments`, `task_checklist_items`, `task_collaborators`, `task_dependencies`, `meeting_participants`, `ticket_comments`, `file_comments`. `file_access_logs` is its own log. `send_task_files` writes a hand-made `files_sent` audit row (`20261113000012_task_updates_and_file_sends.sql:204`).

---

## 1. Clients (Client 360)

### Purpose
Leads and clients with their contact, billing (GSTIN, billing state) and ownership details (Client Manager, assigned department), industry, chosen services and sub services with plans (Starter, Growth, Premium), and a record log (notes, requirements, feedback, complaints, follow-ups). Client 360 brings together projects, tasks, invoices, quotations, meetings, files and an audit-based timeline.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/clients` | `src/app/(crm)/clients/page.tsx:35` | `clients.view` (`:36`) | Paginated list (25 per page) with filters: search (company, contact, email, code), status, manager, industry, service, sub service. "Add client" only with `clients.create` (`:54`) |
| `/clients/new` | `src/app/(crm)/clients/new/page.tsx:13` | `clients.create` (`:14`) | `ClientForm` with managers, departments, industries, service groups and sub services |
| `/clients/[clientId]` | `src/app/(crm)/clients/[clientId]/page.tsx:46` | `clients.view` (`:47`), and RLS must return the row (`:51-52`) | Client 360: stat tiles (active projects, tasks, open follow-ups, complaints, and "owed to us" and overdue when invoices are visible), projects, tasks, invoices, quotations, meetings, client files, records, timeline, profile, important notes, services |
| `/clients/[clientId]/edit` | `src/app/(crm)/clients/[clientId]/edit/page.tsx:20` | `clients.update` (`:21`) and `can_update_client` RPC (`:32`) | Form prefilled with current (not ended) sub services and plans (`:35-50`). Hidden industries and services stay selectable when the client already uses them (`:36-39`) |

### Server actions (`src/server/actions/clientActions.ts`)

| Action | Line | Permission | Validation | What it does | Row check |
| --- | --- | --- | --- | --- | --- |
| `saveClientAction(clientId\|null)` | 43 | `clients.update` or `clients.create` | `clientSchema` (`src/lib/validation/clientSchema.ts:58`). Then checks the chosen ids exist in `services`/`service_groups` (`:59-67`) and `checkServiceSelection` (`src/lib/clients/serviceSelection.ts:7`) | Edit: RPC `set_client_services` first (the update can hand the client to another manager), then `clients.update` (`:97-105`). Create: insert with `client_manager_id` defaulting to the creator (`:108-114`), then `set_client_services`, which is only logged if it fails (`:118-119`). Redirects to the client | Edit: yes (`:105`) |
| `addClientRecordAction` | 126 | `clients.update` | `clientRecordSchema` (rating only for feedback, due date only for follow-ups) | Insert into `client_records` | n/a (insert) |
| `completeClientRecordAction` | 160 | `clients.update` | none | Sets `completed_at` | yes (`:171`) |
| `deleteClientRecordAction` | 177 | `clients.update` | none | Deletes the record | yes (`:184`) |
| `addClientServiceAction` | 200 | `clients.update` | `clientServiceSchema` | Refuses a duplicate active sub service (`:217-223`). Inserts with `service_name: ''`, which the DB fills in (`fill_client_service_name`, `20261109000014…:114`) | n/a |
| `deleteClientServiceAction` | 242 | `clients.update` | none | Refuses to remove the last non-ended service (`:247-250`), then deletes | yes (`:255`) |

`plansFrom()` (`:191`) reads `servicePlan` fields shaped like `<id>:growth`.

### Services (`src/server/services/clientService.ts`)
- `listClients` (`:40`): service filters resolve to client ids through `client_services` rows that are not ended (`clientsTaking`, `:32`). The filter uses an impossible UUID when nothing matches (`:70`).
- `getClient` (`:78`), `canUpdateClient` (RPC `can_update_client`, `:89`), `listClientRecords` (`:95`), `listClientServices` (`:110`), `getClientTimeline` (RPC `get_client_timeline`, limit 50, `:123`).
- `listClientOptions(access, keepId)` (`:134`): the full client list only with `clients.view`. Otherwise it keeps the record's current client by label, so saving never clears it.
- `clientLabelFor` / `getClientLabels` (`:151`, `:158`).
- Dashboard helpers: `getClientStats` (`:166`, loads every visible client's status), `listDueFollowUps` (`:179`).

### Components (`src/components/clients/`)
`ClientForm.tsx` (save), `ClientServicesFields.tsx` (two-step service and sub service picker with plan), `ClientPanels.tsx` (`ClientRecordsPanel`, `ClientServicesPanel`, `ClientTimelinePanel`), `ClientFilters.tsx`, `ClientStatusBadge.tsx`.

### Business rules
- Statuses: `lead | onboarding | active | on_hold | inactive` (`20261106000003_clients_and_projects.sql:3`). Record kinds: `note | requirement | feedback | complaint | follow_up` (`:4`). Service status: `active | paused | ended` (`:5`).
- Every client needs at least one service group and one sub service under each chosen group (`serviceSelection.ts:12-24`, enforced in the form, the action and `set_client_services`).
- `set_client_services(p_client, p_services, p_plans)` (`20261114000001_client_service_plans.sql:11`): allowed if `can_update_client`, or if the caller created the client and it has no services yet. It deletes non-ended rows that are no longer chosen, inserts the new ones as `active` from today in India, and updates plans. Ended rows stay as history.
- Website is normalised to `https://` and must be http(s) (`clientSchema.ts:49-56`). GSTIN is upper-cased and pattern-checked.
- Visibility, `can_view_client_row` (`20261106000003…:118`): organisation scope; or Client Manager; or project manager or member of any of the client's projects; or, at department scope, the client's department or a project in the actor's department.
- Updating, `can_update_client` (`:164`): organisation scope; or the Client Manager; or, at department scope, the client's department.
- Timeline (`get_client_timeline`, `20261106000005…:200`): the audit rows with this `client_id`. It returns only which fields changed, not their values.

### Tables / RPCs
`clients`, `client_records`, `client_services` (with `service_id`, `plan`), `industries`; RPCs `can_update_client`, `set_client_services`, `get_client_timeline`, `get_client_labels`. RLS is at `20261106000003…:370-396`.

### Notifications
None directly. Follow-up reminders for clients belong to the finance follow-ups area (`send-follow-up-reminders`, outside this scope).

---

## 2. Service catalog (Settings › Services and industries)

### Purpose
The list clients choose from: **service groups** (shown as "services"), **services** (shown as "sub services") with billing (`monthly | one_time | per_unit`) and Starter/Growth/Premium prices before GST, and **industries**. Prices fill in quotation and invoice items.

### Route

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/settings/services` | `src/app/(crm)/settings/services/page.tsx:12` | `catalog.manage` (`:13`) | One panel per group: edit the group, edit each sub service (active ones first, then hidden), add a sub service. "Add a service" panel. Industries list with add and edit |

### Server actions (`src/server/actions/catalogActions.ts`)

| Action | Line | Validation | Notes |
| --- | --- | --- | --- |
| `saveServiceGroupAction` | 25 | `serviceGroupSchema` | Insert with `sort_order: 1000`, or update. `is_active` is read only when editing |
| `saveServiceAction` | 47 | `serviceSchema` (prices: empty means null, rupees with up to 2 decimals, commas stripped; `src/lib/validation/catalogSchema.ts:10-15`) | |
| `saveIndustryAction` | 84 | `industrySchema` | |

All three require `catalog.manage`, use `.select('id')` with a zero-row check, and revalidate `/settings/services`, `/clients`, `/quotations` and `/invoices` (`:18-23`). There is no delete: entries are hidden with "Can be chosen" (`is_active`). The FKs are `on delete restrict` (`20261109000014…:96,105`).

### Services (`src/server/services/catalogService.ts`)
- `getCatalog` (`:11`) loads all groups, services and industries.
- `listServiceGroupOptions(keepIds)` (`:37`) and `listServiceOptions(keepIds)` (`:47`): active entries only, plus any the record already uses.
- `listPricedServices` (`:67`): only sub services with at least one price, for quotation and invoice pickers.
- `listClientServiceItems(clientIds)` (`:97`): each client's non-ended services as invoice items. The price is the client's plan price, or else the lowest priced plan (`:115-116`).
- `listIndustryOptions(keepId)` (`:131`).

### Lib
`src/lib/catalog/servicePricing.ts`: billing labels, `servicePlans`, `serviceItemName` (`:45`), `serviceItemDescription` (`:56`).

### Tables / RLS
`service_groups`, `services`, `industries` (`20261109000014_service_catalog.sql:5-30`). Every signed-in user can select. Writes are `for all` gated on catalog management (`:200-214`). Prices come from `20261113000010_service_prices.sql`.

### Notifications
None.

---

## 3. Projects and milestones

### Purpose
Client or internal projects with a project manager, lead department, team members, milestones, linked tasks, files and an optional team chat. Health and progress are calculated, not stored.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/projects` | `src/app/(crm)/projects/page.tsx:25` | `projects.view` (`:26`) | List with search (name or code) and status filters, 25 per page. "New project" with `projects.create` |
| `/projects/new` | `src/app/(crm)/projects/new/page.tsx:18` | `projects.create` (`:19`) | `ProjectForm`, with `?clientId=` preselected |
| `/projects/[projectId]` | `src/app/(crm)/projects/[projectId]/page.tsx:37` | `projects.view` (`:38`) and RLS | Status, health and priority badges; progress bar; tasks (top level only); milestones; project files; details; members. "Team chat" if `messages.use` and a linked conversation exists (`:52-54`). Edit when `can_manage_project` (`:75`). Upload when manager or member and `files.upload` (`:59`) |
| `/projects/[projectId]/edit` | `src/app/(crm)/projects/[projectId]/edit/page.tsx:20` | `projects.update` (`:21`) and `can_manage_project` (`:31`) | Edit form. Keeps the current client as a label (`:32`) |

### Server actions (`src/server/actions/projectActions.ts`)

| Action | Line | Permission | Validation | Notes |
| --- | --- | --- | --- | --- |
| `saveProjectAction` | 20 | `projects.update` / `projects.create` | `projectSchema` (due date on or after start date; `src/lib/validation/workSchema.ts:41`) | Create defaults the PM to the creator (`:64`). Update has a row check (`:60`). Redirects |
| `addProjectMemberAction` | 75 | `projects.update` | `z.uuid()` | Insert. A duplicate reports "already on the team" |
| `removeProjectMemberAction` | 96 | `projects.update` | none | Row check (`:108`) |
| `addMilestoneAction` | 114 | `projects.update` | `milestoneSchema` | Insert |
| `setMilestoneDoneAction` | 138 | `projects.update` | none | Sets or clears `completed_at`. Row check (`:153`) |
| `deleteMilestoneAction` | 159 | `projects.update` | none | Row check (`:166`) |

### Services (`src/server/services/projectService.ts`)
`listProjects` (`:63`), `getProject` (`:86`), `canManageProject` (`:98`), `listProjectMembers` (`:104`), `listProjectMilestones` (`:116`), `listProjectOptions` (`:129`, planning, active and on hold only), and `getProjectStats` (`:142`, a dashboard helper that loads every visible project). `addClientNames` (`:17`) uses `get_client_labels`. `addProgress` (`:30`) uses `get_project_progress`.

### Calculations (`src/lib/projects/projectHealth.ts`)
- `getProjectHealth` (`:28`): completed or cancelled is `closed`; a due date in the past is `delayed`; any overdue task is `at_risk`; otherwise `on_track`.
- `progressPercentage` (`:34`) = round(completed / total × 100). Tasks are counted by `get_project_progress` (`20261106000005…:258`): top-level tasks only, rejected ones excluded, overdue measured in India time.

### Components (`src/components/projects/`)
`ProjectForm.tsx`, `ProjectPanels.tsx` (`ProjectMembersPanel`, `ProjectMilestonesPanel`), `ProjectTable.tsx`, `ProjectBadges.tsx`.

### Tables / RLS
`projects`, `project_members`, `project_milestones` (`20261106000003…:69-110`). Insert needs `can_create_project(department_id)`. Update needs `can_manage_project`, with `with check (current_employee_id() is not null)`. Members and milestones are written by `can_manage_project` (`:398-421`). A trigger sets `completed_at` on status change (`set_project_completed_at`, `:322`).

### Notifications
None for projects themselves.

---

## 4. Tasks

### Purpose
Assignable work with a status workflow, reviewer sign-off, subtasks, checklist, dependencies, collaborators, comments, attachments and deliverables, escalation, recurrence, automatic time tracking, and oversight filters for managers.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/tasks` | `src/app/(crm)/tasks/page.tsx:58` | `tasks.view` (`:59`) | Tabs: `mine` (default), `assigned`, `review` (with a count), `all`. Filters: search, status, stage, priority, overdue, due from/to, assignee, creator, department. Assignee and department filters appear only for `all`/`assigned` and only when `tasks.view` is wider than `own` (`:73-77`). Header shows open and overdue counts (`getTaskStats`) |
| `/tasks/new` | `src/app/(crm)/tasks/new/page.tsx:21` | `tasks.create` (`:22`) | Query `projectId`, `clientId`, `parentTaskId` (subtask), `meetingId` (meeting follow-up). Loads assignable people (`get_assignable_employee_ids`), reviewers (`get_reviewer_ids`), projects, clients and the HR work calendar for working-day due dates |
| `/tasks/[taskId]` | `src/app/(crm)/tasks/[taskId]/page.tsx:54` | `tasks.view` (`:55`) and RLS | Status action buttons (`getTaskActions`), Edit when `canManage`, Delete when `canManage` and the status is `not_started` or `assigned` (`:78`); progress form; attachments with "Send files"; checklist; subtasks (top level only); dependencies; comments; details with a live work timer; reassign; escalate; collaborators; history |
| `/tasks/[taskId]/edit` | `src/app/(crm)/tasks/[taskId]/edit/page.tsx:20` | `tasks.view` (`:21`) and `actor.canManage` (`:29`) | `TaskForm`. Keeps the current assignee even when they are outside the editor's reach (`:40-43`) |

### Server actions (`src/server/actions/taskActions.ts`)

| Action | Line | Permission check | Validation | What it does | Row check |
| --- | --- | --- | --- | --- | --- |
| `saveTaskAction(taskId, parentTaskId, meetingId)` | 54 | `tasks.create` (also for edits) | `taskSchema` (`workSchema.ts:75`: up to 20 http(s) reference links, due time needs a due date, dates in order) | Insert (with `parent_task_id`, `meeting_id`) or update. A subtask's recurrence is forced to `none` (`:80`). Redirects to the parent or the task | update yes (`:90`) |
| `changeTaskStatusAction(taskId, status, note, rating, workLink)` | 110 | session only | Work link must be `https://` (`:106`) | Optionally inserts a `files` row of kind `link` first. Then updates status (and `quality_rating`). If the update fails, removes the link with RPC `delete_file` (`:146-150`). The note becomes a comment (`:152-154`, result not checked) | yes (`:146`) |
| `sendTaskFilesAction` | 166 | session | none | RPC `send_task_files` | RPC raises |
| `requestTaskResumeAction` | 179 | session | none | RPC `request_task_resume`. The note is also inserted as a comment (`:184`, unchecked) | RPC raises |
| `createMyTaskAction` | 191 | `tasks.create` | `myTaskSchema` | A self-assigned task from the calendar (the DB sets it to `accepted`) | n/a |
| `rescheduleTaskAction` | 226 | session | `z.iso.date()` | Updates `due_date` (calendar drag or Move) | yes (`:236`) |
| `updateTaskProgressAction` | 243 | session | `taskProgressSchema` (0 to 100) | Updates `completion_percentage` | yes (`:264`) |
| `reassignTaskAction` | 270 | session | `z.uuid()` | Updates `assignee_id` | yes (`:288`) |
| `escalateTaskAction(taskId, escalateToId)` | 294 | session | `taskEscalationSchema` (reason). `escalateToId` is not validated in the action | Sets `escalated_to` and `escalation_reason`, then adds a comment (`:315`, unchecked) | yes (`:313`) |
| `deleteTaskAction` | 321 | session | none | Delete. `isStillInUse` gives "Remove its subtasks first". Zero rows gives "Only tasks that have not started can be removed." | yes (`:330`) |
| `addTaskCommentAction` | 336 | session | `taskCommentSchema` | Insert | n/a |
| `addChecklistItemAction` / `setChecklistItemDoneAction` / `deleteChecklistItemAction` | 355 / 374 / 395 | session | `checklistItemSchema` | CRUD | yes for update and delete |
| `addTaskDependencyAction` / `removeTaskDependencyAction` | 408 / 429 | session | `z.uuid()` | `task_dependencies`. A cycle is refused by the `prevent_dependency_cycle` trigger (`20261106000004_tasks.sql:553`) | yes for delete |
| `addTaskCollaboratorAction` / `removeTaskCollaboratorAction` | 447 / 468 | session | `z.uuid()` | `task_collaborators` | yes for delete |

### Services (`src/server/services/taskService.ts`)
- `listTaskOversightOptions(access)` (`:59`): `null` at `own` scope. Otherwise the people and departments within reach: organisation is everyone; department is my department; team is me plus `get_my_team_ids`.
- `listTasks(access, filters)` (`:88`): the view filters (`:101-108`), with `review` meaning `under_review`, not my own, and created by me or reviewed by me unless I have `tasks.manage`. The department filter covers tasks filed under the department or held by its people (`:119-132`). Personal lists hide completed and rejected unless a status, stage, overdue or date filter is set (`:139-141`).
- `getTask` (`:165`) adds `countedSeconds` from `actual_hours`. `getTaskActor` (`:206`) mirrors `guard_task_update` using RPC `can_manage_task`. `loadTaskPanels` (`:228`) loads subtasks, checklist, comments, collaborators, dependencies and `get_task_history`.
- `countUnsentTaskFiles` (`:196`), `listAssignableEmployees` (`:265`), `listReviewerOptions` (`:280`), `listDependencyOptions` (`:294`, up to 100 open tasks, same project), `getTaskStats` (`:312`, loads every visible task), `listMyOpenTasks` (`:343`).

### Workflow (`src/lib/tasks/taskWorkflow.ts` mirrors `guard_task_update`)
Statuses: `not_started, assigned, accepted, in_progress, under_review, changes_requested, on_hold, completed, rejected` (`:6-16`). Stages: todo, doing, review, done (`:26-31`). Overdue is calculated, never stored (`:53`).

Starting status on insert (`guard_task_insert`, `20261106000004_tasks.sql:290`): no assignee gives `not_started`; assignee = creator gives `accepted`; otherwise `assigned`. The insert guard also requires `tasks.create`, `can_assign_task_to`, project visibility and `can_work_on_task(parent)`. It inherits project, client and department from the parent or project, and resets progress, completion, verifier and rating.

Allowed moves (`20261113000008_task_time_tracking.sql:151-217`):

| Who | From → To |
| --- | --- |
| Assignee | assigned → accepted / rejected; accepted → in_progress / on_hold; in_progress → under_review / on_hold; on_hold → in_progress; changes_requested → in_progress |
| Assignee of a self task with no reviewer | in_progress → completed |
| Reviewer (creator, `reviewer_id` or manager, and not the assignee unless it is a self task) | under_review → completed / changes_requested |
| Manager (`can_manage_task`, and not the assignee unless also the creator) | any open status → on_hold; completed → changes_requested ("Reopen") |
| Manager on an on-hold task | cannot resume. Uses `request_task_resume` instead (`:182-185`, `:266`) |

Extra rules in the guard:
- `task_code`, `created_by` and `parent_task_id` are immutable (`:57-61`).
- `actual_hours` and `work_started_at` cannot be typed in (`:64-67`). Resume-request fields change only through the RPC, behind a transaction flag (`:68-74`).
- Detail fields (title, dates, priority, project, client, reviewer and others) need manager rights, except that the assignee may move the deadline of open work (`:53-55`, `:76-93`).
- Progress can be changed by the assignee or a manager (`:100`). A rating needs reviewer rights (`:105`).
- Escalation may only go to the creator or someone up the assignee's reporting line (`:114-128`).
- Reassignment needs manager rights, is refused on completed tasks, needs `can_assign_task_to`, and resets the status (`:130-149`).
- A task cannot move to in_progress, under_review or completed while a blocking dependency is incomplete (`:191-199`). It cannot complete while subtasks are open (`:202-208`).
- Completion sets `completed_at`, sets progress to 100, and sets `verified_by` to the actor unless the actor is the assignee (`:209-211`). Reopening clears these (`:212-216`).
- `check_task_due_time` (`20261111000002_chat_actions_task_times.sql:19`) validates due time changes.

Time tracking (`track_task_time`, `20261113000008…:225`): each stretch in in_progress is added to `actual_hours` (rounded to 0.01 h, capped at 99999.99). `work_started_at` is set when the task enters in_progress, and the resume request is cleared. The page shows the running timer (`TaskWorkTimer`).

Recurrence (`create_next_recurring_task`, `20261106000004_tasks.sql:583-630`): completing a top-level recurring task inserts the next run (start and due date + 1 day, week or month) and copies the checklist.

Deletion (RLS `tasks_delete`, `:651`): `can_manage_task` and status `not_started` or `assigned`.

Send files (`send_task_files`, `20261113000012…:151`): only the assignee or a collaborator. Sends files added since their last `files_sent` or submission (found from `audit_logs`, `:109-126`) to the creator and the reviewer (excluding themselves and inactive people). Notifies `file_received` and writes a `files_sent` audit row.

Working days (`src/lib/tasks/workingDays.ts:22`, used by `TaskDurationField.tsx:31-43`): the due date is counted in working days from the HR working-days setting and company holidays. This runs in the browser only.

### Access functions
`can_manage_task` (`20261106000004…:169`): the creator; organisation scope; at department scope, the task's department or the assignee's department; otherwise anyone up the assignee's reporting line. `can_view_task_row` (`:215`): organisation scope; anyone involved (creator, assignee, reviewer, escalated-to, collaborator); department scope; team or department reporting line. `can_work_on_task` (`:269`): manager, assignee or collaborator. RLS (`:642-684`): checklist writes need `can_work_on_task`; collaborators and dependencies need `can_manage_task`; comments need `can_view_task`, and only the author edits a comment.

### Components (`src/components/tasks/`)
`TaskForm.tsx` (save, with `TaskDurationField`), `TaskStatusActions.tsx` (one dialog per action with a note, a 1–5 rating defaulting to 4, and a work link; `:22-102`), `TaskPanels.tsx` (checklist, subtasks, dependencies, comments, history, progress, collaborators, reassign, escalate), `TaskSendFiles.tsx`, `TaskWorkTimer.tsx`, `TaskTable.tsx`, `TaskFilters.tsx`, `TaskViewTabs.tsx`, `TaskBadges.tsx`, `TaskLiveRefresh.tsx`.

### Notifications (`notify_task_events`, latest in `20261114000008_leave_visibility_task_notices.sql:43-139`)

| Event | Recipient | Kind | Priority |
| --- | --- | --- | --- |
| Insert with assignee ≠ creator | assignee | `task_assigned` | high if priority is high or urgent |
| Assignee changed | new assignee | `task_assigned` | same |
| → under_review | reviewer, or the creator | `task_review_requested` | same |
| → changes_requested | assignee | `task_changes_requested` | high |
| → completed | assignee, and the creator if different | `task_completed` | normal |
| → rejected | creator | `task_rejected` | high |
| Due date moved (same assignee, open, not a self task moved by its owner) | assignee, creator, reviewer | `task_rescheduled` | same |
| Detail fields edited by someone else | assignee (grouped by `task-updated:<id>`) | `task_updated` | same |
| `escalated_to` changed | escalated-to | `task_escalated` | high |
| `request_task_resume` | assignee | `task_resume_requested` | high (`20261113000008…:293`) |
| `send_task_files` | creator and reviewer | `file_received` | normal |

Scheduled job `process-task-deadlines` every 15 minutes (`20261109000003_notifications.sql:270-315`): due today or tomorrow sends `task_due_soon`; overdue sends `task_overdue` to the assignee and the creator (deduplicated per task and date); at 2+ days overdue the task is escalated automatically to the assignee's reporting manager, once.

---

## 5. Workload

### Purpose
Per-person and per-department load against a 40-hour week, stage counts, and performance figures over 90 days, shown separately and not combined into a rank.

### Route

| URL | File | Permission | Shows |
| --- | --- | --- | --- |
| `/workload` | `src/app/(crm)/workload/page.tsx:19` | `workload.view` (`:20`) | Stage totals; counts of overloaded, balanced and with capacity; `EmployeeWorkloadTable`, `DepartmentWorkloadTable` (department ids come from `ticketService.listDepartmentOptions`, `:14`), `EmployeePerformanceTable`. Names and numbers link to `/tasks` with filters (`src/components/workload/WorkloadTables.tsx:29-92`, `:175-204`) |

There are no server actions. Services (`src/server/services/workloadService.ts`): `getWorkloads()` (`:6`, RPC `get_workload_rows`) and `getMyWorkload()` (`:16`, RPC `get_my_workload_rows`, for the dashboard card).

### Calculation (`src/lib/tasks/calculateWorkload.ts`)
- Capacity is 40 h (`:3`). An unestimated task counts as 4 h (`:6`). Priority weights: low 0.8, medium 1, high 1.25, urgent 1.5 (`:8`). Overdue weight 1.25 (`:10`).
- For each open task, remaining = estimate × (1 − progress%). Weighted = remaining × priority weight × (1.25 if overdue) (`:81-88`). Utilisation = weighted / 40 (`:100`).
- Indicator: above 1 is overloaded; below 0.4 is underutilised (shown as "have capacity"); otherwise balanced (`:52-56`).
- Performance: completed count, complexity points, on-time rate (completed date ≤ due date), average quality, and hours accuracy = Σestimate / Σactual (`:96-117`).
- `summariseByDepartment` (`:124`) averages utilisation per department.

### Database
`get_workload_rows` (latest `20261116000003_workload_leadership.sql:11`): active employees whose role has `tracks_workload` (Founder and Co-Founder are set to false, `:9`). Scope: organisation; self; department; or reporting line. Joined with tasks that are open or completed in the last 90 days, plus an empty row for people with no tasks.

### Notifications
None.

---

## 6. Calendar and content calendar

### Purpose
A personal month, week and day calendar of my meetings, content entries, my task deadlines, team leave and holidays. Content planners (`content_calendar.manage`) add content work under categories. Each category's people become participants and **each gets a task** for the entry. Entries can be imported from CSV or XLSX.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/calendar` | `src/app/(crm)/calendar/page.tsx:22` | `meetings.create` (`:23`) | Views month, week and day (`?view=&date=`). Previous, today and next. "New meeting" or "New entry". The import form appears only for planners (`:68`). `CalendarView`: drag or Move for my open tasks; a day menu adds a personal task (`tasks.create`) or content work (planners) |
| `/calendar/import-template` | `src/app/(crm)/calendar/import-template/route.ts:9` | `content_calendar.manage` (403 otherwise) | CSV template with one example row per active category, dated from tomorrow in India time |
| `/settings/calendar` | `src/app/(crm)/settings/calendar/page.tsx:13` | `content_calendar.manage` (`:14`) | Category editor: name, description, members, active |

### Server actions (in `src/server/actions/meetingActions.ts`, plus two task actions)

| Action | Line | Permission | Notes |
| --- | --- | --- | --- |
| `addContentWorkAction` | 113 | `content_calendar.manage` | Reuses `meetingSchema` with kind `content` and requires a category. Inserts the meeting; the DB adds people and tasks |
| `importContentCalendarAction` | 163 | `content_calendar.manage` | File up to 2 MB, up to 300 rows. `readSpreadsheet`, then `parseCalendarSheet`. Any row problem or unknown category rejects the whole sheet (`:189-197`). Duplicates (same category, title and start) are skipped (`:199-216`). One bulk insert (`:219-231`) |
| `saveCalendarCategoryAction` | 241 | `content_calendar.manage` | Insert or update with a row check (`:258`), then member list diff (`:263-276`) |
| `createMyTaskAction` | `taskActions.ts:191` | `tasks.create` | Self task from the day menu |
| `rescheduleTaskAction` | `taskActions.ts:226` | session | Drag or Move (`src/components/meetings/CalendarTaskMove.tsx:16`) |

### Services (`src/server/services/meetingService.ts`)
`getCalendarItems(access, from, to)` (`:52`) merges:
- **holidays** (`holidays` table);
- **my meetings**: meetings I organise, or where I am a participant who has not declined (`:8-34`). A content entry is hidden when I already have its task (`:73-85`). Past scheduled meetings show as done (`:94`);
- **my tasks** with due dates in range, excluding rejected. Completed tasks show "Done:". Content tasks show without "Due:". Open ones are movable (`:96-106`);
- **team leave** from `getTeamLeave` (`hrService`), expanded day by day (`:110-126`).

Sorted by date, then holiday, leave, meeting, task, then time (`:128-133`). `listCalendarCategories` (`:137`).

### Lib
- `src/lib/calendar/calendarRange.ts`: `calendarRange` (`:47`; weeks start on Monday; months cover whole weeks), `isCalendarDate` (`:96`), `datePartInIndia` (`:102`), `indiaDateTime` (`:107`, which adds a fixed `+05:30`).
- `src/lib/calendar/parseCalendarSheet.ts`: finds the header row by alias (`:26-33`, `:89-92`). Dates: ISO, D/M/Y (day first), "13 Nov 2026", "Nov 13, 2026" or an Excel serial (`:44-59`). Times: 24 h, am/pm, `1430` or an Excel fraction (`:62-77`). Defaults: start 10:00, end = start + 1 h (`:126-127`).

### Components (`src/components/meetings/`)
`CalendarView.tsx`, `CalendarDayMenu.tsx`, `CalendarTaskMove.tsx`, `CalendarImportForm.tsx`, `CalendarCategoryForm.tsx`.

### Database rules (content)
- Permission `content_calendar.manage` is seeded for the Founder, Client Manager and "human resource" roles (`20261113000005_content_calendar.sql:6-14`).
- Tables `calendar_categories` and `calendar_category_members` (`:17-33`). Every signed-in user can select (`:140-144`). `meetings.category_id` (`:35`).
- `guard_meeting_category` (`:46`): only planners may set or change a category, and the category must be active.
- `add_category_people` (latest `20261113000009_content_calendar_tasks.sql:14`): on insert or category change, adds active category members (except the organiser) as participants, and inserts one task per member: title "Category: Title", due on the entry's date and time in India time, priority medium, status assigned, created by the organiser.
- `notify_meeting_invite` (latest `:49`) does not send a meeting invite to category members, because the task notification covers it.
- `move_content_tasks` (`:74-91`): moving the entry moves the open tasks' due date and time.

### Notifications
`task_assigned` per content task (from `notify_task_events` on insert). `meeting_invited` for non-category participants. Meeting change, cancel and reminder as in section 7.

---

## 7. Meetings

### Purpose
Meetings of kinds `internal, department, management, client, project, one_to_one, content` (`src/lib/validation/meetingSchema.ts:18`), with participants and responses, notes and decisions, follow-up tasks, attachments and reminders.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/meetings` | `src/app/(crm)/meetings/page.tsx:4` | none (redirect) | Redirects to `/calendar` |
| `/meetings/new` | `src/app/(crm)/meetings/new/page.tsx:21` | `meetings.create` (`:22`) | `MeetingForm`. `?date=`, `?clientId=` (kept only if the client is selectable, `:44`). Categories only for planners |
| `/meetings/[meetingId]` | `src/app/(crm)/meetings/[meetingId]/page.tsx:36` | `meetings.create` (`:37`) and RLS | Join link (https only, while scheduled); "I am going" and "I cannot go" for invitees; Edit, "Mark as held" and "Cancel meeting" for the organiser while scheduled (`:73-88`); notes and decisions (editable when involved); follow-up tasks with "Add task" (`/tasks/new?meetingId=`); details; people with responses; attachments |
| `/meetings/[meetingId]/edit` | `src/app/(crm)/meetings/[meetingId]/edit/page.tsx:22` | `meetings.create` (`:23`) and organiser identity (`:28`) | Edit form |

### Server actions (`src/server/actions/meetingActions.ts`)

| Action | Line | Permission check | Validation | Notes |
| --- | --- | --- | --- | --- |
| `saveMeetingAction` | 22 | `meetings.create` | `meetingSchema` (ends after it starts, https meeting link, up to 200 invitees) | Sets `category_id` only for planners (`:47-51`). Times are built with `indiaDateTime`. Insert, or update with a row check (`:68`). Then syncs participants with the form plus category people, excluding the organiser (`:78-105`) |
| `respondToMeetingAction` | 282 | session | typed `'accepted' \| 'declined'` | Updates my own participant row. Zero rows gives "not invited" (`:295`) |
| `setMeetingStatusAction` | 301 | **none in code** | typed `'completed' \| 'cancelled'` | Updates status with a row check |
| `saveMeetingNotesAction` | 313 | **none in code** | `meetingNotesSchema` | Updates notes and decisions with a row check |

### Services
`getMeeting` (`meetingService.ts:183`, with organiser, client, project, category and participants; the client falls back to its label), `listMeetingFollowUps` (`:205`), `listUpcomingMeetings` (`:153`, dashboard), `listClientMeetings` (`:171`, Client 360).

### Components
`src/components/meetings/MeetingForms.tsx` (`MeetingForm`, `MeetingNotesForm`).

### Database rules (`20261109000007_meetings.sql`)
- `can_view_meeting_row` (`:48`): the organiser, `meetings.view` at organisation scope, or a participant.
- `guard_meeting_insert` (`:88`): needs `meetings.create`. Sets the organiser to the actor and the status to scheduled. Linking a client or project needs view access to it.
- `guard_meeting_update` (`:115`): the organiser cannot change. Non-organisers may change only `notes`, `decisions` and `updated_at`. New client or project links are re-checked.
- `guard_meeting_response` (`:147`): only your own invitation, only the response; stamps `responded_at`.
- `check_task_meeting_link` (`:168`): a follow-up task may only link to a meeting the creator can see.
- RLS (`:291-308`): update uses `can_view_meeting_row`; delete is organiser only (there is no delete action in the app); participants are inserted and deleted by the organiser.

### Notifications

| Trigger | Recipient | Kind |
| --- | --- | --- |
| Participant inserted while scheduled (not category members) | participant | `meeting_invited` (`20261113000009…:49`) |
| Status → cancelled | all participants | `meeting_cancelled` (high) (`20261109000007…:215`) |
| Time, place or link changed while scheduled | all participants | `meeting_changed` |
| Cron `send-meeting-reminders` every 5 min, 15 min before the start | participants who have not declined, and the organiser | `meeting_reminder` (high, deduplicated per start time) (`:251-277`) |

---

## 8. Support tickets

### Purpose
Internal help desk. A ticket goes by category to a handling department or a default assignee and runs open → assigned → in_progress ↔ waiting_for_response → resolved → closed, with reopening.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/tickets` | `src/app/(crm)/tickets/page.tsx:34` | `tickets.create` (`:35`) | Tabs: My tickets; Assigned to me and Support queue (only with `tickets.manage`, `:37-57`). Search and status filters. Open-only by default outside "mine" |
| `/tickets/new` | `src/app/(crm)/tickets/new/page.tsx:11` | `tickets.create` (`:12`) | `RaiseTicketForm` with active categories |
| `/tickets/[ticketId]` | `src/app/(crm)/tickets/[ticketId]/page.tsx:64` | `tickets.create` (`:65`) and RLS | Status moves (`availableMoves`, `:28-53`), Resolve with a resolution, conversation and reply, details, Handling form (assignee and priority) for handlers, attachments |
| `/settings/ticket-categories` | `src/app/(crm)/settings/ticket-categories/page.tsx:14` | `tickets.manage` at **organisation** scope (`:15-17`) | Category editor: name, description, handling department, default assignee, active |

### Server actions (`src/server/actions/ticketActions.ts`)

| Action | Line | Permission check | Validation | Notes |
| --- | --- | --- | --- | --- |
| `raiseTicketAction` | 31 | `tickets.create` | `ticketSchema` | Insert. The DB sets the requester, departments, assignee and status. Redirects |
| `saveTicketHandlingAction` | 61 | **none in code** | `ticketHandlingSchema` | Updates assignee and priority with a row check (`:76`) |
| `changeTicketStatusAction` | 82 | **none in code** | resolution 3–4000 characters when resolving | Row check (`:99`) |
| `addTicketCommentAction` | 113 | session | `ticketCommentSchema` | Insert. If the requester replies while `waiting_for_response`, moves the ticket to `in_progress` (`:125-128`, result not checked) |
| `saveTicketCategoryAction` | 134 | `tickets.manage` (any scope in code; the DB requires organisation) | `ticketCategorySchema` | Insert with `sort_order: 100`, or update with a row check |

### Services (`src/server/services/ticketService.ts`)
`canHandleTicket` (`:23`, mirrors `can_manage_ticket_row`), `listTickets` (`:34`; queue = not mine, limited to my handling department unless organisation scope), `countTicketsToHandle` (`:69`), `listTicketsToHandle` (`:86`, dashboard), `getTicket` (`:100`), `listTicketComments` (`:120`), `listTicketHandlers` (`:133`), `listTicketCategories` (`:147`), `listDepartmentOptions` (`:166`, also used by `/workload`).

### Components (`src/components/tickets/`)
`TicketForms.tsx` (`RaiseTicketForm`, `TicketHandlingForm`, `TicketCategoryForm`), `TicketStatusActions.tsx`, `TicketTable.tsx`, `TicketBadges.tsx`, `TicketLiveRefresh.tsx`.

### Database rules (`20261109000008_support_tickets.sql`)
- Seeded categories (`:15-26`): Technical issue, Software problem, Hardware requirement (Design & Development); Access permission, HR, General administration (Management); Finance.
- `ticket_code` = `TKT-0001…` from a sequence (`:30-35`).
- `can_manage_ticket_row` (`:78`): the assignee; organisation scope; or department scope with the same handling department. View = requester or handler (`:97`).
- `guard_ticket_insert` (`:115`): needs `tickets.create`. Sets the requester and their department, and the handling department from the category. With an active default assignee the ticket starts `assigned`, otherwise `open`.
- `guard_ticket_update` (`:159-233`): code, requester, departments and category are immutable. The requester may edit title and description only while open or assigned. Only handlers change priority, assignee or resolution. The assignee must be in the handling department unless the handler has organisation scope. Moves: handler → anything except closed, and closed only from resolved; requester: resolved → closed/open, closed → open, waiting_for_response → in_progress. Resolving requires a resolution and stamps `resolved_at`; closing stamps `closed_at`; reopening clears both.
- RLS (`:393-414`): categories are written only at organisation scope; tickets are updated by viewers (with the guard deciding field rules); there is no delete policy.

### Notifications

| Trigger | Recipient | Kind |
| --- | --- | --- |
| Insert with an assignee | assignee | `ticket_raised` |
| Insert without an assignee | head of the handling department | `ticket_raised` |
| Assignee changed | new assignee | `ticket_raised` |
| Status changed | requester | `ticket_updated` (high for resolved or waiting) |
| Back to open or in_progress from resolved, closed or waiting | assignee | `ticket_updated` |
| Comment inserted | requester and assignee (the actor is skipped), with the comment body in the notification | `ticket_updated` (`:284-300`) |

---

## 9. Files

### Purpose
Uploads (versioned) and external links (Drive), attached to clients, projects, tasks, meetings, tickets, employees or candidates. Covers sharing with people or departments with expiry, comments, an access log, archiving, permanent deletion, and signed-link downloads.

### Routes

| URL | File | Permission | Shows / does |
| --- | --- | --- | --- |
| `/files` | `src/app/(crm)/files/page.tsx:37` | `files.upload` (`:38`) | Sections: mine, received, sent, client, department, project, links, archived. Upload panel (mine), Drive link form (mine and links), search, 30 per page. Delete in the table for the owner, or anyone when `files.view` is organisation (`:91-94`) |
| `/files/[fileId]` | `src/app/(crm)/files/[fileId]/page.tsx:35` | `files.upload` (`:36`) and RLS (only `status = 'ready'`) | Download, open link, Archive/Restore (owner), Delete (owner or `files.view` organisation, `:80`), preview, "Send to" (owner), comments, details, edit details (owner), versions and new-version upload (owner), shared-with list and remove (owner), access history (owner) |
| `/files/[fileId]/download` | `src/app/(crm)/files/[fileId]/download/route.ts:9` | session plus RLS on `files` and `file_versions` | `?version=n` and `?mode=view`. Records access (`record_file_access`, `:41`), then 302s to a signed link valid for one minute (`createDownloadLink`). Only previewable types open inline; everything else downloads (`:37-39`) |

### Server actions (`src/server/actions/fileActions.ts`)

| Action | Line | Permission check | Validation | Notes |
| --- | --- | --- | --- | --- |
| `startUploadAction` | 87 | `files.upload` | `checkUploadable` (extension allow-list, not empty, at most 50 MB), `startUploadSchema` (employee docs need a `documentType`) | Inserts a `files` row (status uploading), then `startVersion` (`:116`): inserts `file_versions`, then `createUploadLink(storage_path)` |
| `startNewVersionAction` | 136 | `files.upload` | `checkUploadable` | New version slot. Ownership is enforced by RLS (`owns_file`) |
| `finishUploadAction` | 147 | `files.upload` | none | RPC `finalize_file_version` (reads the real size and type from `storage.objects`) |
| `abandonUploadAction` | 159 | **none** | none | Deletes the row only while it is still `uploading`. Result ignored. Always returns success |
| `addDriveLinkAction` | 165 | `files.upload` | `driveLinkSchema` (https only) | Inserts a `link` file |
| `updateFileDetailsAction` | 196 | **none in code** | `fileDetailsSchema` | Row check (`:215`) |
| `setFileArchivedAction` | 221 | **none in code** | none | Row check (`:230`) |
| `deleteFileAction(fileId, returnTo)` | 238 | session | none | RPC `delete_file` returns the storage paths; `removeStoredFiles` is best effort (`:244-249`); optional redirect |
| `shareFileAction` | 256 | `files.upload` | `fileShareSchema` (at least one recipient; up to 100 people and 50 departments; expiry runs to 23:59:59 IST) | Bulk insert `file_shares` |
| `removeShareAction` | 285 | **none in code** | none | Row check (`:290`) |
| `addFileCommentAction` | 296 | **none in code** | `fileCommentSchema` | Insert |

### Services (`src/server/services/fileService.ts`)
`listFiles` (`:67`; shares-based sections go through `listShares`, `:34`; employee and candidate documents are excluded from Files, `:82-83`), `listLinkedFiles(link)` (`:102`, up to 50, used by every module's `LinkedFilesPanel`), `getFile` (`:126`), `loadFilePanels` (`:142`; the access log only for the owner), `listRecentlyReceived` (`:188`).

### Lib
`src/lib/files/fileTypes.ts` (type table, `maxFileBytes` 50 MB, `checkUploadable`, `previewKindOf`), `src/lib/files/uploadFromDevice.ts` (start, PUT, finish, used by chat, receipts and leave documents), `src/lib/validation/fileSchema.ts`.

### Components (`src/components/files/`)
`FileUploader.tsx`, `FileForms.tsx` (`DriveLinkForm`, `FileShareForm`, `FileDetailsForm`), `FileTables.tsx` (`FileTable`, `ShareTable`, delete), `FilePreview.tsx`, `FileSectionTabs.tsx`, `LinkedFilesPanel.tsx`, `AttachFileField.tsx`.

### Database rules
- Allowed extensions (`is_allowed_file_name`, `20261109000001_files.sql:11`) match the bucket's MIME list. 50 MB bucket limit (`:470-489`).
- `guard_file_insert` (`:271`): sets owner and department, sets status (link = ready, upload = uploading), resets size, type and archived, and checks that the linked task, project or client is visible. `guard_file_update` (`:306`): owner, kind, status, size, type, version and department are immutable unless the `app.trusted_file_update` flag is set (from `finalize_file_version`).
- `can_view_file_row` (latest `20261114000003_hr_access_private_records.sql:543`): uploading rows only for the owner; employee documents for the subject, owner or private-detail managers; candidate documents; organisation scope or owner; money-record attachments; active shares (person or department); linked task, project, client, meeting or ticket visibility; department scope by source department; files attached to chat messages the user can see.
- RLS (`20261109000001…:427-463`): update by the owner only; delete only for the owner's `uploading` rows (real deletes go through `delete_file`); shares inserted by the owner with `files.upload`, deleted by the owner or sender; access logs visible to the owner or organisation scope.
- `delete_file` (`20261113000006_file_delete.sql:9`): the owner, or `files.view` at organisation scope. Refuses files used as receipts or bills on money records. Returns the storage paths, then deletes (cascades versions, shares, comments, logs).
- Storage: `can_upload_file_object` (`:177`) allows only an unused version slot owned by the caller; `can_read_file_object` (`:191`) is `can_view_file`.

### Notifications
`file_received` from `send_task_files`. File shares notify recipients through a share trigger in the messaging/notification migrations ("They are notified straight away", `files/[fileId]/page.tsx:102`). That trigger is outside the files migration and was not re-read for this study (possible).

---

## Observations

Severity: **High** = a security or data-integrity risk, **Med** = a behaviour bug or rule violation, **Low** = an inconsistency or cleanup item. "Possible" marks items I did not verify end to end.

### CLAUDE.md rule check
- **Hardcoded role checks in TS:** none in this area. `grep` for `role ===` or role names in `src/` finds only `identity.role` in the database layer (`src/server/database/queryEngine.ts:670`, `sqlDatabase.ts:30`). Migrations do name roles when seeding data: `20261109000013_team_access.sql` (`r.name in ('Client Manager', …)`), `20261113000005_content_calendar.sql:12-13` (`'Founder', 'Client Manager'`, `lower(r.name) = 'human resource'`), `20261116000003_workload_leadership.sql:9`. These are one-off data seeds, not runtime checks. **Low**: a renamed role makes the seed miss silently on a fresh database.
- **Raw PGlite:** none in this area's services, actions or pages. All go through `createDatabaseClient()`.
- **Breadcrumbs:** none in these routes. Pages use `PageHeader` only.
- **Fake buttons:** none found. Every component action import resolves to a real server action (checked per component). The ticket guard lets requesters edit title and description, and the meetings RLS allows deletes, but no UI is offered for either, which is consistent with "leave the control out".
- **Audit:** all core tables have DB audit triggers (section 0). **Low**: `task_collaborators`, `task_dependencies`, `task_checklist_items`, `task_comments`, `meeting_participants`, `ticket_comments` and `file_comments` have no audit trigger, so adding or removing a collaborator or dependency, or changing who is invited to a meeting, is not in `audit_logs` (`20261106000005…:179-191` lists the audited task tables; `20261109000007_meetings.sql:285` audits `meetings` only).
- **`.select()` after update/delete:** followed almost everywhere. Exceptions:
  1. `abandonUploadAction` deletes without `.select()` and ignores errors; it always returns "Cancelled." (`src/server/actions/fileActions.ts:159-163`). **Low.**
  2. `addTicketCommentAction` auto-moves the ticket to `in_progress` with `.select('id')` but never checks the result (`src/server/actions/ticketActions.ts:127`). **Low.**

### Missing early permission checks in actions (RLS still enforces)
3. `setMeetingStatusAction` (`meetingActions.ts:301`) and `saveMeetingNotesAction` (`:313`) never call `getActionAccess`. **Low/Med.** Without a session the client becomes `anon` and RLS refuses, so this is defence in depth only. It breaks the documented three-layer pattern (`docs/SystemArchitecture.md:44-52`).
4. Same for `saveTicketHandlingAction` (`ticketActions.ts:61`), `changeTicketStatusAction` (`:82`), `updateFileDetailsAction` (`fileActions.ts:196`), `setFileArchivedAction` (`:221`), `removeShareAction` (`:285`) and `addFileCommentAction` (`:296`). **Low.**
5. `saveTicketCategoryAction` accepts `tickets.manage` at any scope (`ticketActions.ts:139`). The page (`settings/ticket-categories/page.tsx:17`) and RLS (`20261109000008…:395-397`) require organisation scope, so a department handler gets a database error rather than a clear message. **Low.**

### Behaviour bugs and inconsistencies
6. **Task edit gated by `tasks.create`:** `saveTaskAction` requires `tasks.create` even when editing (`taskActions.ts:61`). The edit page only requires `tasks.view` plus `canManage` (`tasks/[taskId]/edit/page.tsx:21,29`). A role with `tasks.manage` but not `tasks.create` sees the Edit button and form, then gets "You do not have permission". **Med (possible: depends on role setup).**
7. **Client 360 "Active projects" is undercounted:** it is computed from `listProjects({ clientId, page: 1 })`, which returns at most 25 projects (`clients/[clientId]/page.tsx:63,81`; `projectService.ts:8`). The Projects panel is capped the same way and has no pagination or "All" link. **Low.**
8. **New client can end up with no services:** if `set_client_services` fails after the insert, the error is only logged and the client is saved without services (`clientActions.ts:118-119`), which breaks the "at least one service" rule. **Low** (this is a race; the comment acknowledges it).
9. **Errors ignored in client service checks:** in `addClientServiceAction`, an error on the duplicate check is ignored (`clientActions.ts:217-223`, no `error` handling). The same applies to the last-service check in `deleteClientServiceAction` (`:247`). A failed read lets the delete proceed past the "at least one service" rule; RLS still applies. **Low.**
10. **Comments silently lost:** the status-change note (`taskActions.ts:152-154`), the resume note (`:184`) and the escalation comment (`:315`) are inserted without checking errors. A failed insert loses the reason while the action reports success. **Low.**
11. **Unvalidated escalation target:** `escalateTaskAction` takes `escalateToId` as a bound client argument with no `z.uuid()` (`taskActions.ts:294-308`). The DB guard limits targets to the creator or the reporting line (`20261113000008…:118-124`), so the risk is limited, but a bad id gives a raw database error. **Low.**
12. **Partial meeting save:** `saveMeetingAction` saves the meeting, then syncs participants. If the participant insert or delete fails it returns an error, but the meeting is already saved (`meetingActions.ts:65-105`). A retry from the "new" form creates a **duplicate meeting**. Errors from the `select` calls at `:78-86` are also ignored. **Med.**
13. **Cancelled content entries leave open tasks:** cancelling a content calendar entry notifies participants (`notify_meeting_change`) but nothing closes or removes the per-person tasks created by `add_category_people` (`20261113000009…:34-42`). Only `move_content_tasks` handles time changes (`:74-91`). People keep "assigned" tasks for cancelled work, and those tasks feed into workload. **Med (possible: no cancel handling found by grep).**
14. **Non-participants can edit meeting notes:** `meetings_update` RLS uses `can_view_meeting_row` (`20261109000007…:295-297`) and the guard allows non-organisers to change notes and decisions (`:125-131`). Anyone with `meetings.view` at organisation scope can therefore overwrite notes on meetings they are not part of. The UI shows the form only to involved people (`meetings/[meetingId]/page.tsx:109`). **Low (possible: may be intended).**
15. **Task due in UTC on recurrence:** `create_next_recurring_task` uses `coalesce(new.due_date, current_date)` (`20261106000004_tasks.sql:583-630`). `current_date` is the database session's date, not India's; the rest of the module uses `Asia/Kolkata`. It only matters for tasks with no due date. `due_time` and `meeting_id` are not copied to the next run. **Low.**
16. **Project fields not re-checked on update:** `projects_update` checks only `can_manage_project` (using), and `with check` is just `current_employee_id() is not null` (`20261106000003…:402-404`). There is no guard trigger for projects, so a department-scope manager may move a project to another department or set any PM; `can_create_project(department_id)` is not re-applied. Clients behave the same way (`clients_update`, `:374-376`), which the action comment calls intentional ("may hand the client to another manager", `clientActions.ts:98-99`). **Med (possible: design decision to confirm).**
17. **`delete_file` ignores document visibility:** it allows anyone with `files.view` at organisation scope to delete **any** file by id, including employee and candidate documents, whose visibility branch (`20261114000003…:555-561`) returns before the organisation-scope check (`20261113000006_file_delete.sql:17-21`). An organisation-wide file viewer who cannot see a private HR document could still delete it if they have the id. **Med (possible: needs the uuid; worth adding `can_view_file(p_file)` to the check).**
18. **Download logging is best effort:** `record_file_access` errors are ignored, so the download still goes ahead unlogged (`files/[fileId]/download/route.ts:41`). The preview component requests `?mode=view`, so each file page render logs a "view" (possible inflation of the access history). **Low.**
19. **Upload record cleanup:** abandoned `uploading` rows (browser closed mid-upload) are never cleaned up. No job or migration deletes stale `status = 'uploading'` rows (grep found only RLS and `abandonUploadAction`). Their reserved storage slots stay too. **Low.**
20. **Files pages need `files.upload`:** `/files` and `/files/[fileId]` require `files.upload` (`files/page.tsx:38`, `files/[fileId]/page.tsx:36`). Someone who receives a file but lacks `files.upload` cannot open the file page, though the download route works. It is granted to all roles by default (`20261109000004_phase3_access.sql:33`), so this is **Low (possible)** for custom roles.
21. **Meeting pages need `meetings.create`:** meeting pages and the calendar require `meetings.create` instead of a view permission (`calendar/page.tsx:23`, `meetings/[meetingId]/page.tsx:37`). An invited person in a custom role without it gets a 404 from their invitation notification. `meetings.create` is shared by all seeded roles (`20261109000009_phase4_access.sql:51`). **Low (possible).**
22. **Ticket replies do not refresh live:** `ticket_comments` is not in the `live_updates` publication (only `tickets` is, `20261109000009_phase4_access.sql:99`), and `TicketLiveRefresh` listens only to `tickets` (`TicketLiveRefresh.tsx:10`). A handler's open page does not show a requester's reply until reload, unless the status also changes. **Low.**
23. **Ticket dashboard drops some tickets:** `listTicketsToHandle` uses `.neq('requester_id', me)`, and SQL `<>` excludes rows where `requester_id` is null (a requester who was deleted, `on delete set null`). Those tickets drop off the dashboard list, unlike `listTickets`, which handles null (`ticketService.ts:49` vs `:93`). **Low.**
24. **Queue badge counts my own tickets:** the "Support queue" count (`countTicketsToHandle`, `ticketService.ts:79`) counts open unassigned tickets including the handler's own requests, while the queue list excludes them (`:49`). The badge can differ from the list length. **Low.**
25. **Ticket comment text in notifications:** the full comment body is copied into the notification and push text (`20261109000008…:291-295`). Long or sensitive replies go to devices. **Low.**
26. **Workload links depend on `tasks.view`:** Workload links to `/tasks?assignee=…`, but the tasks page applies `assignee` and `department` only when `listTaskOversightOptions` is non-null, which needs `tasks.view` wider than `own` (`tasks/page.tsx:73-77`, `taskService.ts:60-61`). A role with `workload.view` but `tasks.view = own` gets links that silently ignore the filter. **Low (possible).**
27. **Project counts disagree:** `getProjectStats` counts only `active` and `planning` as in progress or delayed (`projectService.ts:149-155`), while `getProjectHealth` reports an overdue `on_hold` project as `delayed` (`projectHealth.ts:29-31`). Dashboard counts and list badges can disagree. **Low.**
28. **Dashboard stats load whole tables:** `getTaskStats` (`taskService.ts:317-319`), `getClientStats` (`clientService.ts:168`) and `getProjectStats` (`projectService.ts:146`) select every visible row and count in JS. This is fine at the current size but grows with history, especially tasks, since completed tasks are never archived. **Low.**
29. **Workload page imports from the ticket service:** `/workload` gets department ids from `listDepartmentOptions` in `ticketService` (`workload/page.tsx:14`). The departments are matched by **name** to the workload summary (`:24`), so two departments with the same name would collide. **Low.**
30. **`get_client_labels` exposes any client name by id:** it returns the company name for any client id to any active employee (`20261106000005…:249-256`). This is documented as intended, but it allows lookup by id without any link to the work. **Low (design).**
31. **Workload weighting edge cases:** `calculateWorkload` uses `estimated_hours ?? 4` (`calculateWorkload.ts:82`), so a task with an explicit 0-hour estimate adds no load. `hoursAccuracy` sums across tasks where only some have estimates (`:98-99,117`), so tasks without an estimate push the ratio down. **Low.**
32. **Ambiguous dates on calendar import:** `readSheetDate` reads `03/04/2026` as 3 April (day first, `parseCalendarSheet.ts:52-53`). A US-formatted sheet imports on the wrong dates without warning when the day is 12 or less. **Low.**
33. **Working days not checked on the server:** due dates are counted in working days only in the browser (`TaskDurationField.tsx:31-43`). The server accepts any date, so holidays and week offs are advisory. **Low (by design).**
34. **`can_manage_task` reporting-line fallback:** after the scope checks, `can_manage_task` falls through to `is_in_reporting_line` for any non-null scope (`20261106000004_tasks.sql:209`). This is consistent with `tasks.manage` allowed scopes (`team, department, organisation`, `20261106000005…:15`), so no bug today. If `own` were ever added as an allowed scope, it would still grant reporting-line management. **Low (possible).**


# Chapter 4 — Internal messaging, presence, live updates and GIFs

Scope: `/messages` (list, new, starred, conversation), `messageService` and `messageActions`, every component in `src/components/messages/`, `src/lib/messages/*`, `messageSchema`, `gifService`, `giphyUrl`, presence (`presenceActions`, `src/lib/presence/*`, `src/components/presence/*`), browser-side live updates (`src/lib/live/*`) and the server endpoints they talk to (`src/app/api/live/**`, `src/server/live/*`), plus the chat migrations.

All paths are repo-relative. `file:line` refers to the code as read on 2026-11-17.

---

## 1. Feature list

**Kinds of conversation** (`conversation_kind` enum, `database/migrations/20261109000002_messaging.sql:5`)
- `direct`: one-to-one. One row per pair, enforced by `direct_key` = `least(a,b):greatest(a,b)` (`20261109000002_messaging.sql:15,191`).
- `group`: has a title, explicit members and admins. The creator is admin (`20261109000002_messaging.sql:223-226`).
- `department`, `project`, `client`: created by triggers when the parent row is inserted (`20261109000002_messaging.sql:325-350`). Membership comes from the organisation (department, project manager or members, client manager), not from a member list.
- `announcement`: a single company-wide channel (`20261109000002_messaging.sql:29,351`). Every active employee is a participant. Only holders of `messages.announce` can post.

**Messages can carry**
- Text up to 8,000 characters (`20261109000002_messaging.sql:53`), with @Full Name mentions detected by substring match (`20261109000002_messaging.sql:471-477`).
- A reply to another message in the same conversation (`guard_message_insert`).
- A file: document, photo, video, audio or camera photo, uploaded first through the normal files pipeline (`MessageComposer.tsx:144`, `ChatAttachMenu.tsx:54-58`).
- A Drive or other https link, stored as a `files` row of kind `link` (`messageActions.ts:117-144`).
- A contact card for a colleague (`contact_employee_id`).
- A poll with 2 to 12 options, single or multiple choice (`20261111000001_chat_status_reviewers.sql:15-24`).
- An event: a meeting is created and every participant is invited (`post_conversation_event`).
- A GIF or sticker from GIPHY (`20261116000004_chat_reactions_gifs.sql:13-22`).
- Emoji in the text are just characters, chosen with `EmojiPicker`.

**Per-message actions** (the ⌄ menu or a right-click, `MessageMenu.tsx:152-192`)
- Quick reactions (👍 ❤️ 😂 😮 😢 🙏) and a full picker. One reaction per person per message.
- Message info (your own messages only): who it was delivered to and who read it, with times.
- Reply, Copy, Forward (to up to 20 conversations; polls are not forwarded), Pin or Unpin, Star or Unstar.
- Edit (your own text messages, within 5 minutes).
- Select (several at once): star, forward or delete them together.
- Delete: for me (always) or for everyone (your own within 5 minutes, or any announcement if you hold `messages.announce`).

**Per-conversation actions** (`ChatHeaderActions.tsx`)
- Search the messages on screen.
- Pin the chat to the top of your list.
- Close chat, Clear chat (hides everything so far, for you only).
- Group info or Contact info. In a group, admins can rename it and add or remove people. Anyone can exit a group; if the last admin leaves, the longest-standing member becomes admin.

**Other features**
- Read ticks (one grey tick, two grey, two green) and a "Seen by …" line under your latest message in groups and channels.
- A typing indicator.
- Unread counts, last-message preview, pinned chats first.
- People search in the sidebar that also starts new direct chats.
- `/messages/starred`: starred messages from every conversation.
- Notifications: a mention (high priority), a new direct or group message (grouped per conversation), a new announcement (high priority) (`20261111000001_chat_status_reviewers.sql:342-379`).
- Availability as in Teams: Available, Busy, Do not disturb, Be right back, Appear away, Appear offline, or reset to automatic. Do not disturb stops push notifications (`20261113000015_fewer_calls_payment_details.sql:79-82`).

---

## 2. Route table

| Route | File | Type | Guard | Purpose |
|---|---|---|---|---|
| `/messages` | `src/app/(crm)/messages/page.tsx` | Server page | `requirePagePermission(messagesUse)` (`:11`) | Conversation list and a placeholder |
| `/messages/new` | `src/app/(crm)/messages/new/page.tsx` | Server page | `messagesUse` (`:13`) | Direct message form and new group form |
| `/messages/starred` | `src/app/(crm)/messages/starred/page.tsx` | Server page | `messagesUse` (`:15`) | Starred messages, newest star first (up to 200) |
| `/messages/[conversationId]` | `src/app/(crm)/messages/[conversationId]/page.tsx` | Server page | `messagesUse` (`:54`), `notFound()` if RLS hides the row (`:58-59`) | The conversation. `?reply=<id>` opens the composer in reply mode (`:79-80`) |
| `GET /api/live` | `src/app/api/live/route.ts` | Route handler (SSE) | Session; 404 on Supabase (`:59`) | Local live stream of changes and typing |
| `GET /api/live/config` | `src/app/api/live/config/route.ts` | Route handler | Session plus an employee row (`:19-25`) | How to listen; typing channel names on Supabase |
| `POST /api/live/typing` | `src/app/api/live/typing/route.ts` | Route handler | Session plus `can_view_conversation` (`:19-28`) | Send a typing signal |
| `/files/[fileId]/download?mode=view` | (files area) | Route handler | File access | Photos, videos and audio in chat load through here (`MessageCards.tsx:38`) |

All write operations are server actions in `src/server/actions/messageActions.ts` and `src/server/actions/presenceActions.ts`. Layout file: `src/app/(crm)/messages/MessagesLayout.module.css`, shared by the pages and `MessagesShell`.

---

## 3. Data model

### 3.1 Tables

| Table | Created in | Columns of note | RLS (for `authenticated`) | Live publication |
|---|---|---|---|---|
| `conversations` | `20261109000002:7` | `kind`, `title` (1-120 chars), `department_id`/`project_id`/`client_id` (cascade), `direct_key` unique, `created_by`, `last_message_at`. CHECK `conversations_kind_link` ties the kind to its link (`:19-24`). Partial unique indexes: one per department, project, client, and one announcement (`:26-29`) | select `can_view_conversation_row` (`:516`); update only by a group admin, and only when the kind is `group` (`:518-520`). No insert or delete policy: rows are created through functions | no |
| `conversation_members` | `20261109000002:32` | PK (conversation, employee), `is_admin`, `created_at` (used for admin succession) | select if you can view (`:522`); insert by a group admin (`:525`); delete by an admin, or yourself in a group (`:527-534`) | no |
| `conversation_reads` | `20261109000002:42` | PK (conversation, employee), `last_read_at` | select if you can view (`:536`). Written only by `mark_conversation_read` | **yes** (`20261109000004_phase3_access.sql:96`) |
| `messages` | `20261109000002:49`, extended later | `author_id` (set null), `body` ≤ 8000, `reply_to_id`, `file_id`, `edited_at`, `deleted_at`/`deleted_by`, `pinned_at`/`pinned_by`; then `contact_employee_id`, `meeting_id`, `poll_question`, `poll_options text[]`, `poll_allows_multiple` (`20261111000001:15-24`); `forwarded` (`20261111000002:44`); `gif_kind`, `gif_url` (GIPHY-only regex), `gif_title`, `gif_width`, `gif_height` (`20261116000004:13-22`). CHECK `messages_not_empty` (latest at `20261116000004:25-29`). Indexes `(conversation_id, created_at desc)`, `file_id`, pinned partial, `created_at` (`20261112000010:17`) | select if you can view (`:539`); insert if you can post (`:541`); update if you can view, with field rules in a trigger (`:544-546`). No delete policy | **yes** (`phase3_access.sql:95`) |
| `message_mentions` | `20261109000002:68` | PK (message, employee) | select through the message's conversation (`:548`) | no |
| `message_poll_votes` | `20261111000001:32` | PK (message, employee, option_index); `conversation_id` kept for live filtering; option 0-11 | select if you can view (`:382`). Written only by `vote_in_poll` | **yes** (`:385`) |
| `employee_presence` | `20261111000001:391` | `chosen_status` (null = automatic), `last_seen_at`, `last_active_at` | RLS on, every privilege revoked (`:482,547`). Reached only through functions | no |
| `message_reads` | `20261111000002:46` | PK (message, employee), `read_at` | RLS on with no policy, privileges revoked (`:54,289`). Read only through `get_message_info` | no |
| `message_stars` | `20261111000002:149` | PK (message, employee), `created_at` | `for all` on your own rows; insert also requires `can_view_message` (`:178-180`) | no |
| `message_hidden` | `20261111000002:158` | PK (message, employee) | same as stars (`:181-183`) | no |
| `message_deliveries` | `20261112000010:10` | PK (message, employee), `delivered_at` | RLS on, no policy | no |
| `conversation_pins` | `20261113000014_signatures_pins_service_items.sql:469` | PK (employee, conversation), `pinned_at` | select and delete your own; insert only for a conversation you take part in (`:479-490`) | no |
| `message_reactions` | `20261116000004:156` | PK (message, employee); `conversation_id`; `emoji` 1-16 characters, with no letters, digits, spaces or markup (`:163`) | select if you can view (`:214`). Written only by `react_to_message` | **yes** (`:217`) |

`realtime.messages` (local copy at `20261106000000_local_platform.sql:227`) has policies for topics named `conversation:{uuid}` (`20261109000002:555-573`). The current typing design uses topics named `typing-<hmac>` on public channels instead, so these policies are no longer used (see Observations).

### 3.2 Access functions (all `security definer`, `search_path = ''`)

| Function | Where | What it decides |
|---|---|---|
| `is_conversation_participant(conv, employee)` | `20261109000002:79-120` | Must be an active employee. direct or group: a member row. department: the same `department_id`. project: the project manager, the creator or a `project_members` row. client: the client manager or a member of any project of that client. announcement: everyone (the `else true` branch) |
| `can_view_conversation_row` / `can_view_conversation(uuid)` | `:123-149` | Requires `messages.use`. Participants can view, and so can people who may view the linked project or client (they "read along") |
| `can_post_in_conversation` | `:151-160` | You can view it, and it is not the announcement channel unless you hold `messages.announce` |
| `get_conversation_participant_ids` | `:162-169` | Active participants. Not callable through the API (`phase3_access.sql:89`) |
| `is_group_admin` | `:497-507` | You are an admin member of a `group` |
| `can_view_message(uuid)` | `20261111000002:165-173` | The message's conversation is viewable. Used by the star and hidden policies |

### 3.3 RPCs and what they enforce

| RPC | Latest definition | Enforces |
|---|---|---|
| `get_or_create_direct_conversation(p_other)` | `20261109000002:175-205` | Needs `messages.use`. You cannot message yourself or an inactive person. Idempotent through `direct_key` and `on conflict do nothing` |
| `create_group_conversation(p_title, p_members)` | `:207-230` | Needs `messages.use`. Adds only active employees, plus the creator as admin |
| `mark_conversation_read(p_conversation)` | `20261113000015:13-55` | Must be able to view. Inserts `message_reads` for new messages from others. Updates `conversation_reads.last_read_at` only when something new was read or it is the first visit (this stops two open tabs reloading each other). Marks matching `notifications` (link `/messages/<id>`) as read |
| `get_my_conversations()` | `20261113000014:495-558` | Participants only (not people reading along). Returns names, `other_person_id` and `other_person_name`, the last-message preview (`message_preview`), the unread count (messages from others, not deleted, after `last_read_at`) and `is_pinned`. Pinned chats first, then by `last_message_at` |
| `message_preview(message)` | `20261116000004:32-48` | "Message deleted", the body, "Poll: …", "Event: …", "Contact: …", "Sticker", "GIF" or "Sent a file" |
| `vote_in_poll(p_message, p_options[])` | `20261111000001:192-217` | Must be able to post. The poll must exist and not be deleted. Indexes must be in range. A single-choice poll takes at most one. Replaces your earlier votes; an empty list removes them |
| `post_conversation_event(conv, title, starts, ends, link)` | `:221-253` | Needs `meetings.create` and must be able to post. Creates an `internal` meeting, invites up to 200 participants, inserts the event message |
| `get_conversation_read_state(conv)` | `20261111000002:97-117` | Must be able to view. Returns `others` (participants minus you), `everyone_read_at` = the earliest `last_read_at`, and `everyone_delivered_at` = the earliest of greatest(`last_read_at`, `presence.last_seen_at`) |
| `get_message_info(p_message)` | `20261112000010:58-83` | **Author only.** For each participant: `read_at`, `delivered` (read, a delivery row, or `last_seen_at` ≥ sent) and `delivered_at` |
| `clear_conversation_for_me(conv)` | `20261111000003:8-26` | Must be able to view. Inserts every message so far into `message_hidden`. Returns the count |
| `leave_group(conv)` | `:28-56` | Must be a member of a `group`. Removes you. If no admin is left, the earliest-joined member becomes admin |
| `react_to_message(p_message, p_emoji)` | `20261116000004:171-195` | Must be able to **view** (not post), so people can react to announcements. The message must not be deleted. An empty emoji deletes your reaction; otherwise an upsert replaces it |
| `record_presence(p_active)` | `20261111000001:420-436` | Upserts `last_seen_at = now()`, and `last_active_at` when active |
| `set_my_status(p_status)` | `:439-462` | Validates the status (null resets), also marks you seen and active, and returns the status now shown |
| `get_presence(p_employees[])` | `:465-480` | Any employee can read anyone's status. At most 500 ids. Active employees only |
| `presence_status(row)` | `20261113000013:10-23` | No check-in for **6 minutes**, or Appear offline → `offline`; a chosen status → that status; active within 5 minutes → `available`; otherwise `away` |

### 3.4 Triggers on chat tables

| Trigger | Table | Function | Effect |
|---|---|---|---|
| `messages_guard_insert` (before insert) | messages | `guard_message_insert` (`20261111000001:60-107`) | Only for API callers (`auth.uid()` set). Forces `author_id = current_employee_id()`, clears edit, delete and pin fields, sets `created_at = now()`. Checks: can post; can view the attached file; the reply is in the same conversation; the contact is active; can view the meeting; poll options are trimmed, 1-120 characters and unique ignoring case. GIF fields are checked only by the CHECK constraints |
| `messages_guard_update` (before update) | messages | `guard_message_update` (latest `20261116000004:52-150`) | Immutable: conversation, author, `created_at`, reply, `edited_at`, `deleted_by`, `pinned_by`, `forwarded`. Nothing changes once deleted. **Delete** (setting `deleted_at`): the author within 5 minutes, or anyone in the announcement channel who holds `messages.announce`. It blanks the body, file, card, poll and GIF fields and the pin. Cards, polls and GIFs cannot change. **Edit body**: the author only, within 5 minutes; attachments cannot change; sets `edited_at`. **Pin**: anyone who can post; the server sets `pinned_at` and `pinned_by` |
| `messages_after_insert` | messages | `after_message_insert` (`20261109000002:464-481`) | Bumps `conversations.last_message_at`; records mentions |
| `messages_notify` | messages | `notify_message` (trigger `20261109000003_notifications.sql:263`; body `20261111000001:342-379`) | Mention → high priority. Direct or group → `message_received`, grouped by `conversation:<id>`. Announcement → high priority to every participant |
| `messages_audit` (after update) | messages | `audit_row_change` (`20261109000002:488`) | Edits, deletions **and pins** are audited. New messages are not, by design |
| `conversation_members_audit` | conversation_members | `audit_row_change` (`:490`) | Joins and leaves are audited. An `is_admin` update is not (only insert and delete fire it) |
| `messages_clear_reactions` | messages | `clear_deleted_message_reactions` (`20261116000004:198-210`) | Deleting a message for everyone removes its reactions |
| `employee_presence_record_deliveries` | employee_presence | `record_message_deliveries` (`20261113000013:26-54`) | Each check-in inserts a `message_deliveries` row for every message since the previous check-in in the person's conversations. The time is the message's own time if the app stayed open (gap ≤ 6 minutes), otherwise the check-in time. On the first check-in it looks back 7 days |
| `zz_live_broadcast` | each table in `live_updates` | `live.broadcast_change` (`src/server/database/migrationRunner.ts:73-83`) | Sends `{table, event, row: id and *_id columns}` by `pg_notify` locally (`20261106000000:203-220`) or by `realtime.send` on Supabase (`database/platform/supabase_platform.sql:99-129`) |
| `departments/projects/clients_create_conversation` | departments, projects, clients | `create_linked_conversation` (`20261109000002:325-346`) | Creates the linked channel |

---

## 4. Message lifecycle

### 4.1 Send (text, file, contact)

```text
MessageComposer.send()                             src/components/messages/MessageComposer.tsx:139-158
  ├─ attachment? uploadFromDevice(file) → fileId   (files pipeline: signed upload, then confirm)
  └─ sendMessageAction(convId, {body, replyToId, fileId})   messageActions.ts:87-114
        ├─ getActionAccess(messages.use)
        ├─ messageSchema (body ≤ 8000; body, file or contact required)   messageSchema.ts:11-21
        ├─ insert into messages   ← RLS messages_insert: can_post_in_conversation
        │     ├─ BEFORE guard_message_insert: author, created_at, file, reply and contact checks
        │     ├─ AFTER after_message_insert: last_message_at, mentions
        │     ├─ AFTER notify_message: notifications → push queue
        │     └─ AFTER zz_live_broadcast: {table:'messages', row:{id, conversation_id, author_id, …}}
        └─ revalidatePath(/messages/<id>)
```
- Enter sends; Shift+Enter adds a new line (`MessageComposer.tsx:160-165`). The send button is disabled while pending or empty (`:281`).
- Reply mode lives in the URL (`?reply=`). After a successful send the composer calls `router.replace(pathname)` (`:152`).
- A contact card is `sendMessageAction` with `body: ''` and `contactEmployeeId` (`ChatAttachMenu.tsx:145`).
- A link creates a `files` row of kind `link` first, then a message with `file_id` (`messageActions.ts:129-139`). Both are https only (`messageSchema.ts:54-58`). This needs `files.upload` (`messageActions.ts:122`).
- A file in a message gives **everyone who can view that conversation** access to it. `can_view_file` has a branch `exists messages m where m.file_id = … and not deleted and can_view_conversation(...)` (latest at `20261114000003_hr_access_private_records.sql:608`).

### 4.2 Delivered and read (ticks)

1. **Sent** (one grey tick): the row exists.
2. **Delivered** (two grey ticks): every other participant's `max(last_read_at, last_seen_at)` is at or after `created_at`. `last_seen_at` moves with each presence check-in, which comes every 2 minutes while in use and every 5 minutes when idle or in the background (`presenceStore.ts:24-25`). The per-person delivery time is kept in `message_deliveries` by the trigger.
3. **Read** (two green ticks): every other participant's `conversation_reads.last_read_at` is at or after `created_at`. This is set by `mark_conversation_read`, which **runs on each render of the conversation page** (`[conversationId]/page.tsx:62`), including every live refresh.

The tick is worked out per message in `MessageThread.tsx:156-161`, from `getReadState` (`messageService.ts:174-186`, which turns `-infinity` into null). In groups and channels, "Seen by A, B" or "Seen by N people" comes from `listReadPositions` (`[conversationId]/page.tsx:42-51`). Message info (`ChatDialogs.tsx:136-213`) calls `getMessageInfoAction` → `get_message_info` and groups people into Read by, Delivered to and Not delivered yet.

### 4.3 Edit and delete windows

- `messageChangeWindowMs = 5 min` (`messageService.ts:83`). `listMessages` adds `changeableUntil` and `isChangeableNow` (`:113-114`). The menu compares the moment it opened with `changeableUntil` (`MessageMenu.tsx:55-56,104-106`). The **database is the real check** (`v_in_time`, `20261116000004:66`).
- Edit: `editMessageAction` (`messageActions.ts:207-223`) updates `body` with `.select('id')` and checks that a row came back.
- Delete for everyone: `deleteMessagesForEveryoneAction` (`:277-295`) updates `deleted_at`, one message at a time, with a row check. The trigger blanks the content, keeps an audit row (the old body is kept in `audit_logs`), and clears reactions.
- Delete for me: `hideMessagesAction` (`:258-274`) upserts into `message_hidden`. `listMessages` excludes hidden ids (`messageService.ts:89-104`).
- Clear chat: `clear_conversation_for_me` hides every current message.
- A deleted message shows "You deleted this message" or "This message was deleted" (`MessageThread.tsx:234-238`).

### 4.4 Reactions

- `reactToMessageAction` (`messageActions.ts:73-85`) validates the uuid and `reactionSchema` (`isSingleEmoji`, `emojiList.ts:177-181`), then calls `react_to_message`.
- Picking the same emoji again sends `''`, which removes it (`MessageMenu.tsx:118-121`, `MessageReactions.tsx:35`).
- `MessageReactions` uses `useOptimistic` (`:20,37-40`). The chips group by emoji in the order reactions were made (`messageService.ts:202-211` orders by `created_at`).
- The live topic is `message_reactions` with `conversation_id`.

### 4.5 Polls

- Create: `PollForm` (`ChatAttachMenu.tsx:160-218`) → `sendPollAction` (`messageActions.ts:146-166`) → zod (2-12 options, unique, `messageSchema.ts:60-72`) → the trigger checks again.
- Vote: `PollCard.toggle` (`MessageCards.tsx:186-200`) shows the choice straight away, then calls `votePollAction` (`messageActions.ts:168-180`) → `vote_in_poll`. Voting needs `canPost` (`MessageThread.tsx:247`).
- Polls cannot be forwarded (`messageActions.ts:314`) and cannot be edited.

### 4.6 Events

- `EventForm` (`ChatAttachMenu.tsx:220-255`) is shown only with `meetings.create` (`[conversationId]/page.tsx:168`, `ChatAttachMenu.tsx:361`).
- `scheduleChatEventAction` (`messageActions.ts:183-205`) turns the date and times into India time (`indiaDateTime`) → `post_conversation_event`.
- `EventCard` (`MessageCards.tsx:127-166`) shows "Ended" or "Cancelled" and a Join link only while the meeting is scheduled and not over (`meetingIsOver`, `messageService.ts:116-118`). If the meeting row is not visible to you, it shows "An event you are not invited to."

### 4.7 Forwarding

- `forwardMessagesAction` (`messageActions.ts:299-339`): up to 100 messages to up to 20 conversations. It reads the originals with RLS, skips deleted messages and polls, and inserts copies with `forwarded: true`, one target at a time.
- It copies `file_id`, `contact_employee_id`, `meeting_id` and the GIF fields, not `reply_to_id`. Each insert passes through the guard as the forwarder, so you need view access to the file and meeting.
- The targets offered are every conversation in your list except the current one (`[conversationId]/page.tsx:152-154`).

### 4.8 GIFs and stickers

```text
GifPicker (debounced 450 ms, GifPicker.tsx:18,31-46)
  └─ searchGifsAction(kind, q)           messageActions.ts:35-45  (messages.use, gifSearchSchema ≤ 50 chars)
        └─ searchGiphy                   gifService.ts:22-46
              GET api.giphy.com/v1/{gifs|stickers}/{search|trending}?rating=g&limit=24
              fetch cache: next.revalidate 600 s; 6 s timeout
              keeps fixed_width (webp first) only if isGiphyMediaUrl and size > 0
  └─ tap → sendGifMessageAction          messageActions.ts:47-70 (gifMessageSchema → insert)
DB: gif_url CHECK '^https://(media[0-9]*|i)\.giphy\.com/…'  20261116000004:15-18
Render: GifCard <img src=giphy referrerPolicy=no-referrer>   MessageCards.tsx:67-85
```
- The GIF button is shown only when `GIPHY_API_KEY` is set (`isGifSearchOn`, `gifService.ts:12-14`, passed from `[conversationId]/page.tsx:169`). This keeps to the no-fake-buttons rule.
- A sticker on its own is drawn without a bubble (`MessageThread.tsx:149`). Replies and pins name a GIF or sticker with `gifKindLabels` (`giphyUrl.ts:18`, `[conversationId]/page.tsx:75-76`).

### 4.9 Pinning and starring

- **Pin a message**: anyone who can post (`MessageMenu.tsx:175-181`, guard `20261116000004:140-146`). Up to 5 most recent pins show in the pinned bar (`messageService.ts:146-159`).
- **Pin a chat**: per person, through `conversation_pins` (`messageActions.ts:456-475`).
- **Star**: per person (`messageActions.ts:242-255`). The selection bar stars messages one by one in a loop (`ChatSelection.tsx:89`).

---

## 5. Presence: states and timing

| Rule | Value | Source |
|---|---|---|
| Statuses | available, busy, do_not_disturb, be_right_back, away ("Appear away"), offline ("Appear offline") | `src/lib/presence/presenceStatus.ts:2-24` |
| Offline when no check-in for | **6 minutes** | `20261113000013:17` |
| Away when untouched for | 5 minutes (database: `last_active_at`; browser: `idleAfterMs`) | `20261113000013:20`, `presenceStore.ts:27` |
| Check-in while in use | every **2 minutes** | `presenceStore.ts:24` |
| Check-in when idle or in the background | every **5 minutes** | `presenceStore.ts:25` |
| Stop checking in after | 30 minutes untouched or hidden | `presenceStore.ts:29` |
| Status dots refreshed | together with check-ins (2 or 5 minutes), only while the tab is visible | `presenceStore.ts:147-156` |
| Shared across tabs | `BroadcastChannel('crm-presence')` and `localStorage['crm.presence']`, keyed by employee | `presenceStore.ts:57-58,84-134` |
| A failed pulse | tried again after about 1 minute | `presenceStore.ts:208-213` |

**How it flows**
- `AppShell` mounts `<PresenceHeartbeat employeeId>` (`src/components/layout/AppShell.tsx:37`), which calls `startCheckingIn()` (`PresenceHeartbeat.tsx:10-13`, `presenceStore.ts:250-262`). That listens for `pointerdown`, `keydown`, `wheel` and `touchstart` to track activity.
- Every `<PresenceDot employeeId>` calls `usePresence()` (`presenceStore.ts:296-303`), which counts how many dots watch each id and asks for a pulse 60 ms after a new id appears.
- A single `presencePulseAction(active, ids)` (`presenceActions.ts:33-55`) runs `record_presence` (when checking in) and `get_presence(ids)`.
- `StatusMenu` in the top bar (`src/components/layout/AppTopbar.tsx:64`) → `setMyStatusAction` (`presenceActions.ts:11-23`) → `set_my_status`, then `setPresenceLocally` updates the dot at once in every tab (`presenceStore.ts:283-294`).
- Presence has **no live push**: `employee_presence` is not in `live_updates`. Others see a change at their next pulse.

**Where dots appear**: the conversation list (direct chats), the conversation header (`withLabel`), message avatars in groups, contact cards, group and contact info, people search, the top bar, the employee table, and the task page.

---

## 6. Component tree of the conversation page

```text
(crm)/layout.tsx  ── AppShell (seedLiveConfig, PresenceHeartbeat, AppTopbar → StatusMenu, NotificationBell[useLiveRefresh notifications])
└─ messages/[conversationId]/page.tsx                    (server; 9 queries in parallel after markConversationRead)
   └─ MessagesShell (server)                               getCurrentAccess + listEmployeeOptions (cached)
      ├─ aside: ConversationSearch (client)
      │    ├─ ButtonLink "New message", ButtonLink ★ starred
      │    ├─ ConversationList (rendered in a client tree) → PresenceDot per direct chat
      │    └─ "Start a chat" people → openDirectChatAction
      └─ section.main
         ├─ header.mainHeader
         │   ├─ Link "‹ All conversations"
         │   ├─ ChatTitleButton (client; sends window event 'crm:open-chat-info') → h1
         │   ├─ subtitle: kind label · PresenceDot(withLabel) · members · Open project
         │   └─ ChatHeaderActions (client)
         │        ├─ Search toggle → ChatSearch (DOM search over [data-search-text])
         │        ├─ ⋮ menu: Group/Contact info · Search · Pin chat · Close · Clear · Exit group
         │        ├─ ChatDialog "Group info" (rename, PersonRow ×n with remove, add people, exit)
         │        ├─ ChatDialog "Clear this chat?"
         │        └─ ChatDialog "Exit this group?"
         ├─ div.pinnedBar (up to 5 pins → #message-<id>)
         ├─ div.scroll#message-scroll
         │   ├─ ScrollToLatest (client)
         │   └─ MessageThread (server component that renders client children)
         │        └─ ChatSelectionProvider (client; selection toolbar + Forward/Delete dialogs)
         │             └─ ol > li per message
         │                  ├─ day divider
         │                  ├─ SelectBox (while selecting)
         │                  ├─ avatar + PresenceDot (groups, others' messages)
         │                  ├─ bubble
         │                  │   ├─ MessageMenu (client: reactions row, items, React/Info/Forward/Delete dialogs, inline editor)
         │                  │   ├─ author name · Forwarded · Pinned · ReplyPreview
         │                  │   ├─ PollCard | EventCard | ContactCard | MessageAttachment | GifCard
         │                  │   ├─ body text
         │                  │   ├─ meta: ★ · Edited · time · Ticks
         │                  │   └─ "Seen by …" (latest own message, not in direct chats)
         │                  └─ MessageReactions (client, optimistic)
         └─ MessageComposer (client; live subscription + typing)
              ├─ panel: EmojiPicker | GifPicker
              ├─ typing line (aria-live)
              ├─ reply chip / attachment chip
              ├─ ChatAttachMenu (+ menu; hidden file inputs; Link/Contact/Poll/Event/Camera dialogs)
              └─ form: emoji · GIF (if key) · textarea · send
```

Data loaded per render (`[conversationId]/page.tsx:54-73`): `requirePagePermission`, `getConversation` (one embedded select plus `can_post_in_conversation`, and possibly `clientLabelFor`), `markConversationRead`, then in parallel `listMyConversations`, `listMessages` (two extra queries for hidden and starred), `listPinnedMessages`, `listReadPositions`, `getReadState`, `listPollVotes`, `listMessageReactions`, `listEmployeeOptions`. The `(crm)` layout adds `requireAccess`, `getNotificationSummary`, `listMyRoles` and `getLiveConfig`. Roughly **15-18 database round trips per render or refresh**.

---

## 7. Client-side live update flow

### 7.1 Server side, briefly

- **Local (PGlite)**: the trigger calls `pg_notify('live_changes', …)`. `startBackgroundServices` runs `db.listen('live_changes')` → `publishChange` into an in-process hub on `globalThis` (`src/server/database/backgroundServices.ts:90-96`, `src/server/live/liveEvents.ts`). Each open `/api/live` stream filters by subscription (table plus optional column = value, at most 20, `route.ts:11-29,87-93`), then `canSee` re-checks with RLS. A row with `id` is selected as the user; a row with only `conversation_id` goes through `can_view_conversation`; a DELETE is always passed on (`route.ts:32-51`). A ping is sent every 25 s (`:107-113`).
- **Supabase**: the trigger calls `realtime.send` on one public channel, `changes-<live_topic secret[0:32]>` (`supabase_platform.sql:110-123`). The browser gets the topic, URL and publishable key from `getLiveConfig` (`src/server/live/liveConfigService.ts:13-37`), which the `(crm)` layout builds on every page render (`src/app/(crm)/layout.tsx:18`). Typing topics are `typing-<HMAC(signing secret, "typing:<id>")[0:32]>`, given only after `can_view_conversation` (`src/server/live/realtimeChannels.ts:25-28`, `liveConfigService.ts:26-32`).

### 7.2 Browser module `src/lib/live/liveUpdates.ts`

- **The registry**: a module-level `Set<Entry>` (`:18-26`). Each entry is `{topics, typingConversationId?, onReady?, onChange?, onTyping?}`. `subscribeLive` adds an entry and schedules a reconnect in 50 ms (`:277-289`).
- **Choosing a mode**: `seedLiveConfig` from `AppShell` (`AppShell.tsx:25`) stores the mode (`:45-49`). Stream mode is remembered for good (`knownToBeStream`). A chat on Supabase still calls `/api/live/config?typing=<id>`, because typing topics are per conversation (`:51-64`). If the config request fails, it tries again after 10 s (`:259-267`).
- **Stream mode** (`connectStream`, `:77-105`): it closes and reopens **one** `EventSource('/api/live?topics=[…]&typing=…')` whenever the set of entries changes. The `ready` event fires `onReady` only after a reconnect, not on the first open (`:85-91`). `change` events are passed to entries **by table only** (`:94-96`).
- **Realtime mode** (`startRealtime`, `:162-209`): it lazy-imports `@supabase/realtime-js`, opens one public channel for changes and matches with `changeMatches` (table, column, value; `liveConfig.ts:25-30`). On re-subscribe after a drop it calls `onReady` for everyone, unless the drop was shorter than 30 s while the page was visible (`:131,192-206`). Typing channels are added and removed by `syncTypingChannels` (`:211-232`).
- **Sending a typing signal**: `sendTyping` broadcasts straight to the Supabase channel when connected, with `{conversationId, name, userId}` from the config (`:291-302`). Otherwise it POSTs to `/api/live/typing`, which looks the name up in the database and checks access (`typing/route.ts:18-33`).
- **Batching refreshes** (`:316-359`): one module-level timer. `requestPageRefresh(refresh, delayMs, minGapMs)` merges changes that arrive close together into one `router.refresh()`. List pages use `minGapMs = listRefreshGapMs = 10 s` (`:323`). While the tab is hidden it only marks the page stale and refreshes 100 ms after it becomes visible.
- **The hook**: `useLiveRefresh(topics, {delayMs, minGapMs, refreshOnConnect})` (`:363-379`), used by `NotificationBell` (delay 300 ms, no refresh on connect), `TaskLiveRefresh`, `TicketLiveRefresh` and `FinanceLiveRefresh`.

### 7.3 How the chat subscribes

`MessageComposer.tsx:58-90` calls `subscribeLive` directly, not `useLiveRefresh`, because it also needs typing signals:
- topics: `messages`, `conversation_reads`, `message_poll_votes` and `message_reactions`, each filtered by `conversation_id = <this conversation>`;
- `typingConversationId = conversationId`;
- `onReady` and `onChange` → `requestPageRefresh(router.refresh, 200)`, with no minimum gap;
- `onTyping` → adds the name, which disappears after 4 s (`:32,75-83`). Your own signals are dropped by `userId` on the server or channel, and by `name === myName` in the browser (`:76`).
- Outgoing typing signals are throttled to one every 2 s (`:132-137`).

**What one new message triggers** (stream or realtime):

```text
A sends → messages INSERT → live event to every open viewer of the conversation (and to B's bell, via the notification)
  B's page: router.refresh (200 ms) → page render → mark_conversation_read → conversation_reads UPDATE + notifications UPDATE
     → live events → A's page refresh (ticks turn green) and B's own bell and composer refresh again
```

The conversation list (sidebar and `/messages`) has **no subscription of its own**. It updates only when some other subscription refreshes the page: the bell for direct and group messages, or the composer for the open chat.

---

## 8. Per-file notes

### Pages
- `src/app/(crm)/messages/page.tsx:10-19`: the list only. No live subscription of its own.
- `src/app/(crm)/messages/new/page.tsx:12-35`: two panels. The group form sends `memberIds[]`.
- `src/app/(crm)/messages/starred/page.tsx:14-62`: the label falls back through body, file, poll, meeting, contact and GIF. The conversation title comes from `listMyConversations`, so a conversation you only read along in shows as "Conversation".
- `src/app/(crm)/messages/[conversationId]/page.tsx`: `seenLabel` (`:42-51`) uses **every** `conversation_reads` row, including people who read along and people who left a group. `canModerate` applies to announcements only (`:81-82`). The pinned bar links to `#message-<id>` anchors (`:133-141`).
- `src/app/(crm)/messages/MessagesLayout.module.css`: the shared layout. `data-has-conversation` switches the phone layout to one pane.

### Server
- `src/server/services/messageService.ts`: all reads go through `createDatabaseClient()` (RLS). `listMessages` loads the **latest 60 only** (`:7,98-103`), with no paging. `listStarredMessages` takes up to 200 stars and skips deleted messages (`:123-142`). `markConversationRead` ignores errors (`:215-218`). `findLinkedConversationId` is used by the project page.
- `src/server/actions/messageActions.ts`: most actions start with `getActionAccess(messages.use)`. The exceptions are `editMessageAction` (`:207`), `deleteMessageAction` (`:225`, which nothing calls) and `setMessagePinnedAction` (`:436`); RLS still requires `messages.use` through `can_view_conversation`. Updates and deletes use `.select()` with a row check except `setMessageStarredAction` (`:247-250`, no length check) and `setConversationPinnedAction` (`:463-471`). `leaveGroupAction`, `openDirectChatAction`, `startDirectConversationAction` and `createGroupConversationAction` end in `redirect()`.
- `src/server/actions/presenceActions.ts`: `presencePulseAction` returns `{}` on any problem and ignores the `record_presence` result (`:40`).
- `src/server/services/gifService.ts`: the key stays on the server. Searches are rated `g`, 24 results, cached for 10 minutes by Next's fetch cache (`:26,33`).
- `src/server/live/*`: see section 7.1.

### Library
- `src/lib/messages/conversationTitle.ts:14-38`: display names ("<Dept> team", "Project: …", "Client: …") and kind labels.
- `src/lib/messages/giphyUrl.ts:4-14`: host check `media\d*|i.giphy.com`, https, no port or user, ≤ 1000 characters, no quotes or angle brackets.
- `src/lib/messages/emojiList.ts`: `quickReactions` (`:10`), categories, `searchEmoji` (prefix match on keywords, `:163`), `isSingleEmoji` (`:177-181`).
- `src/lib/validation/messageSchema.ts`: zod schemas for message, GIF, GIF search, reaction, edit, group, link, poll and event.
- `src/lib/presence/presenceStatus.ts`, `presenceStore.ts`: section 5.
- `src/lib/live/liveConfig.ts`, `liveUpdates.ts`: section 7.

### Components (`src/components/messages/`)
- `MessagesShell.tsx:18-46`: a server component. It fetches access and people itself, so pages need not.
- `ConversationSearch.tsx:29-98`: matches names in the browser, ignoring accents (`normalise`). Colleagues you have no direct chat with are listed (up to 20) and open a chat when tapped.
- `ConversationList.tsx:19-63`: icon by kind, preview `author: body`, pin icon, time, unread badge.
- `NewConversationForms.tsx`: `DirectMessageForm` and `GroupConversationForm` with `useActionState`. Line 33 uses an inline `style`.
- `MessageThread.tsx`: WhatsApp layout. `nameColour` hashes the id to one of 8 colours (`:34-41`). `metaWidth` keeps room for the time and ticks (`:45-47`). Selectable messages exclude deleted ones (`:132-139`). Search only sees `body` (`:175`).
- `MessageCards.tsx`: `MessageAttachment` (link, image, video or audio through `/files/<id>/download?mode=view`, `:20-62`), `GifCard`, `ContactCard` (Message, Email, Call), `EventCard`, `PollCard` (optimistic vote, `:177-237`).
- `MessageMenu.tsx`: a right-click opens the menu at the pointer unless text is selected (`:64-80`). It closes on scroll or resize (`:94-95`). The inline editor is at `:125-150`. Small toasts disappear on `onAnimationEnd` (`:256-260`).
- `ChatDialogs.tsx`: a shared `<dialog>` wrapper (`ChatDialog`, `:35-55`), `ForwardForm`, `DeleteForm` (Delete for everyone only when allowed, `:99-133`), `MessageInfo` (`:136-213`).
- `ChatSelection.tsx`: a context provider holding the selection. The toolbar has star (sequential loop), forward and delete.
- `ChatHeaderActions.tsx`: `ChatSearch` marks matches in the DOM (`:52-119`). Group info has rename, remove, add and exit. Opening a member's chat runs `openDirectChatAction` (`:316-323`).
- `ChatTitleButton.tsx`: sends a window event that `ChatHeaderActions` listens for (`:6,12`; listener at `ChatHeaderActions.tsx:172-181`).
- `ChatAttachMenu.tsx`: eight choices in WhatsApp's order (`:43-52`). Link and Event are hidden without permission (`:361`). On a desktop the camera uses `getUserMedia`; on a phone it uses `<input capture>` (`:347-357`, `:258-317`).
- `MessageComposer.tsx`: section 7.3. When `!canPost` it shows a read-only note (`:174-176`).
- `EmojiPicker.tsx`: recently used emoji are kept in `localStorage['crm-recent-emoji']`, inside try/catch (`:8-29`).
- `GifPicker.tsx`: GIF and Sticker tabs. A request counter drops answers to older searches (`:28,32,39`). A tap sends straight away.
- `MessageReactions.tsx`: grouped chips with an optimistic toggle.
- `ScrollToLatest.tsx`: scrolls to the bottom or to the `#hash` target when `messageCount` changes. It stays at the bottom when the container resizes, for example when a phone keyboard opens (`:11-42`).
- Every component that has its own styles has a matching `*.module.css`. `ChatTitleButton` borrows `ChatHeaderActions.module.css`. `ConversationSearch` and `MessagesShell` use `MessagesLayout.module.css`.

### Presence components
- `PresenceHeartbeat.tsx` (11 lines), `PresenceDot.tsx` (renders nothing until the status is known; `data-status` sets the colour), `StatusMenu.tsx` (six choices plus Reset; a note says desktop notifications are paused under Do not disturb).

### Tests that touch this area (not read in detail)
`tests/chatReactionsGifs.test.ts`, `tests/chatStatusRules.test.ts`, `tests/chatActionsRules.test.ts`.

---

## 9. Observations

Severity is a rough guide: **H** high, **M** medium, **L** low. "Possible" means it was inferred from the code and not reproduced.

### Bugs and correctness

1. **M · New messages may not scroll into view in longer chats.** `ScrollToLatest` re-runs only when `messageCount` changes (`src/components/messages/ScrollToLatest.tsx:22`), but `listMessages` always returns at most 60 (`messageService.ts:7,103`). Once a conversation has 60 or more messages, a new message keeps the count at 60, so the effect does not run. The `ResizeObserver` watches the container's own box, not its contents (`:35-36`), so it does not help. Likely bug.
2. **M · Only the latest 60 messages can be reached.** There is no "load older" (`messageService.ts:98-103`). Pinned-bar links (`[conversationId]/page.tsx:136`), starred links (`starred/page.tsx:40`), reply previews (`MessageThread.tsx:96`) and in-chat search (`ChatHeaderActions.tsx:69`) silently do nothing for older messages.
3. **L · Delete for me can fail falsely.** If every chosen message is already in `message_hidden`, the upsert becomes `on conflict do nothing` (both columns are the primary key; `src/server/database/queryEngine.ts:557-560`) and returns no rows. The action then reports "You do not have permission to do this." (`messageActions.ts:270`). Possible.
4. **L · Batch actions are not atomic.** `deleteMessagesForEveryoneAction` loops and stops at the first refused row, leaving earlier ones deleted (`messageActions.ts:283-291`). The 5-minute flag in the selection bar can be stale (`MessageThread.tsx:138`), which makes this more likely. `forwardMessagesAction` can deliver to some targets and then fail (`:317-335`). The selection star loop ignores errors (`ChatSelection.tsx:89`).
5. **L · "Seen by" and the ticks disagree.** `seenLabel` counts every `conversation_reads` row (`[conversationId]/page.tsx:46`, `messageService.ts:161-171`): people reading along in a project or client channel and people who have left a group. The ticks count only current participants (`get_conversation_read_state`). Possible.
6. **L · Announcement read ticks may never turn green.** Every active employee is a participant (`20261109000002_messaging.sql:117`), including people without `messages.use` who cannot open the channel, so `everyone_read_at` never catches up. `notify_message` also notifies them (`20261111000001:370-374`). Possible.
7. **L · Starred view shows hidden messages.** `listStarredMessages` does not exclude `message_hidden` rows (`messageService.ts:133-137`).
8. **L · `isSingleEmoji` accepts several emoji.** `isSingleEmoji` (`emojiList.ts:177-181`) and the database CHECK (`20261116000004:163`) only limit length and character classes, so "👍👍👍" is accepted as one reaction.
9. **L · Uploads can be left behind.** In `MessageComposer.send`, if `sendMessageAction` fails after `uploadFromDevice` succeeded, the uploaded file remains with no message (`MessageComposer.tsx:144-146`). Possible.
10. **L · The client clock decides what the menu offers.** `changeableUntil` uses the server's `created_at`, but the menu compares it with the browser's `Date.now()` (`MessageMenu.tsx:104-106`). With a skewed clock, Edit can show and then fail, or be hidden while still allowed. The database stays the real check.

### Security and privacy

11. **M · Sending a file widens who can see it.** `can_view_file` allows anyone who can view a conversation containing the file (`20261114000003_hr_access_private_records.sql:608`). Anyone who can view a sensitive file can send or forward it to a large channel and expose it there; only Delete for everyone takes it back. This looks intended, but it is a strong grant path worth stating to the owner.
12. **M · The Supabase change channel leaks activity metadata.** It is one public channel, given to every signed-in employee, and the topic is never rotated (`realtimeChannels.ts:16-23`; no other use of `live_topic`). Its payload has every `*_id` column (`supabase_platform.sql:115-118`), so a listener sees `author_id` and `conversation_id` for every message, including other people's direct messages, plus reaction `employee_id` and so on. Someone who left the company and kept the topic and the publishable key could go on listening. Possible.
13. **L · Typing signals can be forged on Supabase.** Typing channels are public (`liveUpdates.ts:139,221`), and the browser builds the payload itself (`:296-300`). Any member who knows the topic can send any `name` and `userId`.
14. **L · Unused realtime policies.** The `conversation:{id}` policies on `realtime.messages` (`20261109000002_messaging.sql:555-573`) are no longer used by the current typing design.
15. **L · People without `messages.use` can be put in chats.** `get_or_create_direct_conversation` and `create_group_conversation` do not check that the *other* people hold `messages.use` (`20261109000002:187,223-226`). Such a person gets message notifications but cannot open the chat.
16. **L · Deleted text stays in the audit log.** A deletion keeps the original body in `audit_logs` through `messages_audit` (`20261109000002:486-489`). This is intended, but "deleted for everyone" is not erased. Worth telling users.

### Performance

17. **M · Refreshes multiply in busy chats.** Each message → every open viewer runs `router.refresh` (200 ms, no minimum gap, `MessageComposer.tsx:61`) → each render runs `mark_conversation_read` (`[conversationId]/page.tsx:62`), which writes `conversation_reads` and `notifications` → more live events → the sender, other viewers and each person's bell refresh again (`NotificationBell.tsx:38`). With about 15-18 queries per render (section 6), a busy group causes about 2N full renders for each message. Migration `20261113000015` stopped the endless back-and-forth but not this fan-out. Possible.
18. **M · Hidden and starred lists grow without limit.** `listMessages` loads **every** hidden and starred id across all conversations and puts the hidden ones into a `not in (...)` filter (`messageService.ts:89-104`). After a few "Clear chat" actions in busy channels, that list can hold thousands of ids on every render.
19. **M · The local live stream checks every change with a query.** Each change, for each open stream that wants it, runs one transaction with an RLS query (`api/live/route.ts:32-51,94`), and PGlite has a single connection. Each `connectStream` also reopens the EventSource whenever the set of entries changes (`liveUpdates.ts:77-84`).
20. **L · `get_my_conversations` works on every conversation on every render.** For each department, project, client, group and direct conversation it runs plpgsql `is_conversation_participant`, a count and a lateral last-message query (`20261113000014:520-556`). It is called on every conversation page render and refresh (`[conversationId]/page.tsx:65`).
21. **L · Each check-in scans messages.** `record_message_deliveries` scans messages since the previous check-in and calls `is_conversation_participant` per row (`20261113000013:42-51`). The first check-in looks back 7 days.

### Inconsistencies

22. **M · The docs and migrations give different presence timings.** The docs say a check-in "about once a minute", offline after "three minutes" and dots "refreshed every 30 seconds" (`docs/SystemArchitecture.md:141`). Migration `20261113000013:3-7` says 1 minute in front and 4 minutes in the background. The code uses 2 minutes and 5 minutes (`presenceStore.ts:24-25`), with offline at 6 minutes. A background check-in due at 5 min + 5 s can be delayed by Chrome's timer throttling for hidden tabs, so people may briefly show as offline. Possible.
23. **L · The two live modes filter differently.** Stream mode passes events to entries by table only (`liveUpdates.ts:95`), while realtime mode also matches column and value (`:185`, `liveConfig.ts:25-30`). In stream mode, one component's filtered subscription can refresh another component that watches the same table with a different filter.
24. **L · Delivered ticks are not live.** `employee_presence` is not in `live_updates`, so double grey ticks appear only at the sender's next refresh.
25. **L · The chat list has no live updates.** The sidebar and `/messages` have no live subscription for department, project, client or announcement messages, which create no `message_received` notification (`20261111000001:360-375`). Unread counts there go stale until something else refreshes the page.
26. **L · Dead code.** `deleteMessageAction` is never called (`messageActions.ts:225-238`).
27. **L · Permission checks are uneven.** `editMessageAction`, `deleteMessageAction` and `setMessagePinnedAction` skip `getActionAccess` and uuid validation (`messageActions.ts:207,225,436`). `votePollAction` and `setMessageStarredAction` do not validate `messageId` as a uuid (`:168,242`). RLS still protects all of them.
28. **L · Inline style.** `NewConversationForms.tsx:33` uses an inline `style={{ marginTop }}` instead of a CSS module class.

### CLAUDE.md rules

- **"Every important action writes to `audit_logs`"**
  - Not audited: group creation and **renaming** (`conversations` has no audit trigger; `messageActions.ts:364-380`), and admin promotion in `leave_group` (an `is_admin` update; the members trigger fires only on insert and delete, `20261109000002:490`, `20261111000003:45-54`).
  - Also not audited: Clear chat, poll votes, reactions, chat pins and presence. These are arguably not "important".
  - Audited: member add and remove, message edit, delete and **pin** (pins add noise to the audit log, since every pin is an update).
- **"Always add `.select()` and check a row came back"**: kept for every update that RLS could refuse (edit, delete, delete for everyone, pin, rename, add and remove member, hide). `setMessageStarredAction` (`messageActions.ts:247-250`) and `setConversationPinnedAction` (`:463-471`) do not check the count; the only effect is a false "success" for an unstar or unpin that was already done. The hide check is too strict (item 3).
- **"No fake buttons"**: no breach found. GIF is hidden without `GIPHY_API_KEY`, Link without `files.upload`, Event without `meetings.create`, and Reply and Pin without `canPost`. Message info is offered only on your own messages (`MessageMenu.tsx:153`), which matches the author-only RPC.
- **"Never hardcode a role check"**: kept. Checks use `permissionKeys.messagesUse`, `messagesAnnounce`, `filesUpload` and `meetingsCreate`.
- **"Code must work on both databases"**: kept. Raw SQL in the live routes goes through `runAs` and `SqlDatabase`. Supabase-only paths are behind `databaseProvider()`.
- **Out of scope, noticed in passing**: `20261113000015_fewer_calls_payment_details.sql:114-120` hard-codes the company's bank account and UPI ID in a migration, so they ship with the repository.


# Chapter 5 — People and HR

Scope: employees (work, personal and private records), departments, designations, hierarchy, attendance and leave, payroll, recruitment and onboarding, letters, exits and settlements, employee reimbursements, HR dashboard and reports, HR settings, and the print pages for these.

All paths are relative to the repository root (`E:\CRM 2.0`). `file:line` references point at the code as read for this study. Migration file names are shortened to their timestamp plus name, for example `…0006_attendance_leave.sql` means `database/migrations/20261111000006_attendance_leave.sql`.

---

## 0. How the HR area is put together

### 0.1 Layering

Each HR sub-module follows the same three layers as the rest of the app (`docs/SystemArchitecture.md:44-52`):

| Layer | HR examples | Role |
| --- | --- | --- |
| Page (`src/app/(crm)/…`, `src/app/(print)/…`) | `requirePagePermission(permissionKeys.payrollManage)`, `requireAccess()` then a manual check | Hides pages, returns `notFound()` when the user lacks the permission |
| Server action (`src/server/actions/*Actions.ts`) | `getActionAccess(permissionKeys.exitsManage)`, Zod parse, then one query or RPC | Refuses early with a friendly message, validates the form |
| Database (migrations) | RLS policies, `guard_*` triggers, `security definer` RPCs such as `calculate_payroll_line`, `decide_resignation` | The real enforcement. All business arithmetic for payroll, leave balances and settlements lives here |

Two consequences matter for the whole area:

1. **Calculations live in SQL.** Leave days, balances, carry-forward, payroll lines, statutory deductions, settlement suggestions and run totals are all PL/pgSQL. The only TypeScript calculations are the attendance report (`src/lib/attendance/summariseAttendance.ts`), the HR report summaries (`src/lib/hr/hrReports.ts`) and letter merging (`src/lib/letters/renderLetter.ts`).
2. **Workflows are RPCs, not table updates.** Payroll runs (`start_payroll_run`, `recalculate_payroll_run`, `submit_payroll_run`, `decide_payroll_run`, `mark_payroll_paid`), resignations (`decide_resignation`, `process_exits`), settlements (`mark_settlement_paid`), interviews (`schedule_interview`, `record_interview_outcome`), candidate conversion (`complete_candidate_conversion`) and reimbursements (`decide_reimbursement`, `pay_reimbursement`) are all functions. Tables such as `payroll_runs`, `payroll_lines`, `interviews`, `exit_tasks` and `onboarding_tasks` have **select-only** grants for `authenticated` (for example `…0002_payroll.sql:978-979`, `…0003_recruitment.sql:638,641`, `…0004_exit_management.sql:679`).

"Trusted step" flags are used so the RPCs can pass the guard triggers that block direct edits: `app.trusted_employee_update`, `app.trusted_attendance`, `app.trusted_resignation`, `app.trusted_settlement`, `app.trusted_candidate`, `app.trusted_reimbursement`, each set with `set_config(…, true)` (transaction-local).

### 0.2 Permission keys used by HR

Defined in `src/lib/access/permissionKeys.ts:4-65`, rows inserted by migrations.

| Key | Allowed scopes | Defined in | Purpose |
| --- | --- | --- | --- |
| `employees.view` | own, team, department, organisation | `…20261106000002_organisation_starting_data.sql:6` | Directory and profiles |
| `employees.create` / `employees.update` / `employees.assign_role` / `employees.deactivate` | various | organisation starting data | Add, edit, assign roles, activate/deactivate |
| `employees.private_view` | organisation | `…0005_employee_record.sql:19-21` | Aadhaar, PAN, bank details, employee documents |
| `organisation.view` | organisation | starting data `:12` | Hierarchy chart |
| `departments.manage`, `designations.manage` | organisation | starting data `:14-15` | Org set-up |
| `leave.request` | own | `…20261109000009_phase4_access.sql:4` | Ask for leave |
| `leave.approve` | team, department, organisation | `phase4_access.sql:5` | Decide leave |
| `attendance.view` | own…organisation | `phase4_access.sql:6` | Attendance pages and reports |
| `attendance.manage` | department, organisation | `phase4_access.sql:7` | Correct and import attendance |
| `hr.manage` | organisation | `phase4_access.sql:8` | HR settings (working hours, holidays, leave types, employment types) |
| `hr.dashboard` | organisation | `…0004_hr_finance_foundation.sql:29` | HR dashboard and reports |
| `payroll.manage` | organisation | `…0002_payroll.sql:19-20` | Prepare payroll, structures, rules, appraisals |
| `payroll.approve` | organisation | `…0002_payroll.sql:21-22` | Approve and pay payroll, pay settlements |
| `payslips.view` | own | `…0002_payroll.sql:23` | Own payslips |
| `recruitment.manage` | organisation | `…0003_recruitment.sql:18-20` | Openings, candidates, interviews, letters, onboarding |
| `exits.manage` | organisation | `…0004_exit_management.sql:19-20` | Resignations, exit checklist, settlements |
| `resignation.submit` | own | `…0004_exit_management.sql:21` | Resign |
| `reimbursements.submit` / `.approve` / `.pay` | own / team..org / org | `…0009_salaries_reimbursements.sql:19-24` | Claims |

Two role-level flags were added in `…20261114000003_hr_access_private_records.sql:22-24`: `roles.private_records` (record visible only to self and other private-record roles) and `roles.tracks_attendance` (off for the Founder). They are edited in Settings > Roles (`src/server/actions/organisationActions.ts:144-149`).

### 0.3 Key helper SQL functions

| Function | Where (latest) | What it decides |
| --- | --- | --- |
| `has_permission(key)` / `permission_scope_for(key)` | foundation; `…0004_hr_finance_foundation.sql:174-182` | Permission of the **acting** role (`current_role_id()`, `:160-172`) |
| `can_access_employee(key, target)` | organisation foundation / team access | Scope reach over a person |
| `employees_with_permission(key, scope)` | `…0004_hr_finance_foundation.sql:87-102` | Who to notify (HR, Finance) |
| `can_manage_private_details()` | `…0005_employee_record.sql:37-42` | `employees.private_view` at organisation |
| `employee_has_private_record(p)` / `can_see_employee_record(p)` / `get_hidden_employee_ids()` | `…0003_hr_access_private_records.sql:43-77` | Private-record roles (Founder, Co-Founder) |
| `role_within_own_access(role)` / `role_is_assignable(role)` | `…0003_hr_access_private_records.sql:85-113` | Who may manage people of a role |
| `employee_tracks_attendance(p)` | `…0003_hr_access_private_records.sql:266-273` | Attendance on/off per role |
| `count_working_days(from,to)` | `…0006_leave_and_attendance.sql:115-126` | Working weekdays minus holidays |
| `india_today()` | `…0006_leave_and_attendance.sql:107-112` | Today in Asia/Kolkata |

---

## 1. People: employees, departments, designations, hierarchy

### 1.1 Purpose

The staff directory and the full employee record: work details on `employees`, personal details on `employee_personal_details`, identity and bank details on `employee_private_details` (Aadhaar and account numbers encrypted by the app), employee documents (files with `employee_id`), employment history (read from `audit_logs`), plus departments, designations and the reporting-line chart.

### 1.2 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/people/employees` | `src/app/(crm)/people/employees/page.tsx` | `employees.view` (`:36`); "Add" shown with `employees.create` (`:51`) | Paged directory with search, department, role, account filters (`listEmployees`) |
| `/people/employees/export` | `src/app/(crm)/people/employees/export/route.ts` | `employees.view` (`:12` of file) | CSV of the same people and filters, work details only |
| `/people/employees/new` | `src/app/(crm)/people/employees/new/page.tsx` | `employees.create`; role picker only with `employees.assign_role` (`:17-18`) | `EmployeeCreateForm` → `createEmployeeAction` |
| `/people/employees/[employeeId]` | `src/app/(crm)/people/employees/[employeeId]/page.tsx` | `employees.view` + `canViewEmployeeProfile` (`:44-50`) | Tabs: overview, personal, private, documents, history (`:53-61`); account actions, Print, Edit (`:67-91`); letters for recruiters/exits (`:95-98`) |
| `/people/employees/[employeeId]/edit` | `…/[employeeId]/edit/page.tsx` | `employees.update` (`:30`) + `getEmployeeControls().canEdit` | Work details, role, extra roles, login email |
| `/people/employees/[employeeId]/personal/edit` | `…/personal/edit/page.tsx` | `requireAccess()` (`:18`) then `getEmployeeRecordAccess().canEditPersonal` | Personal details form |
| `/people/employees/[employeeId]/private/edit` | `…/private/edit/page.tsx` | `employees.private_view` (`:20`) | ID and bank form |
| `/people/employees/[employeeId]/print` | `src/app/(print)/people/employees/[employeeId]/print/page.tsx` | `employees.view` + `canViewEmployeeProfile` (`:23-25` in file) | Printable profile including personal and private sections the viewer may see |
| `/people/departments`, `/people/departments/[departmentId]` | `src/app/(crm)/people/departments/…` | `departments.manage` (`page.tsx:18`, `[departmentId]/page.tsx:19`) | List, add, edit, delete departments |
| `/people/designations`, `/people/designations/[designationId]` | `src/app/(crm)/people/designations/…` | `designations.manage` | Same for designations |
| `/people/hierarchy` | `src/app/(crm)/people/hierarchy/page.tsx` | `organisation.view` (`:15`) | Org chart from `listHierarchyPeople()` via `buildOrganisationTree` |

### 1.3 Services — `src/server/services/employeeService.ts`

- `directoryIds` (`:32-38`): organisation scope sees all; otherwise calls RPC `get_directory_employee_ids`.
- `hiddenIds` (`:42-47`): RPC `get_hidden_employee_ids` (private-record people hidden from non-private viewers).
- `canViewEmployeeProfile` (`:49-58`): `can_see_employee_record` AND (`organisation` or `can_view_employee_profile`).
- `employeeQuery` / `listEmployees` / `listEmployeesForExport` (`:60-95`): builds the PostgREST query; search on name, email, code via `cleanSearchTerm`; export capped at 5000 rows (`:92`).
- `listManagerOptions` (`:142-151`): team scope limits choices to `get_my_team_ids` plus self.
- `getEmployeeRecordAccess` (`:198-222`): mirrors DB rules. `isHr` = `employees.private_view` at organisation **and** `can_see_employee_record` (`:209`). Personal: visible if `can_see_personal_details`; DOB/gender editable only by HR or manager (`:215`). Private: self (read) or HR (read/write) (`:217-218`). Documents: self or HR; upload also needs `files.upload` (`:219-220`).
- `getPrivateDetails` (`:242-251`): selects `aadhaar_last4, pan, bank_name, account_last4, ifsc, account_holder`. Comment says only last-4 digits leave the function, but **`pan` is selected in full** (see Observations).
- `getEncryptedDetail` (`:256-265`): reads the ciphertext with the user's own RLS.
- `getEmployeeControls` (`:299-330`): six RPC checks (`can_access_employee` for update, assign_role, deactivate, create; `role_is_assignable`; `can_see_employee_record`) to decide `canEdit`, `canChangeEmail`, `canTransfer` (organisation update scope), `canChangeRole`, `canChangeAccount`, `canCreateSignInLink`.

`src/server/services/employeeCreation.ts:24-62` — `createEmployeeWithLogin`: checks duplicate work email, creates the `app_auth` login (`createAuthUser`), inserts the `employees` row with `.select('id').single()`, removes the login if the insert fails (`:55-58`), then queues the invitation (`sendInvitation`, `:60`). Used by Add employee and by candidate conversion.

`src/server/services/organisationService.ts`: `listDepartments` (`:4-18`), `getDepartment`, `listDesignations` (`:33-44`), `listRoles`, `listAssignableRoles` (`:71-85`, via RPC `get_assignable_role_ids`), `getRoleWithPermissions` (`:87-98`, includes `private_records`, `tracks_attendance`), `listPermissions`.

### 1.4 Actions — `src/server/actions/employeeActions.ts`

| Action | Lines | Guard | Validation | Write | Row check | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| `createEmployeeAction` | 42-91 | `employees.create` | `createEmployeeSchema`; role only if `employees.assign_role` else default role (`:64`) | pre-checks `role_is_assignable` and `can_create_employee` (`:68-84`), then `createEmployeeWithLogin` | `.single()` | `employees_audit` trigger (insert) |
| `updateEmployeeAction` | 93-171 | `getEmployeeControls().canEdit` | `updateEmployeeSchema`; department only if `canTransfer` (`:113`); role only if `canChangeRole` | `employees.update(...).select('id')` (`:127-147`); login email via RPC `change_employee_login_email` (`:150-156`); extra roles via `set_employee_extra_roles` (`:159-167`) | yes (`:147`) | `employees_audit`; email change writes its own audit row (`…0003_hr_access_private_records.sql:199-202`) |
| `switchMyRoleAction` | 175-186 | signed in | `z.uuid()` | RPC `switch_my_role` | RPC raises | `employees_audit` on `acting_role_id` |
| `setEmployeeAccountActiveAction` | 188-226 | `employees.deactivate` | — | `employees.update({is_active}).select('id')`, then **admin** `setAuthUserBlocked` (`:212-223`) only if a row came back (`:208`) | yes | `employees_audit` |
| `createSignInLinkAction` | 233-250 | `employees.create` + `canCreateSignInLink` | — | `sendInvitation` or `sendPasswordReset` with the app DB | n/a | (auth module) |
| `savePersonalDetailsAction` | 252-300 | `canEditPersonal` | `personalDetailsSchema`; DOB/gender only if `canEditPersonalFully` | upsert `employee_personal_details` `.select()` | yes (`:294`) | `audit_employee_detail_change` (field names only) |
| `savePrivateDetailsAction` | 305-363 | `employees.private_view` | `privateDetailsSchema` (`src/lib/validation/employeeSchema.ts:109-135`): Aadhaar 12 digits, PAN `[A-Z]{5}\d{4}[A-Z]`, account 6-18 digits, IFSC | encrypts Aadhaar/account with `encryptField`, stores last 4 (`:337-350`); empty box keeps the saved number; "clear" ticks null both | yes (`:359`) | field-name audit |
| `revealPrivateDetailAction` | 370-417 | signed in, not blocked | re-enter own password (`confirmOwnPassword`), rate limited via `reveal:{userId}` key (`:385-396`) | RPC `record_private_detail_reveal` (audit row) **before** reading; PAN returned from `getPrivateDetails`, others decrypted (`:402-416`) | RPC raises | explicit `revealed` audit row |
| `removeEmployeeDocumentAction` | 420-437 | signed in | — | `files.update({is_archived:true}).select('id')` | yes | files audit (file module) |
| `updateMyProfileAction` | 439-459 | signed in | `updateMyProfileSchema` | `employees.update({phone, skills})` | **no `.select()`** (`:450-455`) | `employees_audit` |

`src/server/actions/organisationActions.ts`:

| Action | Lines | Guard | Row check |
| --- | --- | --- | --- |
| `saveDepartmentAction` | 30-56 | `departments.manage` | **none** — `update(row).eq('id')` / `insert(row)` without `.select()` (`:48-50`) |
| `deleteDepartmentAction` | 58-72 | `departments.manage` | none; `isStillInUse` mapped to "still has employees" |
| `saveDesignationAction` | 74-98 | `designations.manage` | **none** (`:90-92`) |
| `deleteDesignationAction` | 100-114 | `designations.manage` | none |
| `saveRoleAction` / `deleteRoleAction` | 129-186 | `roles.manage` | update has `.select()`; delete checks `count` |

Departments and designations are audited by `departments_audit`/`designations_audit` (`…20261106000001_organisation_foundation.sql:618-621`).

### 1.5 Database rules for the employee record

**Employment record** (`…0005_employee_record.sql`):

- `employment_types` table (`:48-62`), seeded Full-time, Part-time, Contract, Intern.
- `employees` gains `employment_type_id`, `probation_months` (0-24), generated `probation_end_date = joining_date + probation_months` (`:68-75`) and `confirmation_date`.
- `company_settings.default_probation_months` (`:65-66`), used to prefill the edit form.

**`guard_employee_update`** (latest in `…0004_exit_management.sql:127-220`):

- Bypassed for system work and for the `app.trusted_employee_update` flag (`:137`).
- Never changeable through a plain update: `auth_user_id`, `employee_code`, `work_email`, `invite_accepted_at` (`:150-155`). Login email goes through `change_employee_login_email`.
- Work fields need `v_can_manage` = `can_access_employee('employees.update')` + `role_is_assignable(old.role_id)` + (not self, or organisation scope) (`:146-148`, `:157-170`).
- Phone, avatar, skills: self or manager (`:172-179`).
- Department transfer needs organisation scope (`:181-185`); team scope must keep the manager within the team (`:187-192`).
- Role change: never your own; needs `employees.assign_role` reach and both old and new roles assignable (`:194-204`).
- `is_active`: never your own; needs `employees.deactivate` reach (`:206-216`).

**Personal details** (`…0005_employee_record.sql:178-247`):
- Visibility `can_see_personal_details` (latest `…0003_hr_access_private_records.sql:210-221`): self, HR (`can_manage_private_details`), or anyone with `employees.update` reach — and always subject to `can_see_employee_record`.
- `guard_employee_personal_details` (`:206-243`): non-HR self may change contact fields but not DOB/gender.

**Private details** (`…0005_employee_record.sql:254-290`):
- Columns `aadhaar_encrypted` (`^v1:`), `aadhaar_last4`, `pan` (plain text, regex-checked), `bank_name`, `account_number_encrypted`, `account_last4`, `ifsc`, `account_holder`; pair constraints keep ciphertext and last-4 in step (`:268-269`).
- RLS (latest `…0003_hr_access_private_records.sql:223-233`): select by self or HR who can see the record; insert/update only HR.
- `record_private_detail_reveal` (latest `…20261116000001_hiring_by_hr_pan_reveal.sql:15-40`): allows `aadhaar`, `account_number`, `pan`; writes an `audit_logs` row with action `revealed`.
- `audit_employee_detail_change` (`…0005_employee_record.sql:321-362`) logs **field names only**, never values.

**Encryption** — `src/server/security/fieldEncryption.ts:1-46`: AES-256-GCM, 12-byte random nonce, stored as `v1:` + base64(nonce|tag|ciphertext); key `FIELD_ENCRYPTION_KEY` (32 bytes base64). `isEncryptionReady()` gates saving and revealing (`employeeActions.ts:326-328`, `:377-379`).

**Private-record roles** (`…0003_hr_access_private_records.sql`):
- `can_see_employee_record` (`:60-69`): own record, anyone not private, or a viewer acting in a private-record role.
- `role_is_assignable` (`:102-113`): either the viewer holds every permission of the role, or the viewer has `employees.update` at organisation and the role is not private. This is what lets HR manage everyone except leadership.
- `set_employee_extra_roles` (`:117-157`): second roles; a role given to oneself must be within one's own access (`:142`).
- `change_employee_login_email` (`:162-204`): updates `app_auth.users.email`, unlinks Google identities (`:190-193`), updates `employees.work_email` through the trusted flag, writes its own audit row.

**Employment history** — `get_employment_history` (latest `…0002_payroll.sql:844-878`): reads `audit_logs` changes for selected employee fields, plus `salary_revisions` (only for the person or `payroll.manage`).

**Notifications**: `notify_employee_added` (`…20261113000003_hr_reports_notifications.sql:10-35`) tells everyone with `hr.dashboard` at organisation and the new person's manager (`employee_added`).

### 1.6 Hierarchy and multi-role

- `buildOrganisationTree` (`src/lib/organisation/buildOrganisationTree.ts:11-31`): people whose manager is missing (inactive) become roots, so nobody is hidden.
- Second role and switching: `employee_extra_roles` (`…0004_hr_finance_foundation.sql:12-17`), `employees.acting_role_id` (`:22`), `current_role_id()` (`:160-172`), `switch_my_role` (`:221-243`). Every permission check uses the **acting** role.

---

## 2. Attendance

### 2.1 Purpose

Daily check-in/out with work mode (office/WFH), breaks, HR corrections (single and bulk), CSV import and an API for external systems such as Pagerbook, a monthly report with lateness, early departures, worked hours and overtime, and a morning "no check-out" reminder.

### 2.2 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/attendance` | `src/app/(crm)/attendance/page.tsx` | `attendance.view` (`:27`) | Own month table and `AttendanceTodayPanel` (check in/out, break). If the role does not track attendance, redirects viewers with wider scope to the report (`:33-43`) |
| `/attendance/report` | `src/app/(crm)/attendance/report/page.tsx` | `attendance.view` (`:77`); correction and import tools when `attendance.manage` (`:97`) | Month report, views summary / grid / late / early / employee; `notFound()` when the RPC returns null (`:87-88`) |
| `POST /api/integrations/attendance` | `src/app/api/integrations/attendance/route.ts` | Shared key `x-integration-key` = `ATTENDANCE_IMPORT_SECRET`, timing-safe compare (`:20-28`) | Zod body `{rows:[{employee,date,check_in,check_out}]}` max 5000 (`:11-18`); calls `import_attendance` with the **admin** client (`:40-41`) |

### 2.3 Services — `src/server/services/hrService.ts`

- `getCompanySettings` (`:44-57`): `unstable_cache` for 5 minutes with tag `company-settings`, read with `createAdminDatabaseClient()` because cached work cannot read cookies. Cleared by `updateTag` in `saveWorkingHoursAction` (`hrActions.ts:288`).
- `tracksAttendance` (`:238-243`), `getTodayAttendance` (`:245-266`, sums finished breaks, returns open break start), `getAttendanceReportData` (`:270-275`, RPC), `listAttendanceRecords` (`:277-288`).

### 2.4 Actions — `src/server/actions/hrActions.ts`

| Action | Lines | Guard | Effect |
| --- | --- | --- | --- |
| `checkInAction(workMode)` | 99-106 | none in app; RPC uses the session | `attendance_check_in(p_work_mode)` |
| `checkOutAction` | 108-115 | — | `attendance_check_out()` |
| `startBreakAction` / `endBreakAction` | 117-133 | — | `attendance_start_break` / `attendance_end_break` |
| `correctAttendanceAction` | 139-180 | `attendance.manage` | `attendanceCorrectionSchema`; upserts **all** fields for `(employee_id, work_date)` with `.select('id')` row check (`:159-176`) |
| `correctAttendanceForManyAction` | 182-223 | `attendance.manage` | `bulkAttendanceCorrectionSchema` (`src/lib/validation/hrSchema.ts:136-145`); RPC `correct_attendance_bulk`; reports changed / skipped |
| `importAttendanceAction` | 225-253 | `attendance.manage` | CSV ≤ 2 MB, `parseAttendanceCsv`, RPC `import_attendance`; first three row errors shown |

### 2.5 Database rules

Tables: `attendance_records` (`…0006_leave_and_attendance.sql:87-101`, unique `(employee_id, work_date)`, `source` web/manual/import), extended with `work_mode`, `status_override` (`…0006_attendance_leave.sql:16-22`); `attendance_breaks` (`:28-39`).

| Function | Lines | Rule |
| --- | --- | --- |
| `attendance_check_in(p_work_mode)` | `…0006_attendance_leave.sql:44-68` | Server clock only; refuses a second check-in; sets trusted flag; upserts today's row |
| `attendance_check_out()` | `:71-92` | Only after check-in and once; closes any open break |
| `attendance_start_break()` | `:94-116` | Locks the row (`for update`), refuses a second open break |
| `attendance_end_break()` | `:118-134` | Closes the open break |
| `guard_attendance_change` | `…0006_leave_and_attendance.sql:443-466` | Skipped for system, nested triggers and trusted flag; otherwise **no one corrects their own attendance**, `employee_id` immutable, sets `source='manual'` and `updated_by` |
| `guard_attendance_person` | `…0003_hr_access_private_records.sql:277-296` | No insert for people whose role does not track attendance; nobody edits a hidden private record |
| `import_attendance(p_rows)` | `…0006_leave_and_attendance.sql:471-538` | System (no `auth.uid()`) skips scope; else `attendance.manage` + per-row `can_access_employee`. Max 5000 rows. Employee matched by work email or code (active only). `HH:MM` read as Asia/Kolkata. **Never overwrites a manual correction** (`:525-527`). Per-row errors collected |
| `correct_attendance_bulk(...)` | `…20261114000002_bulk_attendance_correction.sql:12-193` | ≤ 500 people, ≤ 31 days, reason required (`:48-83`). Skips week offs, holidays (`:117-122`) and approved leave (`:124-130`). Only fields filled in change (`:137-155`); `'auto'` clears an override. One summary audit row (`:171-189`) |
| `get_attendance_report_data(from,to)` | latest `…0003_hr_access_private_records.sql:300-346` | `attendance.view`, range ≤ 62 days; settings, holidays, employees, records with break minutes, approved leave — limited to `can_access_employee('attendance.view')`, tracked roles and visible records |
| `send_attendance_irregularities()` | `…20261113000003_hr_reports_notifications.sql:38-70` | Cron `15 3 * * *` (08:45 IST): each person with a check-in and no check-out yesterday, plus one summary to `attendance.manage` organisation holders. Dedupe keys `no-checkout:*` |

RLS (`…0006_leave_and_attendance.sql:635-641`): select via `attendance.view` reach; insert/update via `attendance.manage` reach. Breaks are select-only (`…0006_attendance_leave.sql:443-444`).

### 2.6 Day status and report arithmetic — `src/lib/attendance/summariseAttendance.ts`

`describeDay` (`:121-167`) decides one day:

1. Holiday → `holiday`; not a working weekday → `week_off`.
2. Checked in → `half_day` if on approved half-day leave **or** `half_day_minutes` is set and worked minutes are below it; else `present` (`:145-147`).
3. No check-in, on approved leave → `leave`.
4. Otherwise `absent` for past days, `upcoming` for today and later (`:149`).
5. An HR `status_override` always wins (`:151-155`).

Other figures:
- Worked minutes = check-out − check-in − finished breaks (`:137`).
- Late: check-in clock > start + grace, measured from the start time (`:160`).
- Early: check-out clock before `work_end` (`:161`).
- Overtime: worked minutes above `overtime_after_minutes`, only when HR set it (`:164`).

`summariseAttendance` (`:169-228`) totals per person: working days, present (half days count as present, `:216-219`), half days, leave days (0.5 for half-day leave), absent, WFH, late, early, worked/break/overtime minutes.

`parseAttendanceCsv` (`:238-264`): header must name `employee` and `date`; comma split, no quoted fields.

Company working pattern (`company_settings`, `…0006_leave_and_attendance.sql:9-20`): `work_start` 09:30, `work_end` 18:30, `late_grace_minutes` 15, `working_days` ISO `{1..5}`; later `overtime_after_minutes`, `half_day_minutes` (empty until HR sets, `…0006_attendance_leave.sql:24-26`).

---

## 3. Leave and holidays

### 3.1 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/leave` | `src/app/(crm)/leave/page.tsx` | `leave.request` (`:25`) | Balances (`getLeaveBalances`), own requests (`listMyLeave`), `LeaveRequestForm`, cancel (`cancelLeaveAction`) |
| `/hr/leave` | `src/app/(crm)/hr/leave/page.tsx` | `leave.approve` **at organisation**, else `notFound()` (`:55-56`) | Every request with search, status, type, department, date filters and sorts (`listLeaveRequests`); decide inline |
| `/hr/leave/utilisation` | `src/app/(crm)/hr/leave/utilisation/page.tsx` | `hr.manage` (`:42`) | Per-person/type usage for a year (`get_leave_utilisation`), "Carry forward" button |
| `/hr/holidays`, `/hr/holidays/new`, `/hr/holidays/[holidayId]/edit` | `src/app/(crm)/hr/holidays/…` | `hr.manage` | Month calendar, add/edit/remove holidays |
| `/approvals` | (outside this area) | — | Generic approvals page that also lists leave via `listLeaveAwaitingDecision` (`hrService.ts:218-228`) |

### 3.2 Actions — `src/server/actions/hrActions.ts`

| Action | Lines | Guard | Notes |
| --- | --- | --- | --- |
| `requestLeaveAction` | 31-62 | `leave.request` | `leaveRequestSchema`; `endDate` defaults to start; insert (the guard sets employee, status, days, approver) |
| `decideLeaveAction(id, decision, note)` | 64-81 | **no app-level permission check**; relies on `guard_leave_update` | update status + note with `.select('id')` |
| `cancelLeaveAction` | 83-96 | DB only | update to `cancelled` `.select('id')` |
| `saveHolidayAction` | 294-321 | `hr.manage` | insert/update `.select('id')`; unique date |
| `removeHolidayAction` | 323-331 | **DB only** | delete `.select('id')` |
| `saveLeaveTypeAction` | 374-414 | `hr.manage` | allowance, paid, attachment, active, carry-forward cap/expiry, encashable |
| `deleteLeaveTypeAction` | 418-429 | `hr.manage` | blocked by `isStillInUse` when used |
| `carryForwardLeaveAction(year)` | 361-372 | `hr.manage` | RPC `carry_forward_leave` |

### 3.3 Business rules (SQL)

**Leave types** (`…0006_leave_and_attendance.sql:33-51`): seeded Casual 12, Sick 6, Earned 15, Unpaid (no limit, unpaid). Extra columns `carry_forward_cap`, `carry_forward_expiry_months`, `is_encashable` (`…0006_attendance_leave.sql:194-199`).

**Requests** (`…0006_leave_and_attendance.sql:55-79`): constraints end ≥ start, half day only on one date, **start and end in the same calendar year** (`:76`).

**`guard_leave_insert`** (latest `…0006_attendance_leave.sql:233-298`):
1. Employee forced to the session's employee; needs `leave.request` (`:243-248`).
2. Status forced to `pending`; `approver_id` = reporting manager (informational only since HR approval, see below).
3. Type must be active; attachment required if the type says so, and must be a file the person owns (`:256-266`).
4. `days` = 0.5 for half day, else `count_working_days(start, end)` (weekday in `working_days` and not a holiday). Zero days refused (`:268-274`).
5. No overlap with the person's pending or approved leave (`:276-283`).
6. Balance: `taken (pending + approved, by start-date year) + days ≤ yearly_allowance + leave_carried_in(…)` (`:285-294`).

**Balance formula** — `get_leave_balances` (`…0006_attendance_leave.sql:304-340`):

```text
remaining = yearly_allowance + carried_in(on = today clamped to the year) − (approved + pending days in the year)
```

Unlimited types return `null`. Visible for self, people within `leave.approve` reach, or `hr.manage` organisation (`:318-321`).

**Carry forward** — `leave_carried_in` (`:215-230`) and `carry_forward_leave` (`:345-391`):
- Days carried = `least(cap, greatest(allowance + carried_in − approved, 0))` for active people and active capped types (`:359-374`). Pending leave does not count as used here.
- Expiry: `1 Jan next year + expiry_months − 1 day`; after expiry only the carried days already booked by the expiry date still count (`:219-227`).
- Idempotent upsert; deletes carry rows that became zero. Only for past years (`:355-357`).
- Cron `carry-forward-leave` at `30 0 1 1 *` for the previous year (`:393-394`).

**Decisions** — `guard_leave_update` (`…0006_leave_and_attendance.sql:310-351`):
- Only `status`, `decision_note`, `decided_by`, `decided_at` may change (`:322-326`).
- pending → approved/rejected: `can_decide_leave_row`, which since `…0004_hr_finance_foundation.sql:105-117` means **`leave.approve` reach only** (reporting managers no longer decide; nobody decides their own).
- pending → cancelled: the requester.
- approved → cancelled: requester before start date, or `hr.manage` organisation.
- `decided_by` / `decided_at` stamped.

**Visibility** — `can_view_leave_row` (`…0006_leave_and_attendance.sql:162-169`): own, deciders, `hr.manage` organisation. `get_team_leave` (latest `…20261114000008_leave_visibility_task_notices.sql:10-41`): approved leave of people below in the reporting line, people in a department the viewer heads, people within `leave.approve`, or everyone for HR; reasons are never returned.

**Utilisation** — `get_leave_utilisation` (`…0006_attendance_leave.sql:397-430`): every active person × active type; requires `hr.manage`.

**Notifications** — `notify_leave_events` (latest `…0004_hr_finance_foundation.sql:120-153`): new request → every `leave.approve` organisation holder (`leave_requested`, link `/approvals`); decision → the employee (`leave_decided`, rejected is `high`); approved-then-cancelled → HR and the employee. `approval_history` gets leave decisions via `record_status_approval` (`…0009_salaries_reimbursements.sql:174-199`).

**Audit**: `holidays_audit`, `leave_types_audit`, `leave_requests_audit` (insert/update), `leave_carry_forwards_audit` (`…0006_leave_and_attendance.sql:596-601`, `…0006_attendance_leave.sql:436-437`).

---

## 4. Payroll

### 4.1 Purpose

Monthly payroll: HR (`payroll.manage`) sets components, statutory rules and salary structures, prepares a run (draft), edits variable pay per payslip, submits for review; Finance (`payroll.approve`) approves or sends back, then marks paid (which files the salary expense in the ledger). Employees see their own payslips once the run is paid. Appraisals are recorded here too.

### 4.2 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/hr/payroll` | `src/app/(crm)/hr/payroll/page.tsx` | `requireAccess` + manage or approve (`:23-36`) | Runs list (status, year), setup problems (`getPayrollSetupProblems`), "Start run" (`startPayrollRunAction`) |
| `/hr/payroll/[runId]` | `…/[runId]/page.tsx` | manage or approve (`:43-46`) | Run summary, paged lines with search, warnings-only, sort; recalculate, submit, discard |
| `/hr/payroll/[runId]/lines/[lineId]` | `…/lines/[lineId]/page.tsx` | `payroll.manage` (`:21`) | `PayrollLineForm` (incentive, bonus, overtime amount, other earnings/deductions, LOP adjustment, notes) + `PayslipBreakdown` |
| `/hr/payroll/[runId]/review` | `…/review/page.tsx` | `payroll.approve` (`:18`) | Approve or send back (`decidePayrollRunAction`) |
| `/hr/payroll/[runId]/pay` | `…/pay/page.tsx` | `payroll.approve` (`:18`) | Mark paid with account, date, method, reference |
| `/hr/payroll/[runId]/export` | `…/export/route.ts` | manage or approve (`:9-12`) | CSV per payslip, formula-safe cells (`csvCell`) |
| `/hr/payroll/structures` | `…/structures/page.tsx` | `payroll.manage` (`:31`) | Active people with the structure in force today; "missing only" filter (`listCurrentStructures`) |
| `/hr/payroll/structures/[employeeId]` (+ `/new`) | `…/structures/[employeeId]/…` | `payroll.manage` | History of structures with monthly/annual CTC (`get_salary_structure_costs`), revisions, appraisals; add or delete a structure |
| `/hr/payroll/appraisals` (+ `new`, `[id]/edit`) | `…/appraisals/…` | `payroll.manage` | Appraisal list and form (rating 1-5 in halves) |
| `/payslips` | `src/app/(crm)/payslips/page.tsx` | `payslips.view` (`:25`) | Own paid payslips (`listMyPayslips`) |
| `/payslips/[lineId]/print` | `src/app/(print)/payslips/[lineId]/print/page.tsx` | `requireAccess`; RLS decides | `PayslipPrint` |
| `/settings/hr/payroll` | `src/app/(crm)/settings/hr/payroll/page.tsx` | `payroll.manage` (`:39`) | Components, rules, default PT state, "absence is loss of pay" switch |
| `/settings/hr/payroll/components/new`, `/[componentId]/edit` | `…/components/…` | `payroll.manage` | Component form |
| `/settings/hr/payroll/rules/new`, `/[ruleId]/edit` | `…/rules/…` | `payroll.manage` | PF / ESI / PT / TDS rule form |

### 4.3 Services — `src/server/services/payrollService.ts`

- `listPayrollRuns` (`:19-32`), `getPayrollRun` (`:34-39`).
- `listPayrollLines` (`:56-67`): loads all lines (≤ 5000, `:71`) and filters/sorts/pages in memory.
- `getPayrollLine` (`:77-86`): line with its run; RLS shows people only their own paid line.
- `listMyPayslips` (`:91-101`): `run.status = 'paid'` via inner join.
- `getPayrollSetupProblems` (`:146-164`): warns when PF, ESI, TDS rules or the PT state/slabs are missing.
- `listCurrentStructures` (`:174-198`), `getEmployeeSalary` (`:200-215`), `listAppraisals` (`:221-240`), `getPayrollCostTrend` (`:250-259`).

### 4.4 Actions — `src/server/actions/payrollActions.ts`

| Action | Lines | Guard | Call |
| --- | --- | --- | --- |
| `startPayrollRunAction` | 33-44 | `payroll.manage` | `start_payroll_run(month-01)` then redirect to the run |
| `recalculatePayrollRunAction` / `submitPayrollRunAction` | 46-61 | `payroll.manage` | `recalculate_payroll_run` / `submit_payroll_run` |
| `discardPayrollRunAction` | 63-70 | `payroll.manage` | `discard_payroll_run` |
| `savePayrollLineAction` | 72-101 | `payroll.manage` | `save_payroll_line`; LOP adjustment −31…31 in halves (`src/lib/validation/payrollSchema.ts:152`) |
| `decidePayrollRunAction` | 103-118 | `payroll.approve` | `decide_payroll_run` |
| `markPayrollPaidAction` | 120-144 | `payroll.approve` | `mark_payroll_paid(…, p_account)` |
| `addSalaryStructureAction` | 150-193 | `payroll.manage` | insert `salary_structures` `.select('id')` |
| `deleteSalaryStructureAction` | 195-206 | `payroll.manage` | delete `.select('id')`; `isStillInUse` when on a run |
| `saveAppraisalAction` | 208-238 | `payroll.manage` | insert/update `.select('id')` |
| `saveSalaryComponentAction` | 244-279 | `payroll.manage` | fixed amount or percentage of basic/gross |
| `savePayrollRuleAction` / `deletePayrollRuleAction` | 281-327 | `payroll.manage` | PT slabs parsed by `parsePtSlabs` |
| `savePayrollSettingsAction` | 329-348 | `payroll.manage` | updates `company_settings` (but see Observations: RLS requires `hr.manage`) |

### 4.5 Tables

| Table | Lines (`…0002_payroll.sql`) | Notes |
| --- | --- | --- |
| `salary_components` | 55-73 | earning/deduction; fixed `amount` or `percentage` of basic/gross; taxable flag |
| `payroll_rules` | 82-101 | kind pf/esi/pt/tds, `effective_from`, rates, `wage_limit`, PT `slabs` jsonb per `state`; unique per kind/state/date |
| `salary_structures` | 121-142 | monthly basic, HRA, other, special, incentive, bonus; generated `gross`; `pf_applies`, `esi_applies`, `pt_state`, optional fixed `tds_monthly`; insert/delete only (no update grant, `:975`) |
| `salary_revisions` | 144-156 | written by `record_salary_revision` (`:186-206`) with % change |
| `appraisals` | 158-171 | reviewer stamped on insert (`:213-226`) |
| `payroll_runs` | 332-353 | unique month; status draft → in_review → approved → paid; totals |
| `payroll_lines` | 355-397 | one per person per run; all computed fields plus HR inputs and `warnings text[]` |

Company settings added: `default_pt_state`, `payroll_absence_lop` default true (`:49-53`).

### 4.6 Run workflow (SQL)

| Step | Function | Lines | Rules |
| --- | --- | --- | --- |
| Start | `start_payroll_run(p_month)` | `…0002_payroll.sql:673-690` | `payroll.manage`; one run per month; inserts the run then recalculates |
| (Re)calculate | `recalculate_payroll_run(p_run)` | `:634-671` | draft only; adds every **active** person who has a structure effective by month end, joined by month end and not past their last day (`:653-664`), copying the structure's incentive and bonus to the line; then `calculate_payroll_line` for every line and `refresh_payroll_run_totals` |
| Edit a line | `save_payroll_line(...)` | `:693-718` | draft only; sets HR inputs then recalculates that line and totals |
| Submit | `submit_payroll_run(p_run)` | `:727-753` | recalculates, refuses empty runs and any negative net pay, sets `in_review`, notifies every `payroll.approve` organisation holder (`payroll_review`, high) |
| Decide | `decide_payroll_run(p_run, approve, note)` | `:756-784` | `payroll.approve`; only `in_review`; send-back needs a note; approved → `approved`, sent back → `draft`; notifies preparer (`payroll_decided`). Same person may prepare and approve (comment `:768-769`) |
| Pay | `mark_payroll_paid(p_run, paid_on, method, reference, account)` | latest `…20261112000005_finance_ledger.sql:319-352` | only `approved`; date not in the future; records `record_system_expense('payroll', run, 'salaries', total_net, …)`; notifies every line's employee (`salary_paid`) and the preparer |
| Discard | `discard_payroll_run(p_run)` | `…0002_payroll.sql:817-828` | drafts only |

`refresh_payroll_run_totals` (`:602-619`): count, gross, deductions, net, employer cost = gross + employer PF + employer ESI.

### 4.7 Payslip computation — `calculate_payroll_line` (latest `…0003_hr_access_private_records.sql:349-540`)

1. **Structure**: latest structure with `effective_from ≤ month end` (`:399-401`). None → line zeroed with warning "No salary structure" (`:403-408`).
2. **Payable days** (calendar): `v_from = max(month start, joining date)`, `v_to = min(month end, employee_last_day)`, `payable = v_to − v_from + 1` (`:411-413`).
3. **Day loop** (`:416-467`) over working days from `v_from` to **yesterday** (`least(v_to, india_today() − 1)`):
   - Overtime minutes accumulate when `overtime_after_minutes` is set (worked − breaks − threshold) (`:429-436`).
   - Full-day approved leave: unpaid type adds 1 to `unpaid`; otherwise counted as paid; day skipped (`:438-443`).
   - Presence: override absent 0, half_day 0.5, present/leave/holiday/week_off 1, else 1 if checked in, else 0 (`:445-451`).
   - Half-day leave: unpaid adds 0.5 to `unpaid`; presence + 0.5 capped at 1 (`:453-458`).
   - If `payroll_absence_lop` and the role tracks attendance, `absent += 1 − presence` (`:460-462`).
4. **Loss of pay**: `lop = clamp(absent + unpaid + lop_adjustment, 0, payable)`; `paid = payable − lop`; `ratio = paid / days_in_month` (`:469-471`). Proration is by **calendar days in the month**.
5. **Fixed pay** prorated: basic, HRA, other allowances, special allowance, each `round(x × ratio, 2)` (`:473-477`).
6. **Components** (`:479-496`): fixed earnings prorated; fixed deductions not prorated; percentages of prorated basic or prorated fixed gross. Non-taxable earnings tracked in `v_untaxed`.
7. **Gross** = fixed gross + line incentive + bonus + overtime amount + other earnings + component earnings (`:498`). Overtime **hours** are reported but the **amount** is HR's input.
8. **Statutory** via `calculate_statutory(basic, gross, structure.gross, gross − untaxed, pf_applies, esi_applies, pt_state or default, tds_monthly, month end)` (`:500-503`).
9. **Totals**: deductions = PF + ESI + PT + TDS + other deductions + component deductions; net = gross − deductions (`:532-535`). Warning added for absent days (`:505-507`).

### 4.8 Statutory components — `calculate_statutory` (`…0002_payroll.sql:234-294`)

No rates are seeded; HR enters every rule. The rule in force is `payroll_rule_on(kind, on, state)` (`:104-113`), latest `effective_from ≤ on`.

| Component | Base | Formula | Rounding |
| --- | --- | --- | --- |
| PF (employee & employer) | prorated basic, capped at `wage_limit` if set | `base × rate / 100` | `round(…, 0)` (`:255-257`) |
| ESI (employee & employer) | prorated gross, only if **structure** gross ≤ `wage_limit` (or no limit) | `gross × rate / 100` | `ceil` (`:265-267`) |
| Professional tax | prorated gross | the slab whose `from ≤ gross ≤ to` (highest `from`) for the state | slab amount (`:276-279`) |
| TDS | fixed `tds_monthly` if set; else taxable monthly × 12 − `wage_limit`, × rate, ÷ 12 | `round(…, 0)` (`:283-291`) |

Missing rules produce zero plus a warning ("PF is not set up", etc.).

Monthly CTC for structures — `get_salary_structure_costs` (`:297-324`): gross + employer PF + employer ESI, ×12 for annual; readable by the person or payroll staff.

### 4.9 Access and audit

- RLS (`…0002_payroll.sql:913-963`): components and rules readable by manage or approve; structures and revisions by the person or payroll; appraisals by the person or `payroll.manage`; runs and lines by payroll, or by an employee only for their own line on a **paid** run (`has_paid_payslip_in`, `:948-957`).
- Audit triggers (`:891-903`): components, rules, structures (insert/delete), appraisals, runs (insert, status change, delete), lines (HR input columns). `approval_history` records submitted/sent_back/approved/paid (`…0009_salaries_reimbursements.sql:184-187`).

---

## 5. Recruitment, onboarding and letters

### 5.1 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/hr/recruitment` | `src/app/(crm)/hr/recruitment/page.tsx` | `recruitment.manage` (`:19`) | Kanban board (`listBoardCandidates`, joined/rejected kept for 60 days) |
| `/hr/recruitment/openings` (+ `new`, `[openingId]/edit`) | `…/openings/…` | `recruitment.manage` | Openings with candidate and joined counts (`listOpenings`) |
| `/hr/recruitment/candidates` (+ `new`) | `…/candidates/…` | `recruitment.manage` | Paged list with search, stage, opening, sort |
| `/hr/recruitment/candidates/[candidateId]` | `…/[candidateId]/page.tsx` | `recruitment.manage` (`:32`) | Profile, stage form, interviews, files, onboarding, offer letter links |
| `…/[candidateId]/edit` | | `recruitment.manage` | Candidate form including offer fields |
| `…/[candidateId]/interviews/new` | | `recruitment.manage` | Schedule interview |
| `…/[candidateId]/convert` | `…/convert/page.tsx` | `recruitment.manage` **and** `employees.create`; role picker with `employees.assign_role` (`:17-28`) | Convert to employee |
| `/hr/recruitment/interviews` | `…/interviews/page.tsx` | `recruitment.manage` (`:24`) | Upcoming/past interviews |
| `/hr/recruitment/onboarding` | `…/onboarding/page.tsx` | `recruitment.manage` (`:29`) | Checklists per new joiner; tick items (`setOnboardingTaskAction`) |
| `/interviews`, `/interviews/[interviewId]` | `src/app/(crm)/interviews/…` | `requireAccess()` (`[interviewId]/page.tsx:20`); RLS limits to interviewer or recruiter | Interviewer's own list; outcome form; candidate and files |
| `/settings/hr/recruitment` (+ `templates/new`, `templates/[templateId]/edit`) | `src/app/(crm)/settings/hr/recruitment/…` | `recruitment.manage` | Letter templates and onboarding items |
| `/letters/[templateId]/print?candidate=` or `?employee=` | `src/app/(print)/letters/[templateId]/print/page.tsx` | `requireAccess()` (`:25`); template RLS = recruiters or `exits.manage` | Merged letter |

### 5.2 Actions — `src/server/actions/recruitmentActions.ts`

| Action | Lines | Guard | Call / row check |
| --- | --- | --- | --- |
| `saveOpeningAction` | 29-63 | `recruitment.manage` | insert/update `.select('id')` |
| `saveCandidateAction` | 86-119 | `recruitment.manage` | insert/update `.select('id')` |
| `moveCandidateAction` | 121-133 | `recruitment.manage` | update stage `.select('id')` |
| `scheduleInterviewAction` | 135-166 | `recruitment.manage` | RPC `schedule_interview`, time as `+05:30` |
| `recordInterviewOutcomeAction` | 169-190 | signed in | RPC `record_interview_outcome`; `returnTo` restricted to local paths (`:189`) |
| `convertCandidateAction` | 194-234 | `recruitment.manage` + `employees.create` | pre-checks role and placement, `createEmployeeWithLogin`, then RPC `complete_candidate_conversion` |
| `setOnboardingTaskAction` | 236-243 | `recruitment.manage` | RPC `set_onboarding_task` |
| `startOnboardingAction` | 245-252 | `recruitment.manage` | RPC `start_onboarding` — **not used by any page** |
| `saveLetterTemplateAction` | 254-276 | `recruitment.manage` | `.select('id')` |
| `saveOnboardingItemAction` | 278-293 | `recruitment.manage` | `.select('id')` |

Services (`src/server/services/recruitmentService.ts`): `listCandidates` (`:28-42`), `listBoardCandidates` (`:46-58`), `getCandidate`, `listCandidateInterviews`, `listInterviews` (`:84-98`), `listMyInterviews` (`:108-118`), `listCandidateFiles` (`:120-131`), `listOpenings` (`:133-147`, loads every candidate row to count), `getRecruitmentPipeline` (`:157-164`), `listOnboarding` (`:166-186`), letter templates and onboarding items.

### 5.3 Database rules (`…0003_recruitment.sql`)

- Tables: `job_openings` (`:34-47`), `candidates` (`:54-82`, stages `new … joined`, offer fields, `employee_id` link), `interviews` (`:90-109`, linked `meeting_id`), `letter_templates` (`:117-138`, four kinds, seeded), `onboarding_items` (`:140-152`), `onboarding_tasks` (`:154-163`).
- `can_view_candidate` (`:177-188`): recruiters, or interviewers of that candidate. Candidate files follow the same rule and never appear in Files (`can_view_file_row`, latest `…0003_hr_access_private_records.sql:562-564`).
- `guard_candidate_change` (`:332-361`): `joined` only through conversion; joined is final; `employee_id` only via trusted flag; stamps `stage_changed_at`.
- `schedule_interview` (`:398-446`): creates an internal meeting with the interviewer as participant (calendar and normal meeting reminders), then the interview; moves `new`/`shortlisted` to `interview_scheduled`.
- `record_interview_outcome` (`:450-487`): interviewer or recruiter; rating required for completed; cancelled also cancels the meeting if allowed; last completed interview moves stage to `interview_done`.
- `send_interview_reminders` (`:490-507`): cron every 30 minutes, day-before reminder with dedupe key.
- `complete_candidate_conversion` (`:513-535`): link once, stage `joined`, then `start_onboarding` (`:538-554`, copies active items).
- Notifications: `candidate_added` to recruiters (`:363-376`); `interview_reminder`; kinds added in `…20261112000001_hr_notification_kinds.sql:4-10`.
- Audit (`:582-591`): openings, candidates, interviews (insert/update), templates, onboarding items. **No audit on `onboarding_tasks`.**

### 5.4 Letters — `src/lib/letters/renderLetter.ts:20-25`

Replaces `{{key}}` for `name, designation, department, company, salary, joining_date, employee_code, start_date, end_date, last_working_day, today`; anything missing becomes `__________`. The print page (`src/app/(print)/letters/[templateId]/print/page.tsx`) fills candidate values (offered designation, salary "a year", joining date) or employee values (last working day from `getLeavingResignation`; `end_date` defaults to today). Output is rendered as React text, so it is escaped.

---

## 6. Exits: resignation, checklist, settlement

### 6.1 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/resignation` | `src/app/(crm)/resignation/page.tsx` | `resignation.submit` (`:19`) | Submit, withdraw, see status, exit tasks and own settlement |
| `/hr/exits` | `src/app/(crm)/hr/exits/page.tsx` | `exits.manage` or `payroll.approve` (`:34-36`); attrition tab only for `exits.manage` | Resignations list (search, status, sort) and attrition |
| `/hr/exits/[resignationId]` | `…/[resignationId]/page.tsx` | `exits.manage` or `payroll.approve` (`:35-37`) | Details, checklist (`setExitTaskAction`), exit interview, open tasks to hand over, letters, approval history |
| `/hr/exits/[resignationId]/decide` | `…/decide/page.tsx` | `exits.manage` (`:22`) | Approve with last working day, or reject with reason |
| `/hr/exits/[resignationId]/settlement` | `…/settlement/page.tsx` | `exits.manage` (`:16`) | `SettlementForm` prefilled from `get_settlement_suggestion` |
| `/hr/exits/[resignationId]/settlement/pay` | `…/settlement/pay/page.tsx` | `payroll.approve` (`:17`) | Mark settlement paid |
| `/hr/exits/[resignationId]/settlement/print` | `src/app/(print)/hr/exits/[resignationId]/settlement/print/page.tsx` | exits or approve | Full and final statement |
| `/settings/hr/exits` | `src/app/(crm)/settings/hr/exits/page.tsx` | `exits.manage` (`:14`) | Notice period and checklist items |

### 6.2 Actions — `src/server/actions/exitActions.ts`

| Action | Lines | Guard | Call / row check |
| --- | --- | --- | --- |
| `submitResignationAction` | 27-42 | `resignation.submit` | insert (guard sets everything) |
| `withdrawResignationAction` | 44-52 | `resignation.submit` | update `withdrawn` `.select('id')` |
| `decideResignationAction` | 54-75 | `exits.manage` | RPC `decide_resignation` |
| `saveExitInterviewAction` | 77-96 | `exits.manage` | update interview fields `.select('id')` |
| `setExitTaskAction` | 98-105 | `exits.manage` | RPC `set_exit_task` |
| `saveSettlementAction` | 107-142 | `exits.manage` | update `final_settlements` `.select('resignation_id')` |
| `markSettlementPaidAction` | 144-166 | `payroll.approve` | RPC `mark_settlement_paid` |
| `saveExitChecklistItemAction` | 168-187 | `exits.manage` | `.select('id')` |
| `saveNoticePeriodAction` | 189-205 | `exits.manage` | update `company_settings.notice_period_days` `.select('id')` — RLS needs `hr.manage` |

Services — `src/server/services/exitService.ts`: `listMyResignations`, `listResignations` (`:27-38`), `getResignation`, `getLeavingResignation` (`:50-61`), `listExitTasks`, `listOpenTasksFor` (`:75-86`), `getSettlement`, `getSettlementSuggestion` (`:116-121`), `getAttrition` (`:139-165`: headcount at each month end from joining dates and last working days; rate = exits / headcount).

### 6.3 Database rules (`…0004_exit_management.sql`)

- Tables: `resignations` (`:45-65`), `exit_checklist_items` (`:67-83`, seeded six), `exit_tasks` (`:85-95`), `final_settlements` (`:97-119`) with generated `final_amount = pending_salary + leave_encashment_amount + reimbursements_due + other_earnings − notice_recovery − other_deductions`.
- `company_settings.notice_period_days` 0-180, empty until HR sets it (`:36-37`).
- `guard_resignation_insert` (`:244-275`): self only, one active (`submitted`/`approved`) at a time, proposed last day not in the past, notice days copied from settings.
- `guard_resignation_update` (`:279-310`): the person may only withdraw while `submitted`; HR may only edit exit interview fields once approved/completed; everything else through RPCs.
- `decide_resignation` (`:352-411`): `exits.manage`; never your own; reject needs a reason. Approval: last day = given date, else `submitted_on + notice_days`, else proposed date (`:383-387`); creates exit tasks from active items, an empty draft settlement, and sets `employment_status = 'notice_period'` via the trusted flag.
- `employee_last_day` (`:223-231`): latest approved/completed resignation's last working day — feeds payroll.
- `set_exit_task` (`:413-427`).
- `guard_settlement_change` (`:516-541`): paid settlements are frozen; HR cannot set payment fields.
- `process_exits()` (`:574-603`): cron `0 19 * * *` (00:30 IST). For approved resignations whose last working day has passed: `employment_status='exited'`, `is_active=false`, bans the login (`app_auth.users.banned_until='infinity'`), resignation `completed`.
- Notifications `notify_resignation_events` (`:317-349`): submit/withdraw → `exits.manage` organisation holders and the manager (`resignation_submitted`); decide → the person (`resignation_decided`, high).
- RLS (`:632-667`): resignations visible to the person, exits, `payroll.approve` and the manager; settlements to the person, exits and Finance.

### 6.4 Settlement suggestion — `get_settlement_suggestion` (latest `…0009_salaries_reimbursements.sql:346-429`)

```text
pendingSalary      = structure.gross × daysWorkedInLastMonth / daysInThatMonth
                     (0 if any payroll run for that month already includes the person)
encashableDays     = Σ over active, encashable, limited types:
                     max(allowance + carried_in − approved days in the year, 0)
encashmentAmount   = encashableDays × round(basic / 30, 2)
shortfallDays      = max(notice_days − (last_working_day − submitted_on), 0)
noticeRecovery     = structure.gross × shortfallDays / 30
reimbursementsDue  = Σ approved, unpaid claims
```

Readable by `exits.manage` or `payroll.approve`.

### 6.5 Paying a settlement — `mark_settlement_paid` (latest `…0009_salaries_reimbursements.sql:433-477`)

`payroll.approve`; only draft; refuses a negative `final_amount`; date not in the future. Marks paid, then, if `reimbursements_due > 0`, marks **every** approved claim of the person paid with reference "Paid in the full and final settlement" (`:464-471`), and records a `settlements` system expense.

---

## 7. Reimbursements (employee side)

### 7.1 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/reimbursements` | `src/app/(crm)/reimbursements/page.tsx` | `reimbursements.submit` (`:26`) | Own claims with totals waiting / to be paid / paid |
| `/reimbursements/new` | `…/new/page.tsx` | `reimbursements.submit` (`:14`) | `ClaimForm` (expense categories without `system_key`, own recent files) |
| `/reimbursements/[claimId]` | `…/[claimId]/page.tsx` | `requireAccess()` (`:18`); RLS decides | Claim, approval history; cancel (owner), approve/reject (`canDecideClaim`), pay link (`reimbursements.pay`, `:35`) |
| `/finance/salaries/reimbursements/[claimId]/pay` | `src/app/(crm)/finance/salaries/reimbursements/[claimId]/pay/page.tsx` | `reimbursements.pay` (`:17`) | Payment form |

### 7.2 Actions — `src/server/actions/reimbursementActions.ts`

| Action | Lines | Guard | Call |
| --- | --- | --- | --- |
| `submitClaimAction` | 19-50 | `reimbursements.submit` | insert `.select('id')` |
| `cancelClaimAction` | 52-60 | `reimbursements.submit` | update `cancelled` where `submitted` `.select('id')` |
| `decideClaimAction` | 64-75 | signed in (DB decides) | RPC `decide_reimbursement` |
| `payClaimAction` | 77-100 | `reimbursements.pay` | RPC `pay_reimbursement` |

Services — `src/server/services/reimbursementService.ts`: `listMyReimbursements`, `getMyClaimTotals`, `getReimbursement`, `listClaimsToDecide` (`:56-73`, one `can_decide_reimbursement` RPC per distinct person), `listClaimsForFinance`, `getClaimTotals`, `getClaimOptions`, `getApprovalHistory` (`:130-136`, errors become an empty list), `listRunsForFinance`, `listPaidRuns`.

### 7.3 Database rules (`…0009_salaries_reimbursements.sql`)

- Table `reimbursements` (`:52-75`); statuses submitted/approved/rejected/paid/cancelled.
- `can_decide_reimbursement` (`:79-87`): `reimbursements.approve` reach **or** the reporting manager; never your own.
- `can_view_reimbursement` (`:89-99`): self, deciders, payers, ledger viewers.
- `guard_reimbursement` (`:103-142`): insert as self with an active expense category, date not in the future, own receipt; later only self-cancel while submitted.
- `decide_reimbursement` (`:238-276`): reject needs a reason; notifies the claimant and, if approved, every payer.
- `pay_reimbursement` (`:278-316`): only approved; blocked while a draft settlement for that person has `reimbursements_due > 0` (`:293-295`); active bank account; files a source expense with the receipt.
- `notify_reimbursement_submitted` (`:318-340`): approvers at organisation scope and the manager.
- `approval_history` + `record_status_approval` + `get_approval_history` (`:148-232`): decision log for leave, reimbursements, payroll runs and resignations.

---

## 8. HR dashboard, reports and settings

### 8.1 Routes

| URL | File | Permission | What it does |
| --- | --- | --- | --- |
| `/hr` | `src/app/(crm)/hr/page.tsx` | `hr.dashboard` (`:37`); payroll trend if manage/approve, pipeline if recruitment, attrition if exits (`:39-50`) | `get_hr_dashboard`, birthdays, cost trend, pipeline, attrition |
| `/hr/reports` | `src/app/(crm)/hr/reports/page.tsx` | `hr.dashboard` (`:31`); payroll tab for manage/approve (`:33-34`) | Tabs people, movement, leave, payroll; CSV and print |
| `/hr/reports/export` | `src/app/(crm)/hr/reports/export/route.ts` | `hr.dashboard`; payroll view needs manage/approve | CSVs |
| `/hr/reports/print` | `src/app/(print)/hr/reports/print/page.tsx` | `hr.dashboard` (`:22`), payroll (`:25`) | Printable report |
| `/settings/hr` | `src/app/(crm)/settings/hr/page.tsx` | `hr.manage` (`:17`) | Working hours, leave types, employment types |
| `/settings/hr/payroll`, `/settings/hr/recruitment`, `/settings/hr/exits` | see sections 4-6 | `payroll.manage` / `recruitment.manage` / `exits.manage` | |

### 8.2 Dashboard SQL — `get_hr_dashboard(from,to)` (`…0004_hr_finance_foundation.sql:290-365`)

Requires `hr.dashboard`. Returns total and active employees, joinings in the period, on leave today, present today, pending leave, serving notice, active people per department, present-per-working-day trend (≤ 60 days), approved leave days by type, and work anniversaries in the next 30 days (≥ 1 year).

### 8.3 Reports — `src/server/services/hrReportService.ts:8-43` and `src/lib/hr/hrReports.ts`

- `getPeopleReport(range)` reads all employees visible to the viewer and approved/completed resignations, then `summarisePeople` (`hrReports.ts:51-81`): current headcount (active, not exited), headcount at start and end (`onBooks`, `:27-30`), joiners, leavers, attrition = leavers ÷ average headcount, and breakdowns by department, employment type and status.
- `summariseLeave` (`hrReports.ts:36-49`): per type, people, allowance including carried days, approved, pending.

### 8.4 Settings actions (`src/server/actions/hrActions.ts`)

`saveWorkingHoursAction` (`:255-291`: start/end, grace, working days, overtime and half-day thresholds entered in hours and stored in minutes, default probation), `saveHolidayAction`, `saveEmploymentTypeAction` (`:333-357`), `saveLeaveTypeAction`, `deleteLeaveTypeAction`, `carryForwardLeaveAction`. All write audited tables (`company_settings_audit`, `holidays_audit`, `leave_types_audit`, `employment_types_audit` at `…0005_employee_record.sql:586`).

`…20261114000005_client_manager_no_hr_settings.sql:6-10` removed `hr.manage`, `payroll.manage`, `recruitment.manage` and `exits.manage` from the Client Manager role.

---

## 9. Notifications produced by HR

| Kind | Producer | Recipients |
| --- | --- | --- |
| `leave_requested` | `notify_leave_events` (`…0004_hr_finance_foundation.sql:134-138`) | `leave.approve` organisation holders |
| `leave_decided` | same (`:141-150`) | employee; HR on cancellation of approved leave |
| `employee_added` | `notify_employee_added` (`…0003_hr_reports_notifications.sql:10-35`) | `hr.dashboard` organisation holders + manager |
| `attendance_irregularity` | `send_attendance_irregularities` (`:38-70`) | person without check-out; attendance managers |
| `payroll_review` | `submit_payroll_run` (`…0002_payroll.sql:747-751`) | `payroll.approve` organisation holders |
| `payroll_decided` | `decide_payroll_run` (`:779-782`) | preparer |
| `salary_paid` | `mark_payroll_paid` (`…0005_finance_ledger.sql:345-350`) | each employee on the run + preparer |
| `candidate_added` | `notify_candidate_added` (`…0003_recruitment.sql:363-376`) | recruiters |
| `interview_reminder` | `send_interview_reminders` (`:490-507`) | interviewer |
| `resignation_submitted` / `resignation_decided` | `notify_resignation_events` (`…0004_exit_management.sql:317-349`) | exits + manager / the person |
| `reimbursement_submitted` / `_decided` / `_paid` | `…0009_salaries_reimbursements.sql:266-273, 313-314, 318-340` | approvers + manager / claimant, payers / claimant |

Scheduled jobs: `carry-forward-leave` (1 Jan 00:30 UTC), `send-interview-reminders` (every 30 min), `process-exits` (19:00 UTC daily), `send-attendance-irregularities` (03:15 UTC daily).

---

## 10. Tables and RPCs at a glance

| Area | Tables | RPCs called from the app |
| --- | --- | --- |
| People | `employees`, `employee_extra_roles`, `employment_types`, `employee_personal_details`, `employee_private_details`, `files (employee_id, document_type)`, `departments`, `designations`, `roles` | `get_directory_employee_ids`, `get_hidden_employee_ids`, `can_see_employee_record`, `can_view_employee_profile`, `can_access_employee`, `role_is_assignable`, `can_create_employee`, `can_see_personal_details`, `change_employee_login_email`, `set_employee_extra_roles`, `switch_my_role`, `get_my_roles`, `get_my_team_ids`, `get_assignable_role_ids`, `record_private_detail_reveal`, `get_employment_history`, `get_upcoming_birthdays` |
| Attendance | `attendance_records`, `attendance_breaks`, `company_settings`, `holidays` | `attendance_check_in`, `attendance_check_out`, `attendance_start_break`, `attendance_end_break`, `correct_attendance_bulk`, `import_attendance`, `get_attendance_report_data`, `employee_tracks_attendance` |
| Leave | `leave_types`, `leave_requests`, `leave_carry_forwards` | `get_leave_balances`, `get_team_leave`, `get_leave_utilisation`, `carry_forward_leave` |
| Payroll | `salary_components`, `payroll_rules`, `salary_structures`, `salary_revisions`, `appraisals`, `payroll_runs`, `payroll_lines` | `start_payroll_run`, `recalculate_payroll_run`, `save_payroll_line`, `submit_payroll_run`, `decide_payroll_run`, `mark_payroll_paid`, `discard_payroll_run`, `get_salary_structure_costs`, `get_company_profile` |
| Recruitment | `job_openings`, `candidates`, `interviews`, `letter_templates`, `onboarding_items`, `onboarding_tasks` | `schedule_interview`, `record_interview_outcome`, `complete_candidate_conversion`, `start_onboarding`, `set_onboarding_task` |
| Exits | `resignations`, `exit_checklist_items`, `exit_tasks`, `final_settlements` | `decide_resignation`, `set_exit_task`, `get_settlement_suggestion`, `mark_settlement_paid` |
| Claims | `reimbursements`, `approval_history` | `decide_reimbursement`, `pay_reimbursement`, `can_decide_reimbursement`, `get_approval_history` |
| Dashboard | — | `get_hr_dashboard` |

---

## Observations

Severity is a judgement: **High** = data exposure or data loss, **Medium** = wrong figures or broken control, **Low** = hygiene. "Possible" means not proven by running the code.

### A. Sensitive data exposure

1. **High — full PAN is sent to the browser on the private-details edit page, with no reveal audit.** `getPrivateDetails` selects `pan` in full (`src/server/services/employeeService.ts:246`) despite the comment at `:241` ("Only the last four digits … ever leave this function"). `EmployeePrivateForm` is a client component (`src/components/employees/EmployeePrivateForm.tsx:1`) and receives the whole `details` object, rendering `defaultValue={details?.pan ?? ''}` (`:48`). Migration `…20261116000001_hiring_by_hr_pan_reveal.sql:6-7` states PAN should be masked and every full view recorded. Opening `/people/employees/[id]/private/edit` shows the full PAN without the password check or `record_private_detail_reveal`.

2. **High — the printable profile prints the full PAN without a reveal.** `src/components/employees/EmployeeProfilePrint.tsx:94` uses `privateDetails?.pan`, while Aadhaar and account are masked (`:93`, `:96`). Reached from the Print button on every profile (`src/app/(crm)/people/employees/[employeeId]/page.tsx:80-83`) for anyone with `canSeePrivate` (self or HR).

3. **Medium (possible) — payroll ignores the "private records" rule.** `calculate_payroll_line` and `recalculate_payroll_run` include every active employee with a structure (`…0002_payroll.sql:653-664`), and `payroll_lines`/`salary_structures` are readable by anyone with `payroll.manage` or `payroll.approve` (`:913-939`, `:960-963`) with no `can_see_employee_record` check. HR can therefore see Founder or Co-Founder salaries, although `…0003_hr_access_private_records.sql:5-8` says their records are seen only by private-record roles. The migration's list does not mention salary, so this may be intended; confirm with the owner.

4. **Medium (possible) — interviewers see the whole candidate row, including current and expected salary.** `candidates_select` uses `can_view_candidate`, which admits interviewers (`…0003_recruitment.sql:177-188, 605-606`), and `/interviews/[interviewId]` loads `getCandidate` with all `candidateFields` including `current_salary`, `expected_salary` and `offered_salary` (`src/server/services/recruitmentService.ts:11-18`).

5. **Low (possible) — HR reports and leave utilisation include private-record people.** `getPeopleReport` (`src/server/services/hrReportService.ts:8-23`) and `get_leave_utilisation` (`…0006_attendance_leave.sql:397-430`) do not filter `get_hidden_employee_ids` / `can_see_employee_record`, unlike the directory (`employeeService.ts:62-66`) and the attendance report (`…0003_hr_access_private_records.sql:320-342`). `get_hr_dashboard` counts them too (`…0004_hr_finance_foundation.sql:303-317`). Only aggregate numbers and names leak.

### B. Data loss and wrong figures

6. **High — a single attendance correction erases fields the HR person left blank.** The form's check-in and check-out boxes start empty (`src/components/hr/HrForms.tsx:216-217`), work mode defaults to office (`:223`), and `correctAttendanceAction` upserts every column, turning blanks into `null` (`src/server/actions/hrActions.ts:159-172`). Setting only a day status on a day with a real web check-in wipes the check-in and check-out times and the WFH flag. The bulk correction keeps unfilled fields (`…20261114000002_bulk_attendance_correction.sql:137-155`), so the two tools behave differently.

7. **Medium — paying a settlement marks every approved claim paid, whatever HR entered.** `mark_settlement_paid` updates all `approved` claims of the person when `reimbursements_due > 0` (`…0009_salaries_reimbursements.sql:464-471`). It does not compare that set with the amount HR typed in (`exitActions.ts:129`). Claims approved after the settlement was prepared, or left out on purpose, are recorded as paid but were never in `final_amount`. `pay_reimbursement` also blocks paying any claim on its own while such a draft exists (`:293-295`).

8. **Medium — payroll counts days after "yesterday" as worked.** The attendance loop stops at `india_today() − 1` (`…0003_hr_access_private_records.sql:417`). A run calculated or submitted before month end treats the rest of the month as fully paid, with no warning. `submit_payroll_run` recalculates (`…0002_payroll.sql:736`) but does not refuse a month that has not ended.

9. **Medium (possible) — leavers drop out of payroll for their last month if the run is created after `process_exits`.** `recalculate_payroll_run` adds only `e.is_active` people (`…0002_payroll.sql:661`), but `process_exits` deactivates them the night after their last day (`…0004_exit_management.sql:587-592`). The settlement suggestion covers this through `pendingSalary` when the person is not on any run for that month (`…0009_salaries_reimbursements.sql:388-396`), so pay is not lost if HR uses the suggestion. A deactivated person already on a draft run is still recalculated.

10. **Low — mixed bases for days.** Payroll prorates by calendar days in the month (`…0003_hr_access_private_records.sql:397, 471`). Leave encashment and notice recovery use a fixed 30-day month (`…0009_salaries_reimbursements.sql:397, 411`). Notice served is `last_working_day − submitted_on` without +1 (`:409`), one day less than an inclusive count.

11. **Low — the structure's incentive and bonus are copied to a line only when it is first inserted** (`…0002_payroll.sql:653-654`, `on conflict do nothing`). A structure added or changed after the run started does not update them on recalculation, though basic/HRA do update.

12. **Low — `getAttrition` and the people report may undercount past headcount.** They read `employees` with the viewer's RLS (`exitService.ts:142`, `hrReportService.ts:11-17`). If deactivated people are not visible, earlier months lose them (possible; depends on `employees_select` in `…20261109000013_team_access.sql:77`).

### C. Broken or misleading controls ("no fake buttons")

13. **Medium — Notice period and payroll settings can be shown to people who can never save them.** `company_settings` may be updated only with `hr.manage` (`…0006_leave_and_attendance.sql:613-614`). `/settings/hr/exits` is gated on `exits.manage` (`settings/hr/exits/page.tsx:14`) and `saveNoticePeriodAction` checks only `exits.manage` (`exitActions.ts:190`). `/settings/hr/payroll` and `savePayrollSettingsAction` check only `payroll.manage` (`payrollActions.ts:330`). A role with exits or payroll but not `hr.manage` sees a form that always fails with "You need HR settings access" (`exitActions.ts:201`, `payrollActions.ts:344`).

14. **Medium (possible) — the HR reports Leave tab crashes for viewers without `hr.manage`.** `/hr/reports` and its print and export routes are gated by `hr.dashboard` (`hr/reports/page.tsx:31`, `export/route.ts:53`), but `get_leave_utilisation` raises unless the user has `hr.manage` (`…0006_attendance_leave.sql:408-410`). The service throws (`hrService.ts:164-165`), so the page errors rather than hiding the tab.

15. **Low — `startOnboardingAction` has no caller** (`recruitmentActions.ts:245-252`; no `.tsx` uses it). This is dead code, not a fake button.

### D. Row checks after updates (CLAUDE.md: "Always add `.select()` and check that a row came back")

16. `updateMyProfileAction` — `employees.update(...).eq('id', …)` with no `.select()` (`employeeActions.ts:450-455`).
17. `saveDepartmentAction` — update/insert without `.select()` (`organisationActions.ts:48-50`); a refused update reports success.
18. `saveDesignationAction` — same (`organisationActions.ts:90-92`).
19. `deleteDepartmentAction` / `deleteDesignationAction` — no `.select()` or count (`organisationActions.ts:62, 104`), unlike `deleteRoleAction` (`:175-182`).
20. `requestLeaveAction` (`hrActions.ts:48-58`) and `submitResignationAction` (`exitActions.ts:35-38`) insert without `.select()`. A refused insert raises an error under RLS, so this is low risk.
21. SQL RPCs that update by id without checking `found`: `set_exit_task` (`…0004_exit_management.sql:421-425`) and `set_onboarding_task` (`…0003_recruitment.sql:564-567`) report success for an unknown id.

### E. Missing audit logs (CLAUDE.md: "Every important action writes to `audit_logs`")

22. **New attendance rows are not audited.** `attendance_records_audit` fires only `after update` (`…0006_leave_and_attendance.sql:602-603`). A single HR correction that creates a row (`hrActions.ts:159-172`), every API or CSV import insert (`import_attendance`, `:523-527`, including the admin API at `src/app/api/integrations/attendance/route.ts:40-41`) and every check-in leave no audit row. The bulk correction writes its own summary (`…bulk_attendance_correction.sql:171-189`).
23. `onboarding_tasks` has no audit trigger (`…0003_recruitment.sql:582-591`), so ticking onboarding items is unrecorded. `exit_tasks` is audited on update only (`…0004_exit_management.sql:619-620`), which is fine since rows are created by `decide_resignation`.
24. `interviews` delete and `attendance_breaks` are not audited. They have no delete or edit path from the app, so this is low risk.

### F. CLAUDE.md rule checks

25. **`createAdminDatabaseClient()` used outside `src/server/` and `scripts/`.** `src/app/api/integrations/attendance/route.ts:4, 40` creates the admin client in a route handler. CLAUDE.md: "Use it only in `src/server/` and `scripts/`." The behaviour is intentional (`import_attendance` treats a null `auth.uid()` as the system), but the call should move into a `src/server` module.
26. **Role names in migrations.** No TypeScript role-name checks were found in this area. The migrations grant and revoke by role name: `'Founder'`, `'human resource'`, `'Finance Head'`, `'Client Manager'`, and others (`…0004_hr_finance_foundation.sql:34-80`; `…0002_payroll.sql:29-37`; `…0003_recruitment.sql:25`; `…0004_exit_management.sql:26`; `…0009_salaries_reimbursements.sql:30-43`; `…0003_hr_access_private_records.sql:26-35`; `…20261114000005_client_manager_no_hr_settings.sql:9`; `…20261116000001_hiring_by_hr_pan_reveal.sql:12`). These are one-time data seeds, not runtime checks, so they do not break the "check permissions" rule. A renamed role on another install would not receive the grants, though.
27. **Actions that rely only on the database.** `decideLeaveAction`, `cancelLeaveAction`, `removeHolidayAction`, the check-in and break actions (`hrActions.ts:64-133, 323-331`), `decideClaimAction` (`reimbursementActions.ts:64-75`) and `recordInterviewOutcomeAction` (`recruitmentActions.ts:169-170`) skip `getActionAccess(permission)`. The database is the real guard, so this is safe. It breaks the "refuse early" convention in `docs/SystemArchitecture.md:49`, and some of these actions do not check that a session exists before querying.

### G. Other consistency notes

28. **Non-atomic multi-step writes.**
    - `convertCandidateAction` creates the employee and login, then links the candidate in a separate call. If the link fails, the employee exists with no candidate link (`recruitmentActions.ts:225-229`). The message says so, but nothing retries.
    - `createEmployeeWithLogin` deletes the login if the insert fails (`employeeCreation.ts:55-58`), but a failure in `sendInvitation` (`:60`) after the insert throws without cleanup (possible).
    - `updateEmployeeAction` saves work fields, then the email, then extra roles in three calls. A failure in a later step leaves the earlier changes saved (`employeeActions.ts:127-167`).
29. **`leave_requests.approver_id` is still set to the reporting manager** (`…0006_attendance_leave.sql:254`). Since `…0004_hr_finance_foundation.sql:105-117`, though, only `leave.approve` holders decide, and new-request notifications go to HR (`:134-138`). The column is now misleading.
30. **Leave across a year end is impossible.** A constraint (`…0006_leave_and_attendance.sql:76`) forces two separate requests for, say, 30 Dec to 2 Jan.
31. **`carry_forward_leave` counts only approved leave as used** (`…0006_attendance_leave.sql:363-366`). Requests still pending at year end therefore carry forward days that may later be approved against the old year's balance (possible double count).
32. **The CSV import parser does not handle quoted fields** (`summariseAttendance.ts:253-254`). A quoted email or a comma inside a field shifts the columns.
33. **Lateness is counted even when the day is overridden.** It is also counted when the day is approved half-day leave (`summariseAttendance.ts:160`), and an "absent" override with a check-in still counts late and adds worked minutes.
34. **Scaling.** Two loaders do work proportional to the data size:
    - `listOpenings` loads every candidate row to count per opening (`recruitmentService.ts:140-146`).
    - `listClaimsToDecide` makes one RPC per distinct claimant (`reimbursementService.ts:68-71`).

    Both are fine at the current size.
35. **The `getCompanySettings` cache is shared across users** and read with the admin client (`hrService.ts:44-55`). The data is non-sensitive and readable by every employee anyway (`…0006_leave_and_attendance.sql:611-612`). Note that `savePayrollSettingsAction` and `saveNoticePeriodAction` change `company_settings` but do not call `updateTag(companySettingsTag)`. Those columns are not in the cached select, so there is no stale read today.


# Chapter 6 — Finance

Scope: quotations, GST invoices, payments and receipts, payment follow-ups, the ledger
(income, expenses, categories), bank and cash accounts with statement reconciliation,
the transactions list, purchases (vendors, purchase orders, vendor bills and their
payments), salaries and reimbursements (Finance's side), department budgets, profit and
loss, the finance dashboard, reports and CSV exports, finance settings, signatures and
seals, the UPI QR code, the project overview text, and the printable documents.

All paths are repo-relative. `file:line` refers to the state of the repo on 2026-11-17.
Read-only study: nothing was run against `.data/`.

---

## 1. Architecture in one page

```text
Browser form (FinanceDocumentForm, LedgerForms, PurchaseForms …)
   │  live totals in the browser: src/lib/finance/documentTotals.ts (paise arithmetic)
   ▼
Server action (src/server/actions/*Actions.ts)
   │  1. getActionAccess(permission)  – early refusal, friendly message
   │  2. zod schema (src/lib/validation/*Schema.ts)
   │  3. createDatabaseClient()  – PostgREST builder, runs as the signed-in user
   ▼
Postgres (PGlite locally, Supabase in production) – the real rules
   • RPCs: save_quotation / save_invoice / save_purchase_order (recompute every figure)
   • guard triggers: who may write, which fields may change, the status machines
   • apply_gst_split trigger: CGST+SGST or IGST, and the total
   • counters: invoice / receipt / PO numbers per financial year; quotation counter
   • money_movements view: the single list of every rupee in and out
   • audit_row_change triggers write audit_logs on every finance table
   • cron jobs: overdue (hourly), due-soon + follow-ups (09:00 IST), vendor bills (09:05 IST)
```

The doc's own summary is `docs/SystemArchitecture.md:120-135`. The pattern is consistent
across the module: **amounts are never accepted from the client**; the browser computes
a preview with the same rounding (`src/lib/finance/documentTotals.ts:1-3`) and the
database recomputes and stores the real figures (`database/migrations/20261109000011_finance.sql:1-6`).

### Permissions (all module `Finance`)

| Key | Scopes | Seeded to | Defined |
|---|---|---|---|
| `quotations.view` | own, organisation | Founder, Co-Founder, Finance Head (org); Client Manager (own) | `20261109000012_phase5_access.sql:4` |
| `quotations.manage` | own, organisation | same | `…phase5_access.sql:5` |
| `invoices.view` | own, organisation | same | `…phase5_access.sql:6` |
| `invoices.manage` | own, organisation | same | `…phase5_access.sql:7` |
| `payments.record` | organisation | Founder, Co-Founder, Finance Head | `…phase5_access.sql:8` |
| `finance.reports` | organisation | Founder, Co-Founder, Finance Head | `…phase5_access.sql:9` |
| `finance.manage` | organisation | Founder, Co-Founder, Finance Head | `…phase5_access.sql:10` |
| `finance.dashboard` | organisation | Founder, Finance Head | `20261111000004_hr_finance_foundation.sql:30,42,70` |
| `followups.manage` | organisation | Founder, Finance Head | `20261112000007_follow_ups_receipts.sql:12-20` |
| `ledger.manage` | organisation | Founder, Finance Head | `20261112000005_finance_ledger.sql:19-30` |
| `banks.manage` | organisation | Founder, Finance Head | `…finance_ledger.sql:22-30` |
| `purchases.manage` | organisation | Founder, Finance Head | `20261112000008_purchases_vendors.sql:12-20` |
| `reimbursements.submit` | own | every role | `20261112000009_salaries_reimbursements.sql:20,33-36` |
| `reimbursements.approve` | team, department, organisation | Founder, Human Resource (org) | `…salaries_reimbursements.sql:21-23,38-40` |
| `reimbursements.pay` | organisation | Founder, Finance Head | `…salaries_reimbursements.sql:24,42-44` |
| `budgets.manage` | organisation | Founder, Finance Head | `20261113000002_profit_loss_budgets.sql:11-18` |

`finance_reach(permission, client, created_by)` (`20261109000011_finance.sql:243-260`) is
the scope rule for quotations and invoices: organisation scope reaches every client; own
scope reaches clients where the person is `client_manager_id`, plus documents they created.
The app mirrors it only to decide which buttons to show: `hasFinanceReach`
(`src/server/services/financeService.ts:12-24`).

### Navigation (generated from permissions)

`src/lib/access/navigationRegistry.ts:117-136` – Finance group: dashboard
(`finance.dashboard`), Quotations (`quotations.view`), Invoices (`invoices.view`), Income &
expenses and Transactions and Profit & loss (`ledger.manage`), Bank accounts
(`banks.manage`), Payment follow-ups (`followups.manage`), Purchases (`purchases.manage`),
Salaries & reimbursements (`reimbursements.pay`), Department budgets (`budgets.manage`),
Payroll approvals and Settlements (`payroll.approve`), Finance reports (`finance.reports`),
Finance settings (`finance.manage` + `finance.dashboard`). Reimbursements for everyone is in
the Team group (`navigationRegistry.ts:143`).

Dashboard widgets (`src/lib/access/dashboardWidgetRegistry.ts:36,49-52`): `financeStats`
(`finance.reports`), `overdueInvoices` (`invoices.view`), `awaitingQuotations`
(`quotations.view`), `documentSignature` (`quotations.manage` or `invoices.manage`).
Implementations: `src/components/dashboard/FinanceWidgets.tsx:15-84`,
`src/components/dashboard/DocumentSignatureWidget.tsx`. Note `followUps`
(`dashboardWidgetRegistry.ts:57`, `src/components/dashboard/FollowUpsWidget.tsx`) is the
**CRM client follow-up** widget, not payment follow-ups.

---

## 2. Shared library: `src/lib/finance/*`

| File | Purpose | Key facts |
|---|---|---|
| `documentTotals.ts` | Browser mirror of the DB's line/total maths | Works in paise. Line taxable = `round(qty×100 · price×100 / 100)` (`:10`), tax = `round(taxable · rate×100 / 10000)` (`:11`). Totals sum per-line paise (`:15-22`). CGST = `round(tax/2)`, SGST = remainder (`:24-25`), so odd paise go to SGST, matching SQL `apply_gst_split` (`20261109000011_finance.sql:229-230`). `isInterStateSupply` mirrors the trigger: both states known and different, case-insensitive (`:38-42`). `sumMoney` adds in paise (`:45-47`). |
| `invoiceDue.ts` | Derived invoice states | `isUnpaid` = issued or partially_paid (`:7-9`). Overdue is never stored: unpaid and `due_date < today` (IST) (`:11-14`). `balanceDue` = total − paid only when unpaid (`:16-18`). |
| `moneyFormat.ts` | Display | `formatRupees` with en-IN grouping (`:1-13`), `formatAmount` (`:16-18`), `formatQuantity` (`:21-23`), `amountInWords` in Indian crore/lakh/thousand, with paise (`:44-68`). |
| `financialPeriods.ts` | Indian FY (Apr–Mar) helpers | `financialYearStart/Label` (`:17-26`), period keys this/last month/quarter/FY (`:28-82`), `chooseRange` (explicit dates win, then named period, default this FY) (`:86-97`), `monthsInRange` capped at 61 months (`:100-110`), `previousRange` and `sameRangeLastYear` for P&L comparison (`:140-151`). |
| `financeReport.ts` | Pure report builder (testable without a DB) | Only issued/part-paid/paid invoices count as sales (`:4-5`, query in `financeService.ts:89-94`). Summary (invoiced, taxable, GST, collected, outstanding, overdue) (`:61-71`), per-month GST split (`:73-87`), ageing buckets current / 1-30 / 31-60 / 61-90 / 90+ (`:38-44,89-95`), top 10 clients (`:97-121`). |
| `profitLoss.ts` | P&L statement builder | Cash basis (`:1-2`). Sections revenue / salaries / operating (`:4`). Lines grouped by label in paise (`:26-35`). `totals.expenses = salaries + operating`, `net = revenue − expenses` (`:39-47`). `monthlySeries` (`:50-57`), `departmentTotals` (`:60-68`), `compareSection` across three periods (`:73-79`), `percentChange` rounded to 0.1 % and null when the base is 0 (`:83-86`). |
| `parseStatementCsv.ts` | Bank CSV parser | Finds the header row by column names (`:66-71`); supports one signed `amount` or separate debit/credit columns (`:90-96`); Indian `dd/mm/yyyy` and ISO dates (`:33-41`); `(1,234)` and `Dr` suffix mean negative (`:43-50`); rows with no date or zero amount are counted as skipped (`:97-100`); amount rounded to 2 dp (`:105`). |
| `documentOverview.ts` | Rule-based "project overview" paragraph and title | Groups items by sub-service, detects Starter/Growth/Premium plan suffix (`:43,65-75`), scope phrase from billing kind (`:77-83`), shortens to ≤ 400 chars by dropping the closing line then listing "and N more" (`:118-129`). `writeTitle` ≤ 200 chars (`:134-139`). No AI involved (`:6`). |
| `quotationTerms.ts` | Keeps "This quotation is valid until <date>." in the terms in step with the Valid-until date | Regex `(valid until\s+)([^.\n]+)(\.)` (`:5`), `validUntilDate` = chosen date or issue date + validity days (`:17-23`), `withValidUntil` replaces only that line (`:26-30`). |
| `indianStates.ts` | States/UTs with GST state codes | Codes 01–38, 97 Other Territory, 96 Outside India (`:3-42`); `stateCode(name)` (`:52-54`). Place of supply is stored as a **name**, not a code. |

---

## 3. Quotations

### 3.1 Purpose

Prepare a priced, GST-split proposal for a client, take it through draft → final → sent →
accepted/declined, print it, and convert an accepted quotation into a draft invoice.

### 3.2 Routes

| URL | File | Permission (page) | What it does |
|---|---|---|---|
| `/quotations` | `src/app/(crm)/quotations/page.tsx` | `quotations.view` (`:31`) | Paged list (25/page), search on title/number/bill-to, status filter incl. derived **expired** (`sent` and `valid_until < today`, `quotationService.ts:15-16,33`), client filter. "New" shown with `quotations.manage` (`:42`). |
| `/quotations/new` | `…/quotations/new/page.tsx` | `quotations.manage` (`:20`) | `FinanceDocumentForm` with clients from `listBillingClients` (own scope → only managed clients, `financeService.ts:35-46`). |
| `/quotations/[id]` | `…/quotations/[quotationId]/page.tsx` | `quotations.view` (`:34`) | Detail, status buttons (`:59-92`), Print, Delete draft (`:103-111`), Create invoice when accepted (`:76-87`). Live refresh on the row (`:53`). |
| `/quotations/[id]/edit` | `…/[quotationId]/edit/page.tsx` | `quotations.manage` + `hasFinanceReach` (`:27,40`) | Edit form (drafts only are editable in the DB). |
| `/quotations/[id]/print` | `src/app/(print)/quotations/[quotationId]/print/page.tsx` | `quotations.view` (`:26`) | `PrintableDocument`; DRAFT stamp until final. |

### 3.3 Actions — `src/server/actions/quotationActions.ts`

| Action | Lines | Checks | DB call |
|---|---|---|---|
| `saveQuotation` (shared by save/autosave) | `:34-57` | `getActionAccess(quotations.manage)` (`:35`); `readFinanceDocument` zod (`:39`); `parseLineItems` (`:41`); title auto-written by `writeTitle` if blank (`:48`) | `rpc('save_quotation')` (`:46-50`), then a **second** `update({overview})…select('id')` (`:54`) |
| `saveQuotationAction` | `:59-68` | – | redirect to detail |
| `autosaveQuotationAction` | `:72-74` | – | returns `{id}` so later saves update the same draft |
| `changeQuotationStatusAction` | `:84-93` | none in app; RLS + guard trigger decide | `update({status}).select('id')`, zero rows → "no permission" (`:89`) |
| `createInvoiceFromQuotationAction` | `:95-105` | `invoices.manage` | `rpc('create_invoice_from_quotation')` |
| `deleteQuotationAction` | `:107-116` | RLS: manage reach **and** `status='draft'` | `delete().select('id')`, zero rows → "Only a draft…" |

Validation: `financeDocumentSchema` (`src/lib/validation/financeSchema.ts:75-98`) – client uuid,
optional project, title ≤ 200 (may be empty), ISO dates with end ≥ issue, GSTIN regex
(`:38,59-64`), overview ≤ 400 chars and ≤ 3 lines (`:90`), signature `mine|keep|none`
(`:92`). Items: `lineItemSchema` (`:144-159`) – description 1–500, HSN/SAC 4–8 digits,
quantity/price/rate as strings `^\d{1,12}(\.\d{1,2})?$` with commas stripped (`:67-73`),
rate ≤ 40, quantity < 1e10; completely blank rows skipped; 1–100 items (`:166-199`).

Audit: no app-side audit; the `quotations_audit` trigger (`20261109000011_finance.sql:1056-1057`)
logs every insert/update/delete with a label `QUO-0001: Title` (`:979-980`). Item rows have
**no** audit trigger (they are replaced wholesale on each save).

### 3.4 Services — `src/server/services/quotationService.ts`

`listQuotations` (`:20-40`), `listClientQuotations` (`:44-54`), `listAwaitingQuotations`
(status `sent`, by `valid_until`, `:57-67`), `getQuotation` cached per request with client,
project, author and linked invoice (`:70-85`), `listQuotationItems` (`:89-98`).

### 3.5 Database

Tables: `quotations` (`20261109000011_finance.sql:49-80`), `quotation_items` (`:82-94`),
later columns `invoice_id` (`:160`), `signed_by`, `show_seal`
(`20261113000014_signatures_pins_service_items.sql:185-187`), item `service_group`,
`service_name`, `billing` (`…:89-92`), `overview` (`20261114000007_document_overview.sql:5-6`).

Status machine — `guard_quotation_write`, current version
`20261114000006_quotation_final_invoice_sent.sql:15-109`:

```text
            ┌──────── back to draft ────────┐
            ▼                               │
  draft ──finalise──▶ final ──mark sent──▶ sent ──▶ accepted ──(create invoice)──▶ invoice_id set
   ▲  ▲                 ▲  ◀─"not sent yet"─┘ │        │
   │  └──── revise ─────┼──── declined ◀──────┘        │ undo acceptance (only if no invoice)
   └────────────────────┴──────────── sent/declined ─▶ draft      accepted ─▶ sent
```

* draft → final requires items and `subtotal + tax > 0` (`…final_invoice_sent.sql:73-77`).
* final → sent stamps `sent_at` (`:80-81`); sent → final clears it (`:82-83`).
* sent → accepted/declined stamps `decided_at` (`:84-85`).
* sent/declined → draft and accepted → sent (only while `invoice_id is null`) reset
  `decided_at` (and `sent_at` for draft) (`:86-91`).
* Anything else raises "You cannot move this quotation from X to Y" (`:92-95`).
* Only **draft** content can change (`:51-61`); `save_quotation` repeats the check (`:157-159`).
* `quotation_number`, `sent_at`, `decided_at` and (outside internal writes) `invoice_id` are
  immutable (`:38-43`). Subtotal/tax can only be written inside the save RPCs
  (`app.finance_internal` flag, `20261109000011_finance.sql:312-317`, enforced `…final_invoice_sent.sql:44-47`).
* On insert or while draft, blank bill-to name/address/GSTIN/place of supply are filled from
  the client, and `valid_until` defaults to issue date + `quotation_validity_days` (`:99-106`).
* Project must belong to the client (`check_finance_links`, `20261109000011_finance.sql:319-330`).
* The overview may change only on a draft (`20261114000007_document_overview.sql:10-25`).

Numbering — `20261116000002_quotation_numbering.sql`:

* Originally `QUO-` + 4-digit sequence default (`20261109000011_finance.sql:47,51-52`).
* Now a one-row counter `quotation_number_counter` (`…quotation_numbering.sql:11-18`) and a
  configurable `quotation_prefix` (1–8 chars, `:7-8`). `assign_quotation_number` locks the
  counter `FOR UPDATE`, builds `PREFIX-` + `lpad(n,4,'0')`, skips numbers already used, and
  advances the counter (`:23-45`). Trigger name sorts before `quotations_guard` so it runs
  first (`:47-49`).
* Number is given **on insert, i.e. when the first draft is (auto)saved**, not on finalise.
* `get_next_quotation_number` / `set_next_quotation_number` need `finance.manage` at
  organisation scope; setting writes an `audit_logs` row by hand (`:52-89`).

RLS (`20261109000011_finance.sql:1082-1094`): select via `can_view_quotation_row`
(view **or** manage reach), insert needs manage reach on the client, update needs manage
reach (field rules in the trigger), delete only drafts. Items: select only; writes are
revoked from `authenticated` (`20261109000012_phase5_access.sql:57-59`).

Live updates: `quotations` and `invoices` are in the `live_updates` publication
(`…phase5_access.sql:86-87`); detail pages mount `FinanceLiveRefresh`.

### 3.6 Convert to invoice

`create_invoice_from_quotation` (current: `20261113000014_signatures_pins_service_items.sql:416-463`):
locks the quotation; requires view reach, `status = 'accepted'`, no existing invoice, and
`invoices.manage` reach on the client; inserts a draft invoice with the quotation's bill-to,
place of supply, notes and **its stored subtotal/tax** (not recomputed), copies items with
service details, sets `quotations.invoice_id`. The invoice is not signed (`:414-415`). The
overview is copied by trigger `copy_quotation_overview` (`20261114000007_document_overview.sql:28-41`).
Terms are **not** copied; the invoice gets `finance_settings.invoice_terms` via the guard
(`20261109000011_finance.sql:454`).

---

## 4. Invoices, payments and receipts

### 4.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/invoices` | `src/app/(crm)/invoices/page.tsx` | `invoices.view` (`:32`) | List; derived filters **unpaid** and **overdue** (`invoiceService.ts:16-17,33-34`). |
| `/invoices/new` | `…/invoices/new/page.tsx` | `invoices.manage` (`:20`) | Form. |
| `/invoices/[id]` | `…/invoices/[invoiceId]/page.tsx` | `invoices.view` (`:44`) | Issue, Edit, Mark sent / Not sent yet, Receipt, Print, Delete draft, Cancel (`:72-116`); Payments panel with Record and Remove (`:140-195`); details incl. place of supply with state code (`:252-254`). |
| `/invoices/[id]/edit` | `…/[invoiceId]/edit/page.tsx` | `invoices.manage`, draft only, reach (`:28,41`) | Form. |
| `/invoices/[id]/print` | `src/app/(print)/invoices/[invoiceId]/print/page.tsx` | `invoices.view` (`:34`) | "Tax invoice" once issued; stamps Draft/Paid/Cancelled (`:25-31`); bank details hidden when paid/cancelled (`:64`). |
| `/receipts/[paymentId]/print` | `src/app/(print)/receipts/[paymentId]/print/page.tsx` | `invoices.view` (`:24`) | Receipt for one payment; `?sign=me|none`, `?seal=1|0`; signs as the invoice unless overridden (`:31-37`). |

### 4.2 Actions — `src/server/actions/invoiceActions.ts`

| Action | Lines | Checks | Effect |
|---|---|---|---|
| `saveInvoice` / `saveInvoiceAction` / `autosaveInvoiceAction` | `:35-75` | `invoices.manage`; same schema as quotations, end date = due date | `rpc('save_invoice')` then separate overview update (`:55`) |
| `issueInvoiceAction` | `:78-92` | RLS + guard | `update({status:'issued'}).select('invoice_number')`, zero rows → no permission |
| `markInvoiceSentAction` | `:95-102` | RPC checks reach | `rpc('mark_invoice_sent')` |
| `cancelInvoiceAction` | `:104-120` | reason 3–500 (`financeSchema.ts:222-226`) | `update({status:'cancelled', cancel_reason}).select('id')` |
| `deleteInvoiceAction` | `:122-131` | RLS: drafts only | `delete().select('id')` |
| `recordPaymentAction` | `:133-159` | `payments.record`; `paymentSchema` (`financeSchema.ts:214-220`) | `insert` into `payments` (no `bank_account_id` is ever sent) |
| `removePaymentAction` | `:161-172` | `payments.record` | **hard** `delete` of the payment row `.select('id')` |

### 4.3 Services — `src/server/services/invoiceService.ts`

`listInvoices` (`:21-41`, ordered by `created_at`), `listClientInvoices` (`:45-55`),
`getClientBalance` (outstanding and overdue for Client 360, `:58-72`), `listOverdueInvoices`
(`:74-85`), `getInvoice` (`:88-103`), `listInvoiceItems` (`:107-116`), `listInvoicePayments`
with receipt number and recorder (`:118-128`).

### 4.4 Status machine and numbering — `guard_invoice_write`

`20261109000011_finance.sql:427-542` (not replaced since).

```text
 draft ──issue──▶ issued ──payment──▶ partially_paid ──payment──▶ paid
   │               │  ▲                    │   ▲                    │
 delete            │  └── payment removed ─┘   └─ payment removed ──┘
                   └──────── cancel (only when amount_paid = 0, reason required) ──▶ cancelled
```

* Insert always starts `draft` with no number, zero paid, and `quotation_id` only via the
  internal RPC (`:441-455`).
* Payment-driven updates (trigger depth > 1) bypass the rest (`:456-458`).
* Immutable: number, quotation link, paid amount, issued/paid/cancelled timestamps;
  `cancel_reason` only while cancelling (`:460-468`).
* Anything but draft is content-locked: "Cancel it and issue a new one" (`:474-485`).
* **Issue** (`:496-514`): needs items and positive total; `issue_date` may not be in the
  future; financial year from `issue_date` (April start) → `YY-YY`; counter row in
  `invoice_number_counters` upserted with `on conflict … do update set last_number = last_number + 1`
  (row lock serialises concurrent issues); number = `invoice_prefix || '/' || 'YY-YY' || '/' || lpad(n,4,'0')`,
  e.g. `INV/26-27/0001`. The counter update is in the same transaction, so a failed issue
  rolls back and **drafts never consume numbers** (`:102`).
* **Cancel** from issued/partially_paid/paid: requires `amount_paid = 0` and a reason;
  number stays used (`:515-523`; UI message `invoiceActions.ts:119`).
* While draft, blank bill-to fields filled from the client and `due_date` defaults to
  issue date + `payment_terms_days` (`:532-539`).
* `mark_invoice_sent` sets/clears `sent_at` on any non-draft, non-cancelled invoice the
  caller manages (`20261114000006_quotation_final_invoice_sent.sql:197-215`). It updates
  outside `pg_trigger_depth > 1` — but `sent_at` is not in the immutable list, so the guard
  allows it.

RLS (`20261109000011_finance.sql:1096-1108`): mirror of quotations; delete only drafts.

### 4.5 GST computation (shared by quotations, invoices and purchase orders)

1. `normalize_items` (`20261109000011_finance.sql:614-640`): 1–100 items, trims, rounds
   quantity/price/rate to 2 dp.
2. `item_lines` (`:643-657`): `taxable = round(qty × price, 2)` (`:186-191`),
   `tax = round(taxable × rate / 100, 2)` (`:193-198`) — **per-line rounding**.
3. `save_*` sums lines into `subtotal` and `tax_total` (`:677-679`).
4. `apply_gst_split` BEFORE trigger (`:210-235`):
   * `is_inter_state` recomputed on insert and while the old status is draft/sent/declined
     (`:217-221`): true when `finance_settings.state` and `place_of_supply` are both set and
     differ (case-insensitive, trimmed). **Unknown state on either side ⇒ intra-state.**
   * Inter-state: `igst = tax`, CGST/SGST = 0. Intra-state: `cgst = round(tax/2, 2)`,
     `sgst = tax − cgst` (`:223-231`).
   * `total = subtotal + tax_total` (`:232`).
5. The printed document shows the split, amount in words, both GSTINs, place of supply with
   state code, HSN/SAC per line (`src/components/finance/PrintableDocument.tsx:253,365-379`).

The browser preview (`documentTotals.ts`) reproduces steps 2–4 in integer paise.

### 4.6 Payments

* Table `payments` (`20261109000011_finance.sql:166-180`), later `bank_account_id`
  (`20261112000005_finance_ledger.sql:148`) and `receipt_number` (`20261112000007_follow_ups_receipts.sql:122`).
* `guard_payment_insert` (`20261109000011_finance.sql:551-583`): locks the invoice
  `FOR UPDATE`; only issued/partially_paid; amount ≤ balance due (message uses
  `format_rupees`); payment date not in the future; copies `client_id` (for Client 360);
  stamps `recorded_by`.
* `refresh_invoice_payments` AFTER insert/delete (`:586-606`): recomputes `amount_paid` as
  the sum of payments; status `paid` when ≥ total, `partially_paid` when > 0, else
  `issued`; `paid_at` set once, cleared when no longer fully paid.
* Table constraint `amount_paid between 0 and total` (`:133`).
* RLS: insert needs `payments.record` **and** view reach on the invoice; delete needs only
  `payments.record` (`:1110-1115`). Update is revoked (`20261109000012_phase5_access.sql:55-56`).
* Audit: `payments_audit` on insert and delete (`20261109000011_finance.sql:1060-1061`),
  label = amount.

### 4.7 Receipts

`20261112000007_follow_ups_receipts.sql:114-171`: `finance_settings.receipt_prefix` (default
`RCPT`); `receipt_number_counters` per FY; `next_receipt_number(date)` → `RCPT/26-27/0001`
from the **payment date's** FY; BEFORE INSERT trigger `payments_number_receipt` (sorts after
`payments_guard`, so it runs only after validation); one-off backfill numbering old payments
in date order. Printed by `src/components/finance/ReceiptPrint.tsx`.

### 4.8 Notifications

* `payment_received` to the client manager and the invoice creator, title "An invoice is
  paid in full" vs "A payment was received" (`20261109000011_finance.sql:860-886`). It
  computes "paid in full" as `amount_paid + new.amount` because it fires **before**
  `payments_refresh_invoice` (AFTER triggers fire alphabetically: `payments_audit`,
  `payments_notify`, `payments_refresh_invoice`).
* `invoice_overdue` hourly at :30 (`:888-919`), high priority, to client manager and
  creator, de-duplicated by key `invoice-overdue:<id>:<due_date>` → once per due date.
* `invoice_due_soon` daily 09:00 IST (`30 3 * * *` UTC) for invoices due in exactly 3 days,
  to every `followups.manage` holder and the client manager
  (`20261112000007_follow_ups_receipts.sql:179-225`).
* Enum values added in `20261109000010_phase5_notification_kinds.sql:4-5` and
  `20261112000006_finance_notification_kinds.sql:4-9` (Postgres requires them committed first).

---

## 5. Shared document form, signatures, overview, UPI QR

### 5.1 `FinanceDocumentForm` (`src/components/finance/FinanceDocumentForm.tsx`, 487 lines)

* One form for quotations and invoices (`docs/SystemArchitecture.md:122`); picks
  `autosaveQuotationAction`/`autosaveInvoiceAction` (`:143`).
* **Autosave** (`:187-225,285-311`): marks dirty on input, debounces 4 s, retries 2 s later
  if a save is in flight, waits for `form.checkValidity()`, and saves immediately when the
  tab is hidden. The first autosave creates the draft (and therefore a quotation number);
  the returned id is placed in the hidden `documentId` field (`:329`) and the URL becomes
  `/…/id/edit` via `history.replaceState` (`:214`).
* Terms "valid until" follow the date while the line still shows the auto date (`:227-246`).
* Overview is rewritten from the items and client until typed by hand (`:248-283`).
* `DocumentItemsEditor` (`src/components/finance/DocumentItemsEditor.tsx`) shows live
  per-line and document totals (`:118-143`), offers the price list (sub service × plan,
  `:51-116`), and rates `0, 5, 18, 40` plus the default (`financeSchema.ts:35-36`,
  `DocumentItemsEditor.tsx:118`).
* Price list data: `services.billing/starter_price/growth_price/premium_price`
  (`20261113000010_service_prices.sql:9-13`), seeded with the company's price list
  (`:15-85`); client plan per sub-service (`20261114000001_client_service_plans.sql:5-6`).

### 5.2 Signatures and seals

* Table `document_signatures` (one row per employee, base64 PNG/WebP ≤ 400 000 chars)
  (`20261113000014_signatures_pins_service_items.sql:105-111`); RLS: own row, or anyone
  with `invoices.view`/`quotations.view` can read; write own row only and only with a manage
  permission (`:122-135`).
* Audit without copying images: `audit_document_signature` (`:141-183`).
* `guard_document_signer` — you can only put your own signature on a document (`:193-213`).
* `apply_document_signature(mine|keep|none)` inside the save RPCs; `mine` requires an
  uploaded signature (`:217-237`). `show_seal` only when signed.
* App: `saveDocumentSignatureAction` (`src/server/actions/signatureActions.ts:18-61`) —
  checks manage permission in app (`:21-23`), resizes images with sharp
  (`src/server/services/documentImages.ts:9-27`: PNG/JPG/WebP ≤ 5 MB, trimmed, fit inside
  600×240 for signatures and 400×400 for seals, WebP q90), upserts with `.select()` and
  row check (`:51-56`).
* `signatureService.ts`: `getSigningChoice` for the form (`:35-44`), `getSignatory` with title
  fallback to role name then "Authorised signatory" (`:48-65`).

### 5.3 Overview

Column + 3-line/400-char check on both tables, draft-only guard, copy into converted invoice
(`20261114000007_document_overview.sql:1-43`). Generator: `src/lib/finance/documentOverview.ts`.

### 5.4 Payment details and UPI QR

`finance_settings` gains bank account name/number/IFSC/SWIFT/bank name/UPI id and
`upi_qr_image` (`20261113000015_fewer_calls_payment_details.sql:103-111`), seeded with the
company's values (`:113-120`; values not reproduced here). A QR image was seeded where none
existed and default quotation terms were set (`20261114000004_upi_qr_quotation_terms.sql:9-18`).
Printed by `PrintableDocument.tsx:133-158`. QR uploads go through `toStoredImage(..., {trim:false})`
at 360×360 (`src/server/actions/financeActions.ts:56-63`).

---

## 6. Payment follow-ups

### 6.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/finance/follow-ups` | `src/app/(crm)/finance/follow-ups/page.tsx` | `followups.manage` (`:29`) | Board of unpaid invoices with status, filters (status, search, include paid, due today/overdue), sorts, totals (`followUpService.ts:39-72`). |
| `/finance/follow-ups/[invoiceId]` | `…/follow-ups/[invoiceId]/page.tsx` | `followups.manage` (`:25`), non-draft invoice (`:29`) | History of notes and the record form (`FollowUpForms.tsx`). |
| `/finance/follow-ups/export` | `…/follow-ups/export/route.ts` | `followups.manage` (`:10`) | CSV of the filtered board (`csvCell`-escaped). |

### 6.2 Action — `src/server/actions/followUpActions.ts:10-43`

`followups.manage`; `followUpSchema` (`src/lib/validation/followUpSchema.ts:26-46`): only
`contacted | pending | promise_to_pay` can be recorded (`:18`); promise needs a date; next
follow-up ≥ contacted date. Insert with `.select('id')` and row check.

### 6.3 Database (`20261112000007_follow_ups_receipts.sql`)

* Enum `follow_up_status` (`:26`); `not_contacted` and `payment_received` are derived only
  (table check `:39`).
* `invoice_follow_ups` append-only notes (`:28-42`), audit on insert (`:231-232`).
* `guard_follow_up` (`:44-69`): stamps author; only issued/partially_paid invoices;
  contact date not future; next ≥ contacted; promise needs a date.
* `get_follow_up_board` (`:73-108`) — **invoker rights**: status = latest note's, or
  `payment_received` once paid; `days_overdue = max(today − due, 0)`.
* RLS: read with `followups.manage` or invoice view reach; insert needs both (`:239-242`).
* Reminder `follow_up_due` to the note's author (or all Finance) when the latest note's
  `next_follow_up_on ≤ today` (`:203-220`).

---

## 7. Ledger: income, expenses, categories

### 7.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/finance/ledger` | `src/app/(crm)/finance/ledger/page.tsx` | `ledger.manage` (`:48`) | Views `expenses` (default), `income`, `summary` (`:65-81`); filters search/category/account/method/date/removed; edit/remove only for manual entries; links to payroll/reimbursement/settlement sources (`:189-209`). Summary per **calendar** year (`:229`, `ledgerService.ts:166-182`). |
| `/finance/ledger/expenses/new`, `/[id]/edit`, `/[id]/remove` | `…/ledger/expenses/**` | `ledger.manage` | Edit/remove refuse removed or automatic expenses (`…/[expenseId]/edit/page.tsx:19`). |
| `/finance/ledger/income/new`, `/[id]/edit`, `/[id]/remove` | `…/ledger/income/**` | `ledger.manage` | Same for income. |
| `/finance/ledger/export` | `…/ledger/export/route.ts` | `ledger.manage` (`:12`) | CSV (up to 10 000 rows, `ledgerService.ts:49,75`). |
| `/settings/finance/categories` | `src/app/(crm)/settings/finance/categories/page.tsx` | `ledger.manage` (`:14`) | Add/rename/deactivate categories. |

### 7.2 Actions — `src/server/actions/ledgerActions.ts`

| Action | Lines | Notes |
|---|---|---|
| `saveExpenseAction` | `:20-58` | `ledger.manage`; `expenseSchema` (`ledgerSchema.ts:40-46`); insert or update `.select('id')` + row check; unique-reference message (`:53`). |
| `saveIncomeAction` | `:60-96` | Same for income (`ledgerSchema.ts:33-38`). |
| `removeLedgerEntryAction` | `:98-109` | `removalSchema` reason 3–500; `rpc('remove_ledger_entry')`. |
| `saveFinanceCategoryAction` | `:204-222` | name/active only on update; kind fixed after creation. |

Amount parsing (`ledgerSchema.ts:17-22`): strips commas, > 0, ≤ 99 99 99 999, then
`Math.round(v*100)/100`.

### 7.3 Database (`20261112000005_finance_ledger.sql`)

* `finance_categories` (`:43-71`), with `system_key` in `salaries | settlements | reimbursements | purchases`
  for automatic filing; seeded list of 13 expense and 2 income categories. System categories
  can be renamed but not removed, re-kinded or deactivated (`:81-101`).
* `income_records` (`:154-175`) and `expense_records` (`:177-204`): money never deleted,
  only marked removed with reason (`deleted_at` ⇔ `delete_reason` check). Expenses carry
  `source` (`manual | payroll | settlement | reimbursement | vendor_bill`) and `source_id`,
  unique per source (`:190-202`). Reference unique per account among live manual entries
  (`:174-175,203-204`).
* `guard_ledger_entry` (`:209-260`): category kind must match; stamps creator; app-created
  expenses forced to `manual`; account must be active; removed rows frozen; automatic expenses
  frozen ("Change it where it came from"); removal only through the RPC.
* `remove_ledger_entry` (`:262-289`): `ledger.manage`, reason ≥ 3 chars, sets
  `app.trusted_ledger`, manual expenses only.
* `record_system_expense` (`:292-311`) and `record_source_expense`
  (`20261112000008_purchases_vendors.sql:339-358`): insert once per source
  (`on conflict do nothing`), account via `account_or_default` (named active → primary →
  first cash) (`20261112000005_finance_ledger.sql:135-144`).
* `mark_payroll_paid` / `mark_settlement_paid` now file the expense in the same
  transaction (`:317-390`; settlement replaced again in `20261112000009_salaries_reimbursements.sql:431-477`).
* RLS: categories readable by every employee (for claims), writable with `ledger.manage`
  (`:664-667`); income/expense readable with `ledger.manage` or `banks.manage`, writable with
  `ledger.manage` (`:677-689`). No DELETE grant on ledger tables (`:702-705`).
* Audit: insert/update on categories, income, expense (`:646-653`).

---

## 8. Bank and cash accounts, statements, transactions

### 8.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/finance/banks` | `src/app/(crm)/finance/banks/page.tsx` | `banks.manage` (`:21`) | Accounts with balances. |
| `/finance/banks/new`, `/[id]/edit` | `…/banks/new`, `…/[accountId]/edit` | `banks.manage` | Account form. |
| `/finance/banks/[id]` | `…/banks/[accountId]/page.tsx` | `banks.manage` (`:44`) | Opening balance / money in / out / balance tiles (`:85-92`); CSV import for non-cash accounts (`:93-102`) with statement vs recorded balance hint (`:96-100`); tabs **Statement lines** (suggestions, match/unmatch) and **Recorded but not on the statement** (`:103-109`). |
| `/finance/transactions` | `src/app/(crm)/finance/transactions/page.tsx` | `ledger.manage` (`:39`) | Paged `get_money_movements` with totals in/out (`:53`). |
| `/finance/transactions/export` | `…/transactions/export/route.ts` | `ledger.manage` (`:12`) | CSV, up to 100 000 rows (`:24`). |

### 8.2 Actions — `src/server/actions/ledgerActions.ts`

* `saveBankAccountAction` (`:111-161`): `banks.manage`; `bankAccountSchema`
  (`ledgerSchema.ts:55-78`: 6–18 digit account number, IFSC regex, opening balance ±99 99 99 999).
  The account number is encrypted with `FIELD_ENCRYPTION_KEY` (`encryptField`), only last 4
  kept in clear (`:143-146`); refuses if encryption is not configured (`:128-130`). Making an
  account primary first demotes the old primary in a **separate** update (`:150-152`); the
  partial unique index allows one primary (`20261112000005_finance_ledger.sql:130`).
* `importStatementAction` (`:163-184`): CSV ≤ 5 MB, parsed in Node by `parseStatementCsv`,
  then `rpc('import_statement_lines')`; message reports imported, duplicates, unreadable.
* `matchStatementLineAction` / `unmatchStatementLineAction` (`:186-202`).

### 8.3 Database

* `bank_accounts` (`20261112000005_finance_ledger.sql:109-132`) with a seeded "Cash in hand".
  RLS read for ledger/banks/`payroll.approve`; insert/update `banks.manage`; no delete
  (`:670-675,703`).
* `money_movements` view, `security_invoker` (`:397-418`): union of invoice payments (in;
  account = payment's or `account_or_default(null)` **evaluated at read time**), live income
  (in) and live expenses (out, kind = `expense` or the source).
* `get_money_movements` (`:421-461`), invoker rights, filters + window totals.
* `get_account_balances(p_on)` (`:465-488`), **security definer**: opening balance + in − out
  for movements on/after `opening_date` up to `p_on`.
* `bank_statement_lines` (`:494-517`): positive = in; duplicate import key
  `(account, date, amount, reference, md5(description))`; a movement matches at most one line.
* `import_statement_lines` (`:520-563`): `banks.manage`, ≤ 5000 rows, per-row sub-transaction
  collecting errors.
* `match_statement_line` (`:567-594`): same account, same absolute amount and direction.
* `get_statement_suggestions` (`:610-631`): unmatched lines × unmatched movements, same
  amount/direction, ±5 days.
* Audit: `bank_statement_lines_audit` on `update of matched_id` (`:654-655`); accounts audited
  (`:648-649`). No insert audit for imported lines (the import is not in `audit_logs`).

---

## 9. Purchases: vendors, purchase orders, vendor bills

### 9.1 Routes (all `purchases.manage`)

| URL | File | What it does |
|---|---|---|
| `/finance/purchases` | `src/app/(crm)/finance/purchases/page.tsx` (`:50`) | Tabs bills / orders / vendors (`:71-78`), payables summary. |
| `/finance/purchases/vendors/new`, `/[id]`, `/[id]/edit` | `…/purchases/vendors/**` | Vendor CRUD; history of orders and bills (`purchaseService.ts:174-189`); delete (fails with `isStillInUse` if used). |
| `/finance/purchases/orders/new`, `/[id]`, `/[id]/edit`, `/[id]/cancel` | `…/purchases/orders/**` | Draft PO form (same item editor), Issue, Mark received, Delete draft (`orders/[orderId]/page.tsx:41-82`), Cancel with reason. |
| `/purchase-orders/[id]/print` | `src/app/(print)/purchase-orders/[orderId]/print/page.tsx` (`:16`) | Printable PO. |
| `/finance/purchases/bills/new`, `/[id]`, `/[id]/edit`, `/[id]/remove` | `…/purchases/bills/**` | Vendor bill CRUD; remove only unpaid (`bills/[billId]/remove/page.tsx:20`). |
| `/finance/purchases/bills/[id]/payments/[paymentId]/remove` | `…/payments/[paymentId]/remove/page.tsx` | Remove a bill payment with reason. |

### 9.2 Actions — `src/server/actions/purchaseActions.ts`

| Action | Lines | Notes |
|---|---|---|
| `saveVendorAction` | `:19-57` | `vendorSchema` (`purchaseSchema.ts:54-79`). |
| `deleteVendorAction` | `:59-70` | Uses `isStillInUse` (CLAUDE.md rule honoured). |
| `savePurchaseOrderAction` | `:72-109` | `purchaseOrderSchema` + `parseLineItems`; `rpc('save_purchase_order')`. |
| `moveOrder` → issue / received / cancel | `:111-139` | `update(...).select('po_number')` + row check. |
| `deleteDraftOrderAction` | `:141-149` | `.eq('status','draft')` + row check. |
| `saveVendorBillAction` | `:151-192` | `vendorBillSchema` (`purchaseSchema.ts:97-112`): due ≥ bill date, GST ≤ total. |
| `payVendorBillAction` | `:194-220` | `rpc('pay_vendor_bill')`. |
| `removeBillPaymentAction` / `removeVendorBillAction` | `:222-242` | reason 3–500; RPCs. |

### 9.3 Database (`20261112000008_purchases_vendors.sql`)

* `vendors` (`:36-52`), unique name case-insensitively.
* `purchase_orders` + items + `po_number_counters` (`:58-107`).
* `guard_purchase_order` (`:111-186`): states `draft → issued → received`, `draft|issued → cancelled`
  (reason). Issue needs items and a total; number `PO/YY-YY/NNNN` from **order_date**'s FY.
  Issued orders lock vendor, title, date, totals, place of supply (notes/terms/delivery
  address/expected date stay editable by plain update). Place of supply defaults to the
  vendor's state. GST split uses the same `apply_gst_split` against the company state (`:188-189`).
* `save_purchase_order` (`:193-236`): drafts only, recomputes totals.
* `vendor_bills` (`:242-270`): entered total (incl. GST) and GST amount; `amount_paid` written
  only by the RPCs; one live bill number per vendor; soft delete.
* `vendor_bill_payments` (`:272-287`), soft delete.
* Status is derived: `vendor_bill_status` unpaid / part_paid / paid (`:290-295`, app copy
  `purchaseSchema.ts:17-19`).
* `pay_vendor_bill` (`:360-404`): locks bill; amount ≤ balance; date not future; active
  account; inserts payment, bumps `amount_paid`, files an expense
  `source='vendor_bill', source_id=<payment id>` with the bill's category, department, file.
* `remove_vendor_bill_payment` (`:407-437`): marks payment removed, decrements `amount_paid`,
  marks its expense removed.
* `remove_vendor_bill` (`:440-459`): unpaid only.
* Reminder `vendor_bill_due` 3 days before due, 09:05 IST, to `purchases.manage` (`:462-484`).
* RLS: all on `can_manage_purchases()`; vendors, bills and bill payments also readable with
  ledger access (`:515-534`). Audit on vendors, orders, bills, bill payments (`:499-506`).

### 9.4 Service — `src/server/services/purchaseService.ts`

`listVendorBills` filters derived statuses in Node after reading up to 5000 rows
(`:100-126`); `getPayablesSummary` owed / overdue / due this week (`:153-165`);
`getBillOptions` hides system categories (`:214-216`).

---

## 10. Salaries and reimbursements (Finance's side)

### 10.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/finance/salaries` | `src/app/(crm)/finance/salaries/page.tsx` | `reimbursements.pay` (`:45`) | Tab **Salaries**: payroll runs in review/approved with Review/Pay links for `payroll.approve` (`:81-114`), paid runs by year. Tab **Reimbursements**: approved / paid / submitted claims. |
| `/finance/salaries/reimbursements/[claimId]/pay` | `…/reimbursements/[claimId]/pay/page.tsx` | `reimbursements.pay` (`:17`), approved only (`:21`) | Pay form. |
| `/finance/salaries/export` | `…/salaries/export/route.ts` | `reimbursements.pay` (`:12`) | CSV of claims (all pages, `:20-24`) or paid runs. |
| `/reimbursements`, `/new`, `/[claimId]` | `src/app/(crm)/reimbursements/**` | `reimbursements.submit` (list/new); detail `requireAccess` + RLS (`[claimId]/page.tsx:26-35`) | Employee side: claim, cancel, see decision/history; deciders approve/reject. |

### 10.2 Actions — `src/server/actions/reimbursementActions.ts`

`submitClaimAction` (`:19-50`), `cancelClaimAction` (`:52-60`, `.eq('status','submitted')`
and row check), `decideClaimAction` (`:64-75`, no permission key in app because reporting
managers may decide regardless of role; DB decides), `payClaimAction` (`:77-100`).
Schemas: `src/lib/validation/reimbursementSchema.ts:17-43` (amount ≤ 99 99 999, rounded).

### 10.3 Database (`20261112000009_salaries_reimbursements.sql`)

* `reimbursements` (`:52-75`), statuses `submitted → approved|rejected → paid`, or
  `submitted → cancelled` by the claimant (`:133-136`).
* `guard_reimbursement` (`:103-142`): claimant forced to self; active expense category;
  expense date not future; receipt must be the claimant's own file; all other changes only
  through trusted RPCs.
* `can_decide_reimbursement` — reporting manager or `reimbursements.approve` reach, never own
  (`:79-87`).
* `decide_reimbursement` (`:238-276`) and `pay_reimbursement` (`:278-316`; blocked if a draft
  settlement already includes reimbursements, `:293-295`); paying files an expense
  `source='reimbursement'` under the claim's category with the employee's department.
* `approval_history` written by trigger on every status change (`:148-205`), read via
  `get_approval_history` (`:208-232`).
* Settlements: `get_settlement_suggestion` adds approved claims (`:346-429`);
  `mark_settlement_paid` marks the employee's approved claims paid and files a single
  settlement expense (`:433-477`).
* Notifications: `reimbursement_submitted` (approvers + manager, `:318-340`),
  `reimbursement_decided`, `reimbursement_paid`, and "ready to pay" to payers.
* File access for receipts/bills widened in `can_view_file_row` (`:485-552`).

---

## 11. Budgets

### 11.1 Routes (`budgets.manage`)

`/finance/budgets` (`src/app/(crm)/finance/budgets/page.tsx:41`, usage table with state
ok / warning ≥ 80 % / over ≥ 100 %, `budgetService.ts:25-27`), `/finance/budgets/new`,
`/finance/budgets/[id]/edit`.

### 11.2 Actions — `src/server/actions/budgetActions.ts`

`saveBudgetAction` (`:13-36`): `budgetSchema` (`src/lib/validation/budgetSchema.ts:8-40`)
— month `YYYY-MM` or FY start year `20YY`, converted to `period_start` (1st of month or
1 April). Unique (department, kind, start) → friendly message. `deleteBudgetAction`
(`:38-46`) with `.select('id')` row check.

### 11.3 Database (`20261113000002_profit_loss_budgets.sql`)

* `department_budgets` (`:64-79`) with a check that the start is the 1st and, for years, April.
* `budget_spent` = live expenses with that department in the period (`:96-103`).
* `get_budget_usage(from, to)` (`:106-127`): every budget whose period overlaps, with spent,
  remaining, utilisation (1 dp).
* Alerts: `budget_alerts` remembers 80/100 % sent (`:82-87`); `check_budget_alerts`
  (`:150-196`) clears alerts that no longer apply, sends one `budget_alert` per new threshold
  to `budgets.manage` holders and the department head (`/overview` link), using
  `notify_budget` which deliberately also notifies the actor (`:129-146`). Triggered after
  expense insert/update of amount/department/date/deleted_at (`:198-215`) and budget changes
  (`:217-228`).

**Budget vs actual** therefore counts only expenses that carry a `department_id`: manual
expenses with a department, vendor bill payments with the bill's department, and
reimbursements (employee's department). Payroll and settlement expenses have no department
(`record_system_expense`, `20261112000005_finance_ledger.sql:304-307`), so salaries never
count against a department budget.

---

## 12. Profit and loss, dashboard, reports

### 12.1 Routes

| URL | File | Permission | What it does |
|---|---|---|---|
| `/finance` | `src/app/(crm)/finance/page.tsx` | `finance.dashboard` (`:36`) | Tiles: income / expenses / net (ledger holders) or invoice income (others) (`:45-52`); receivables; payables (bills + approved claims), cash, bank, payroll this month (`:53-70`); charts: income vs expenses, profit by month, revenue line, month-end cash, expenses by department, ageing (`:100-173`). |
| `/finance/profit-loss` | `…/profit-loss/page.tsx` | `ledger.manage` (`:28`) | Statement vs previous period vs same period last year; monthly; departments. |
| `/finance/profit-loss/export` | `…/profit-loss/export/route.ts` | `ledger.manage` (`:13`) | CSV. |
| `/finance/profit-loss/print` | `src/app/(print)/finance/profit-loss/print/page.tsx` | `ledger.manage` (`:17`) | Printable statement (`ProfitLossStatement.tsx`). |
| `/finance/reports` | `…/reports/page.tsx` | `finance.reports` (`:25`) | GST by month, top clients, ageing, export link. |
| `/finance/export` | `…/finance/export/route.ts` | `finance.reports` (`:13`) | Accountant's invoice CSV: every non-draft invoice in range; cancelled rows zeroed but listed (`:38-45`); cells via `csvCell` (formula-safe). |
| `/settings/finance` | `src/app/(crm)/settings/finance/page.tsx` | `finance.manage` (`:13`) | `FinanceSettingsForm`. |

### 12.2 P&L computation

`get_profit_loss(from, to)` (`20261113000002_profit_loss_budgets.sql:27-51`), **invoker
rights**, requires ledger access. From `money_movements`:

* section = `revenue` if direction in; `salaries` if the category's `system_key` is
  `salaries` or `settlements`; else `operating`;
* label = "Invoice payments" for invoice payments, else category name;
* department only for out-flows;
* grouped by month.

`buildStatement` (`src/lib/finance/profitLoss.ts:39-47`) sums in paise; net = revenue −
(salaries + operating). Comparison periods from `previousRange` / `sameRangeLastYear`
(`profitLossService.ts:20-32`). The dashboard also computes month-end cash by calling
`get_account_balances(end)` once per month (`profitLossService.ts:56-64`).

`getFinanceOverview` gates each figure on permissions (`profitLossService.ts:43-82`) so that
nobody sees a "half-true" total; the invoice part still depends on invoice RLS.

### 12.3 Finance settings action

`saveFinanceSettingsAction` (`src/server/actions/financeActions.ts:19-110`): `finance.manage`;
`financeSettingsSchema` (`financeSchema.ts:228-309`: GSTIN/PAN/IFSC/SWIFT/UPI regexes,
prefixes 1–5 chars (quotation 1–8), next quotation number 1–999999, tax ≤ 40, terms days
0–365, validity 1–365); update `.eq('id', true).select('id')` with row check (`:66-99`);
then, if changed relative to the value the form loaded with, `rpc('set_next_quotation_number')`
(`:101-106`). RLS: update requires `finance.manage` at organisation scope
(`20261109000011_finance.sql:1078-1080`); audited by `finance_settings_audit` (`:1054-1055`).

---

## 13. Printable documents

`src/app/(print)/` is outside the app shell so the browser print / Save as PDF contains only
the document (`docs/SystemArchitecture.md:133`).

| Page | Component | Notes |
|---|---|---|
| `(print)/quotations/[quotationId]/print/page.tsx` | `PrintableDocument` | DRAFT stamp until final; terms with valid-until. |
| `(print)/invoices/[invoiceId]/print/page.tsx` | `PrintableDocument` | "Tax invoice" once issued (`:46,65`); title becomes file name (`:16-23`). |
| `(print)/receipts/[paymentId]/print/page.tsx` | `ReceiptPrint` | sign/seal via query string. |
| `(print)/purchase-orders/[orderId]/print/page.tsx` | (PO layout) | `purchases.manage`. |
| `(print)/finance/profit-loss/print/page.tsx` | `ProfitLossStatement` | `ledger.manage`. |

`PrintableDocument.tsx` (425 lines) renders seller block from **current** `finance_settings`,
bill-to, place of supply + state code (`:253`), lines with HSN/SAC, CGST/SGST or IGST
(`:371-379`), amount in words (`:365`), bank/UPI block (`:133-158`), signature/seal block
(`:99-113`). `PrintLayoutFit.tsx` scales the page to fit; `PrintButton.tsx` calls print.

---

## 14. Migrations in order (finance-relevant)

| Migration | What it adds |
|---|---|
| `20261109000010_phase5_notification_kinds.sql` | `payment_received`, `invoice_overdue` |
| `20261109000011_finance.sql` | settings, quotations, invoices, items, payments, counters, GST/guard/payment triggers, save RPCs, conversion, notifications, overdue cron, audit labels, timeline money filter, RLS |
| `20261109000012_phase5_access.sql` | permissions, role grants, table/function grants, live updates |
| `20261109000013_team_access.sql` | `client_in_finance_reach`: finance users see the clients they bill (`:274-308`) |
| `20261111000004_hr_finance_foundation.sql` | `finance.dashboard`, second role / acting role |
| `20261112000005_finance_ledger.sql` | categories, bank accounts, income/expense, money_movements, balances, statements, payroll/settlement expense filing |
| `20261112000006_finance_notification_kinds.sql` | due soon, follow-up, vendor bill, reimbursement kinds |
| `20261112000007_follow_ups_receipts.sql` | follow-ups, receipts, morning reminders |
| `20261112000008_purchases_vendors.sql` | vendors, POs, bills, bill payments, reminders |
| `20261112000009_salaries_reimbursements.sql` | reimbursements, approval history, settlement link, file access |
| `20261113000002_profit_loss_budgets.sql` | `get_profit_loss`, budgets, alerts |
| `20261113000010_service_prices.sql` | price list on services |
| `20261113000014_signatures_pins_service_items.sql` | signatures/seals, item service details, company details seed |
| `20261113000015_fewer_calls_payment_details.sql` | bank/UPI payment details on settings |
| `20261114000001_client_service_plans.sql` | client plan per sub service |
| `20261114000004_upi_qr_quotation_terms.sql` | QR seed, default quotation terms |
| `20261114000006_quotation_final_invoice_sent.sql` | `final` status, invoice `sent_at`, `mark_invoice_sent` |
| `20261114000007_document_overview.sql` | overview column, guard, copy |
| `20261116000002_quotation_numbering.sql` | quotation prefix and settable counter |

Tests touching this area: `tests/financeHelpers.test.ts`, `phase5Rules.test.ts`,
`financeLedger.test.ts`, `followUpsReceipts.test.ts`, `purchasesVendors.test.ts`,
`reimbursements.test.ts`, `profitLossBudgets.test.ts`, `quotationFinalStep.test.ts`,
`quotationNumberingWorkload.test.ts`, `quotationTerms.test.ts`, `documentOverview*.test.ts`,
`documentSignatureRules.test.ts`, `hrFinanceFoundation.test.ts`.

---

## 15. Observations

Severity: **High** = can produce wrong money/numbers or block work; **Medium** = wrong
figures in some cases or a rule gap; **Low** = consistency/maintainability. "Possible" means
reasoned from code, not reproduced.

### 15.1 Numbering

1. **High — `lpad(n, 4, '0')` truncates numbers above 9999.** Postgres `lpad` truncates
   strings longer than the target length, so number 10000 becomes `1000`.
   * Quotations: `20261116000002_quotation_numbering.sql:37`. The settings form lets the
     owner set the next number up to 999999 (`financeSchema.ts:272-277`,
     `…quotation_numbering.sql:75-77`). Setting e.g. 12345 produces `QUO-1234`; if that
     number already exists the loop at `:36-40` keeps incrementing, and every value from
     10000 to 19999 maps to `1000`–`1999`. Once those are used the loop can spin a long way
     (up to the 999999 check constraint, after which the counter update at `:41` fails).
   * Invoices `20261109000011_finance.sql:513`, receipts `20261112000007_follow_ups_receipts.sql:145`,
     POs `20261112000008_purchases_vendors.sql:162`: the 10 000th document of a financial year
     would get a duplicate number and fail the `unique` constraint, blocking issuing or
     payments. Unlikely at current volumes for invoices, but immediately reachable for
     quotations through the settings field. Fix: `lpad(n::text, greatest(4, length(n::text)), '0')`.
2. **Medium — quotation numbers are spent by autosave.** A number is assigned on insert
   (`…quotation_numbering.sql:47-49`), and the form inserts the draft on the first autosave
   (`FinanceDocumentForm.tsx:197-225`). Abandoned or deleted drafts (`quotationActions.ts:107-116`)
   leave gaps. Not a legal problem for quotations, but contrasts with invoices, which number
   on issue (`20261109000011_finance.sql:102`).
3. **Medium — receipt numbers have gaps after a payment is removed.** `removePaymentAction`
   hard-deletes the payment (`invoiceActions.ts:165`, policy `20261109000011_finance.sql:1114-1115`),
   so its receipt number (already printed and possibly given to the client) vanishes from the
   series. The ledger elsewhere follows "never deleted, only marked removed"
   (`20261112000005_finance_ledger.sql:10-11`); payments are the exception.
4. **Low — back-dated issue dates can break chronological order.** The number is taken from
   the `issue_date`'s FY (`20261109000011_finance.sql:505-511`), and a past issue date is
   allowed, so an invoice dated 31 March issued on 2 April enters the old year's series after
   later-dated invoices. Same for POs (order date, `…purchases_vendors.sql:157`) and receipts
   (payment date).
5. **Low — stale comment.** Print page comment says names look like `INV-2026-27-0004`
   (`src/app/(print)/invoices/[invoiceId]/print/page.tsx:16`); the real format is
   `INV/26-27/0004`.

### 15.2 Money and rounding

6. **Medium — float sums outside the paise helpers.** The library is careful
   (`documentTotals.ts:44-47`, `profitLoss.ts:23-24`), but several services add raw floats:
   `getLedgerSummary` (`ledgerService.ts:173-178`), `getPayablesSummary`
   (`purchaseService.ts:158`), `getClaimTotals`/`getMyClaimTotals`
   (`reimbursementService.ts:41,108`), follow-up totals (`followUpService.ts:66-67`), month-end
   cash and cash/bank tiles (`profitLossService.ts:61,68-69`), paid salaries total
   (`finance/salaries/page.tsx:83`). Display is rounded to 2 dp, so visible errors are rare,
   but `getClientBalance` passes `total - amount_paid` (a float subtraction) into `sumMoney`
   (`invoiceService.ts:69-70`) — harmless after rounding, but inconsistent.
7. **Low — silent rounding of user amounts.** Ledger, purchase, budget and claim schemas
   round to 2 dp (`ledgerSchema.ts:22`, `purchaseSchema.ts:52`, `budgetSchema.ts:19`,
   `reimbursementSchema.ts:26`) and accept anything `Number()` accepts (e.g. `1e5`), while
   the quotation/invoice/payment schema rejects more than 2 decimals with a regex
   (`financeSchema.ts:67-73`). Two different rules for money input.
8. **Low — GST computed per line, not per rate group.** `line_tax_amount` rounds each line
   (`20261109000011_finance.sql:193-198`). This is accepted GST practice but can differ by a
   few paise from an invoice-level calculation; worth stating on the accountant export.
9. **Medium (possible) — GST split depends on free-text state names.** Inter-state is
   decided by comparing `finance_settings.state` with `place_of_supply` as trimmed,
   lower-cased text (`20261109000011_finance.sql:219-220`). A blank company state or blank
   place of supply silently means intra-state (CGST+SGST). Values entered outside the
   `indianStates` dropdown (`stateOptionsWith`, `indianStates.ts:47-50`) or the vendor's free
   text `state` (`purchaseSchema.ts:75`) can mis-classify. Comparing GST state codes would be
   safer.
10. **Low (possible) — split recomputed on sent quotations.** `apply_gst_split` recomputes
    `is_inter_state` while the old status is `sent` or `declined`
    (`20261109000011_finance.sql:217`), and was not updated when `final` was added. A status
    change on a sent quotation after the company state changed would change its tax split
    even though the content is locked.
11. **Low — seller details are not snapshotted.** Prints read the current
    `finance_settings` and the signer's current signature
    (`(print)/invoices/[invoiceId]/print/page.tsx:38-40`, `signatureService.ts:48-65`), so
    reprinting an issued tax invoice after a change of address, GSTIN, bank or signature shows
    the new details.

### 15.3 Concurrency and atomicity

12. **Medium — save + overview are two transactions.** `save_quotation`/`save_invoice` and
    the overview update are separate calls (`quotationActions.ts:46-55`,
    `invoiceActions.ts:47-56`). If the second fails (for example the document left draft in
    between), the content is saved but the action reports an error; the update result is not
    checked for zero rows either (`:54`/`:55` only check `error`). Each autosave also writes
    two audit rows.
13. **Medium (possible) — duplicate drafts from autosave racing the submit.** If the first
    autosave (which creates the draft) is still in flight when the user presses Save, the
    submitted `FormData` still has an empty `documentId` (`FinanceDocumentForm.tsx:188,211-214,329`),
    so the server creates a second document (and, for quotations, a second number).
    `submitted.current` only stops new autosaves, not the in-flight one.
14. **Low — primary bank account switch is not atomic.** The old primary is demoted in a
    separate update whose result is ignored (`ledgerActions.ts:150-152`); if the main update
    then fails (e.g. duplicate name), the company has no primary account, and invoice payments
    without an account move to the cash account in every balance (see 17).
15. **Low — settings and next quotation number are two writes.** `financeActions.ts:66-106`.
16. **Good:** concurrent payment inserts lock the invoice (`20261109000011_finance.sql:558`);
    counters use row locks via upsert; vendor bill payments lock the bill
    (`…purchases_vendors.sql:374`); quotation counter is locked `FOR UPDATE`
    (`…quotation_numbering.sql:34`).

### 15.4 Ledger, P&L, budgets

17. **Medium — invoice payments have no account in practice, and their account moves.**
    The payment form never sends `bank_account_id` (`invoiceActions.ts:147-154`,
    `invoices/[invoiceId]/page.tsx:186-191`), and `money_movements` resolves a missing
    account with `account_or_default(null)` at **read time**
    (`20261112000005_finance_ledger.sql:399`). Changing the primary account re-files every
    past invoice payment into the new account, changing historical balances and reconciliation
    matches.
18. **Medium (possible) — P&L, transactions and follow-ups are filtered by invoice access.**
    `get_profit_loss`, `get_money_movements` and `get_follow_up_board` are not security
    definer (`…profit_loss_budgets.sql:29`, `…finance_ledger.sql:430`,
    `…follow_ups_receipts.sql:80`), so invoice payments only appear if the viewer also passes
    `can_view_invoice`. A role given `ledger.manage` without organisation-wide `invoices.view`
    would see revenue understated; a role with `followups.manage` (described as "See every
    unpaid invoice", `…follow_ups_receipts.sql:13-14`) but not `invoices.view` gets an empty
    board. Seeded roles hold both, so this only bites custom roles. Meanwhile
    `get_account_balances` is security definer (`…finance_ledger.sql:468`), so balances and
    transactions can disagree for the same user.
19. **Medium (possible) — settlement marks claims paid that it did not include.**
    `mark_settlement_paid` marks **all** of the employee's currently approved claims as paid
    (`20261112000009_salaries_reimbursements.sql:464-471`), not the amount captured in
    `reimbursements_due`. A claim approved after the settlement was drafted is marked paid
    without being paid.
20. **Low — salaries never hit department budgets or department P&L.** Payroll and
    settlement expenses carry no department (`…finance_ledger.sql:304-307`), so they show as
    "No department" (`profitLoss.ts:64`) and are excluded from `budget_spent`
    (`…profit_loss_budgets.sql:96-103`).
21. **Low — claims can use system categories at the database level.** The form hides them
    (`reimbursementService.ts:121-123`), but `guard_reimbursement` only checks
    `kind='expense' and is_active` (`…salaries_reimbursements.sql:117`). A claim filed under
    "Salaries" would land in the P&L salaries section when paid.
22. **Low — calendar year vs financial year.** The ledger summary uses Jan–Dec
    (`ledgerService.ts:166-167`) and the salaries page a calendar year (`reimbursementService.ts:153-161`),
    while every other report uses April–March (`financialPeriods.ts`).
23. **Low — silent export caps.** Ledger export reads at most 10 000 rows
    (`ledgerService.ts:49,75`); bill status filters read at most 5000 bills and then page
    in Node (`purchaseService.ts:111,122-125`); transactions export 100 000. No truncation
    warning.
24. **Low — statement lines cannot be removed.** There is no delete policy or RPC for
    `bank_statement_lines` (`…finance_ledger.sql:691-692,706`); a wrong CSV import can only
    be left unmatched. The import itself is not in `audit_logs` (only `matched_id` changes are,
    `:654-655`).
25. **Low (possible) — CSV sign handling.** `parseStatementCsv` treats a lone `amount` column
    as signed (`parseStatementCsv.ts:91`); banks that export a positive amount plus a separate
    "Dr/Cr" type column will import every debit as money in. With both debit and credit
    present on one row it nets them (`:93-95`).
26. **Low — vendor bill edits after payment do not re-file expenses.** Changing a paid bill's
    category or department (`purchaseActions.ts:183-185`, allowed by
    `…purchases_vendors.sql:318-330`) leaves earlier payment expenses under the old
    category/department. A bill's `purchase_order_id` is not checked to belong to the same
    vendor (`…purchases_vendors.sql:245`, `purchaseSchema.ts:100`).

### 15.5 Access, audit and CLAUDE.md rules

27. **Hardcoded role checks:** none found in app code (searched `src/app/(crm)/finance`,
    invoices, quotations, reimbursements, print, finance components, services and actions).
    Role names appear only in migrations that seed grants (e.g.
    `20261109000012_phase5_access.sql:20-40`), which is data, consistent with
    `docs/SystemArchitecture.md:61`.
28. **Fake buttons:** every finance action is wired to a form or page
    (checked: delete vendor, categories, match/unmatch, import, bill/order/claim actions,
    mark sent, create invoice). The CRM "follow-ups" widget is a different feature, not a
    fake.
29. **`.select()` row checks:** consistently used for updates/deletes, with two gaps:
    * overview updates check `error` only (`quotationActions.ts:54`, `invoiceActions.ts:55`);
    * primary-account demotion ignores the result (`ledgerActions.ts:151`).
    `recordPaymentAction` inserts without `.select()` (`invoiceActions.ts:147-155`); a refused
    insert raises under RLS, so this is acceptable. RPC-based actions rely on the RPCs raising.
30. **Audit coverage:** good via triggers on every finance table. Gaps: item rows
    (`quotation_items`, `invoice_items`, `purchase_order_items`) have no audit, so the log shows
    totals changing but not which lines; statement imports are not logged (24); CSV exports of
    financial data (`/finance/export`, ledger, transactions, salaries, follow-ups, P&L) write no
    audit entry — arguably an "important action" under CLAUDE.md; receipt printing with a
    chosen signature is not logged.
31. **Low — payment delete policy has no reach check.** `payments_delete` needs only
    `payments.record` (`20261109000011_finance.sql:1114-1115`), unlike insert, which also needs
    `can_view_invoice` (`:1112-1113`). Postgres also applies SELECT policies to rows a DELETE
    reads, which limits this in practice (possible). `removePaymentAction` does not check
    that `paymentId` belongs to `invoiceId` (`invoiceActions.ts:161-165`).
32. **Low — page vs DB permission mismatch.** The DB treats `*.manage` as implying view
    (`can_view_*_row`, `20261109000011_finance.sql:269-275,291-297`), but pages and nav require
    `quotations.view` / `invoices.view` (`quotations/page.tsx:31`, `invoices/page.tsx:32`,
    `navigationRegistry.ts:121-122`). A custom role with manage only cannot open the lists.
    Similarly `finance.dashboard` does not imply invoice access, so the receivables tiles can
    read zero for such a role (`finance/page.tsx:51-52`, `financeService.ts:85-114`).
33. **Low — `changeQuotationStatusAction` and invoice issue/cancel/delete skip
    `getActionAccess`** (`quotationActions.ts:84-86`, `invoiceActions.ts:78-131`). The database
    still refuses, but the user gets the generic "no permission" message instead of an early,
    specific one, unlike every other action in the module.
34. **Low — migrations overwrite owner data and contain company details.**
    `20261114000004_upi_qr_quotation_terms.sql:13-18` sets `quotation_terms` with no `where`
    clause, overwriting whatever was configured when it runs (relevant for Supabase, where
    `npm run db:supabase` applies it later). `20261113000015_fewer_calls_payment_details.sql:113-120`
    and `20261113000014_…:30-36` commit real bank/UPI/company details to the repository
    (only filling empty fields).
35. **Low — `finance.dashboard` shares `sort_order` 1050 with `finance.reports`**
    (`20261111000004_hr_finance_foundation.sql:30`, `20261109000012_phase5_access.sql:9`),
    so their order on the roles screen is undefined.
36. **Low — fragile trigger ordering.** Correct "paid in full" notifications and receipt
    numbering depend on alphabetical trigger names (`payments_notify` before
    `payments_refresh_invoice`; `payments_guard` before `payments_number_receipt`;
    `quotations_assign_number` before `quotations_guard`, noted at
    `…quotation_numbering.sql:47`). Renaming a trigger would change behaviour silently.
37. **Low — vendor bills and P&L: GST on purchases is an expense.** Vendor bill payments are
    filed at the gross amount including GST (`…purchases_vendors.sql:249-251,400-401`); there
    is no input-tax-credit tracking, so P&L expenses include recoverable GST. A design limit,
    not a bug, but worth stating to the accountant.


# Chapter 7 — The database

Scope: all 69 SQL files in `database/migrations/` (20261106000000 to 20261116000004), `database/platform/supabase_platform.sql`, and the generated types in `src/types/databaseTypes.ts`. Background reading: `CLAUDE.md`, `docs/DatabaseSchema.md`, `docs/PermissionMatrix.md`.

All references are repo-relative `file:line`. Line numbers count physical lines, blank lines included. In tables, `…/<file>:<line>` means `database/migrations/<file>:<line>`. Anything not checked against the running database is marked **possible**.

---

## 0. The design in brief

- **One Postgres schema, two hosts.** Local development uses PGlite (embedded Postgres, `.data/database`). The live site uses Supabase. The same migrations run on both. Only the first file differs: `20261106000000_local_platform.sql` runs locally, and `database/platform/supabase_platform.sql` runs in its place on Supabase (`src/server/database/migrationRunner.ts:12-29`). On Supabase, the runner also rewrites `references auth.users` to `references app_auth.users`.
- **Row level security does the access control.** Every user query runs as the Postgres role `authenticated`, with `request.jwt.claim.sub` set to the login id (`src/server/database/sqlDatabase.ts:29`). `auth.uid()` reads that setting, and `current_employee_id()` maps it to an active employee. All policies are built from permission-check functions, not role names.
- **Triggers enforce the business rules.** Each table with a workflow has a BEFORE trigger guard (state machine, columns that cannot change, stamping). Audit triggers write to `audit_logs`. Notification triggers call `notify()`, and push is sent from `private.dispatch_notification()` through `net.http_post`.
- **"Trusted" writes.** A SECURITY DEFINER function turns on a transaction-local setting (`app.trusted_*`, `app.finance_internal`), and the guard lets the write through. Guards also skip when `auth.uid()` is null (system, cron or admin client) and, in some guards, when `pg_trigger_depth() > 1`.
- **Closing `anon`.** Default privileges give ALL on every new public object to `anon`, `authenticated` and `service_role` (`…/20261106000000_local_platform.sql:19-21`; `database/platform/supabase_platform.sql:9-11`). Almost every migration then ends with `revoke all … from anon; revoke execute on all functions … from public, anon;` and grants `authenticated` only what it needs.
- **Scale:** 103 public tables, 1 view, about 217 RPC/function signatures and 43 enums in the generated types (`src/types/databaseTypes.ts:8`, `:6039`, `:6093`, `:7304`). There are also 6 tables in `app_auth`, 1 in `private`, and platform shims in `auth`, `storage`, `cron`, `net` and `realtime`.

---

## 1. Migration timeline

| # | File | What it adds or changes |
|---|---|---|
| 1 | `20261106000000_local_platform.sql` | **Local only.** Creates the roles `anon`, `authenticated` and `service_role` (BYPASSRLS), and default privileges. Adds shims for `auth` (users, sessions, one_time_tokens, outgoing_emails, `auth.uid()`), `storage` (buckets, objects), `cron` (job, `schedule`, `unschedule`), `net` (http_request_queue, `http_post`), the `live_updates` publication with `live.broadcast_change()`, and `realtime.messages` with `realtime.topic()`. |
| 2 | `20261106000001_organisation_foundation.sql` | Departments, designations, roles, permissions, role_permissions, employees and the immutable audit_logs. Enums `permission_scope` and `employment_status`. Access helpers (`current_employee_id`, `permission_scope_for`, `has_permission`, `can_access_employee`, `role_is_assignable`, …), guards on employee fields, cycle prevention, the "keep a role administrator" constraint triggers, `audit_row_change()`, RLS and grants. |
| 3 | `20261106000002_organisation_starting_data.sql` | Seeds 13 permissions, 8 roles (Founder protected), 6 departments, 8 designations and the first role matrix. |
| 4 | `20261106000003_clients_and_projects.sql` | Clients, client_records, client_services, projects, project_members and project_milestones. View and update helpers, `stamp_created_by`, completion stamping, RLS. No grants in this file. |
| 5 | `20261106000004_tasks.sql` | Tasks (subtasks, reviewer, escalation, recurrence), collaborators, dependencies, checklist and comments. Assignment rules, insert and update guards (the task state machine), dependency cycle guard, the next run of recurring tasks, RLS. |
| 6 | `20261106000005_phase2_access_and_reporting.sql` | Seeds client, project, task and workload permissions. Adds `audit_logs.client_id` and a rewritten `audit_row_change`, audit triggers, `get_client_timeline`, `get_task_history`, `get_client_labels`, `get_project_progress`, `get_workload_rows`. Closes anon and grants. Puts tasks and task_comments in `live_updates`. |
| 7 | `20261109000001_files.sql` | Files, file_versions, file_shares, file_access_logs and file_comments. `can_view_file_row`, signed-upload helpers, `finalize_file_version`, `record_file_access`, the private `files` bucket (50 MB, MIME allow-list) and policies on `storage.objects`. |
| 8 | `20261109000002_messaging.sql` | Conversations of six kinds, members, read positions, messages and mentions. Linked channels created automatically, with a backfill. Direct and group RPCs, `get_my_conversations`, message guards, Realtime channel policies. |
| 9 | `20261109000003_notifications.sql` | Notifications, notification_preferences and push_subscriptions. `notify()`, task, comment, file-share and message notifier triggers. The `private` schema with `app_settings` and `dispatch_notification`. The `process-task-deadlines` cron job (15 min). |
| 10 | `20261109000004_phase3_access.sql` | Seeds the files and messages permissions. Grants. Locks down `notify`, `process_task_deadlines` and `configure_notification_dispatch`. Puts messages, conversation_reads and notifications in `live_updates`. |
| 11 | `20261109000005_phase4_notification_kinds.sql` | `notification_kind` gains meeting_*, leave_requested/decided and ticket_raised/updated. |
| 12 | `20261109000006_leave_and_attendance.sql` | company_settings (one row), holidays, leave_types (seeded), leave_requests and attendance_records. Working-day maths, balance RPCs, check-in and check-out, `import_attendance`, the report RPC, guards and RLS. |
| 13 | `20261109000007_meetings.sql` | Meetings and meeting_participants, `tasks.meeting_id`, guards, notifications. Cron `send-meeting-reminders` (5 min). |
| 14 | `20261109000008_support_tickets.sql` | ticket_categories (7 seeded), tickets (TKT-0001) and ticket_comments, the ticket workflow, notifications. `files.meeting_id` and `files.ticket_id`. A wider `can_view_file_row`. |
| 15 | `20261109000009_phase4_access.sql` | Seeds the leave, attendance, HR, meetings and tickets permissions and their role grants. Grants. Puts tickets in `live_updates`. |
| 16 | `20261109000010_phase5_notification_kinds.sql` | Adds the kinds `payment_received` and `invoice_overdue`. |
| 17 | `20261109000011_finance.sql` | finance_settings, client GSTIN and billing state, quotations, quotation_items, invoices, invoice_items, invoice_number_counters and payments. GST split trigger, `finance_reach`, save RPCs, payment guards, numbering per financial year. Cron `send-invoice-overdue-reminders` (hourly). |
| 18 | `20261109000012_phase5_access.sql` | Seeds 7 finance permissions and their role grants. Grants. Puts quotations and invoices in `live_updates`. |
| 19 | `20261109000013_team_access.sql` | `roles.is_default` (Employee). Directory helpers (`can_view_employee_profile`, `get_directory_employee_ids`), employee creation with team scope, `employees_select` opened to every active employee, `client_in_finance_reach`. |
| 20 | `20261109000014_service_catalog.sql` | service_groups, services and industries (seeded), `clients.industry_id`, `client_services.service_id`, `set_client_services`, permission `catalog.manage`. |
| 21 | `20261109000015_keep_typed_services.sql` | `set_client_services` keeps typed (unlinked) services. |
| 22 | `20261109000016_my_workload.sql` | `get_my_workload_rows()`. |
| 23 | `20261110000001_app_auth_schema.sql` | Moves the sign-in tables from `auth` to `app_auth` (locally) and adds `app_auth.sign_in_attempts`. |
| 24 | `20261110000002_google_sign_in.sql` | `app_auth.user_identities` (link to a Google account). |
| 25 | `20261110000003_task_rescheduled_kind.sql` | Adds the kind `task_rescheduled`. |
| 26 | `20261110000004_task_oversight_and_calendar.sql` | The assignee may move their own deadline. Rescheduled notifications. Client Manager `workload.view` becomes org. Employee loses `employees.view`. |
| 27 | `20261111000001_chat_status_reviewers.sql` | Message contact cards, polls and events. `message_poll_votes`. `employee_presence` with `presence_status`. `vote_in_poll`, `post_conversation_event`, the reviewer check (`tasks.manage`). |
| 28 | `20261111000002_chat_actions_task_times.sql` | `tasks.due_time`, `messages.forwarded`, message_reads, message_stars and message_hidden. Message info. Edit or delete within 5 minutes. |
| 29 | `20261111000003_chat_clear_and_leave.sql` | `clear_conversation_for_me` and `leave_group`. |
| 30 | `20261111000004_hr_finance_foundation.sql` | The Human Resource role, `hr.dashboard` and `finance.dashboard`. Extra roles and the "acting" role (`employee_extra_roles`, `employees.acting_role_id`, `current_role_id()`). Leave approval goes to HR only. `get_hr_dashboard`. |
| 31 | `20261111000005_employee_record.sql` | employment_types, employee_personal_details and employee_private_details (encrypted Aadhaar and account number). Probation. Employee documents as files. Reveal audit, employment history, birthdays. `employees.private_view`. |
| 32 | `20261111000006_attendance_leave.sql` | Work mode and day-status override, attendance_breaks, overtime and half-day thresholds, holiday kind, leave carry-forward (cron `carry-forward-leave`), encashable leave, the utilisation report. |
| 33 | `20261112000001_hr_notification_kinds.sql` | Kinds for payroll, recruitment and resignation. |
| 34 | `20261112000002_payroll.sql` | salary_components, payroll_rules (PF, ESI, PT, TDS), salary_structures, salary_revisions, appraisals, payroll_runs and payroll_lines. The payslip calculation, the run workflow, payslip visibility. Permissions `payroll.manage`, `payroll.approve` and `payslips.view`. |
| 35 | `20261112000003_recruitment.sql` | job_openings, candidates, interviews (each with a meeting), letter_templates, onboarding_items, onboarding_tasks and candidate files. Cron `send-interview-reminders`. `recruitment.manage`. |
| 36 | `20261112000004_exit_management.sql` | resignations, exit_checklist_items, exit_tasks and final_settlements. `decide_resignation`, cron `process-exits` (deactivates leavers and blocks their sign-in). `exits.manage` and `resignation.submit`. |
| 37 | `20261112000005_finance_ledger.sql` | finance_categories, bank_accounts, income_records, expense_records, bank_statement_lines and the view `money_movements`. Balances, statement import and matching. Payroll and settlement post expenses automatically. `ledger.manage` and `banks.manage`. |
| 38 | `20261112000006_finance_notification_kinds.sql` | Kinds for invoice due, follow-ups, vendor bills and reimbursements. |
| 39 | `20261112000007_follow_ups_receipts.sql` | invoice_follow_ups. Receipt numbers on payments (RCPT/FY/NNNN). Cron `send-follow-up-reminders`. `followups.manage`. |
| 40 | `20261112000008_purchases_vendors.sql` | vendors, purchase_orders (PO numbering, GST), purchase_order_items, vendor_bills and vendor_bill_payments (each payment posts an expense). Cron `send-vendor-bill-reminders`. `purchases.manage`. |
| 41 | `20261112000009_salaries_reimbursements.sql` | reimbursements and approval_history (leave, claim, payroll and resignation decisions). Reimbursements are folded into settlements. A wider `can_view_file_row`. The three `reimbursements.*` permissions. |
| 42 | `20261112000010_message_delivery_times.sql` | message_deliveries, filled from presence check-ins. Delivery times in `get_message_info`. |
| 43 | `20261113000001_reports_notification_kinds.sql` | Kinds `budget_alert`, `employee_added` and `attendance_irregularity`. |
| 44 | `20261113000002_profit_loss_budgets.sql` | `get_profit_loss`. department_budgets and budget_alerts (alerts at 80% and 100%). `budgets.manage`. |
| 45 | `20261113000003_hr_reports_notifications.sql` | Notification when an employee is added. Cron `send-attendance-irregularities`. |
| 46 | `20261113000004_content_calendar_kind.sql` | Adds the meeting kind `content`. |
| 47 | `20261113000005_content_calendar.sql` | calendar_categories, calendar_category_members and `meetings.category_id`. `content_calendar.manage`. |
| 48 | `20261113000006_file_delete.sql` | `delete_file()`, which deletes permanently and returns the storage paths. |
| 49 | `20261113000007_task_resume_kind.sql` | Adds the kind `task_resume_requested`. |
| 50 | `20261113000008_task_time_tracking.sql` | `tasks.work_started_at` and the resume-request columns. Automatic hours tracking (`track_task_time`). `request_task_resume`. A new guard. |
| 51 | `20261113000009_content_calendar_tasks.sql` | A content entry creates one task per category member, and moving the entry moves the tasks. |
| 52 | `20261113000010_service_prices.sql` | `services.billing` and Starter, Growth and Premium prices. Replaces the price list (data). |
| 53 | `20261113000011_task_updated_kind.sql` | Adds the kind `task_updated`. |
| 54 | `20261113000012_task_updates_and_file_sends.sql` | The `task_updated` notification. `send_task_files` and `count_unsent_task_files`. |
| 55 | `20261113000013_quieter_presence.sql` | The presence offline window goes from 3 to 6 minutes. |
| 56 | `20261113000014_signatures_pins_service_items.sql` | document_signatures, `signed_by` and `show_seal` on quotations and invoices, service fields on line items, conversation_pins, company details. |
| 57 | `20261113000015_fewer_calls_payment_details.sql` | Cheaper `mark_conversation_read`. Push is skipped when it cannot be delivered. Bank and UPI details on finance_settings. |
| 58 | `20261114000001_client_service_plans.sql` | `client_services.plan`, and `set_client_services` gains `p_plans`. |
| 59 | `20261114000002_bulk_attendance_correction.sql` | `correct_attendance_bulk()`. |
| 60 | `20261114000003_hr_access_private_records.sql` | `roles.private_records` and `roles.tracks_attendance`. Private-record helpers. HR may assign non-private roles. `change_employee_login_email`. HR gets `employees.assign_role`. |
| 61 | `20261114000004_upi_qr_quotation_terms.sql` | Seeds the UPI QR image and default quotation terms (data). |
| 62 | `20261114000005_client_manager_no_hr_settings.sql` | Takes HR permissions away from Client Manager (data). |
| 63 | `20261114000006_quotation_final_invoice_sent.sql` | Quotation status `final`, `invoices.sent_at`, `mark_invoice_sent`. |
| 64 | `20261114000007_document_overview.sql` | An `overview` on quotations and invoices (3 lines, drafts only). |
| 65 | `20261114000008_leave_visibility_task_notices.sql` | Narrower `get_team_leave`. Deadline notices skip tasks the person set for themselves. |
| 66 | `20261116000001_hiring_by_hr_pan_reveal.sql` | Takes `employees.create` away from the heads. PAN reveal is audited. |
| 67 | `20261116000002_quotation_numbering.sql` | `finance_settings.quotation_prefix`, `quotation_number_counter`, a numbering trigger, get and set next number. |
| 68 | `20261116000003_workload_leadership.sql` | `roles.tracks_workload`. Founder and Co-Founder are left out of workload. |
| 69 | `20261116000004_chat_reactions_gifs.sql` | GIF and sticker columns on messages, message_reactions, `react_to_message`, live updates. |

The kind-only migrations (11, 16, 25, 33, 38, 43, 46, 49, 53) exist because Postgres cannot use a new enum value in the same transaction that adds it (`…/20261109000005_phase4_notification_kinds.sql:1-2`).

---

## 2. Schemas

| Schema | Created by | Purpose | Who can reach it |
|---|---|---|---|
| `public` | Postgres | Every business table, view, helper and RPC | `authenticated` through grants and RLS. `anon` is revoked after each migration. |
| `app_auth` | `…/20261110000001_app_auth_schema.sql:6-18` (local; moved from `auth`), `database/platform/supabase_platform.sql:34-85` (Supabase) | The app's own sign-in: `users`, `sessions` (token hashes), `one_time_tokens` (invite and recovery), `outgoing_emails`, `sign_in_attempts`, `user_identities` (Google) | `revoke all on schema app_auth from public` (`…/20261110000001_app_auth_schema.sql:18`). No RLS. Reachable only through the owner or admin connection and SECURITY DEFINER functions (`process_exits`, `change_employee_login_email`). |
| `auth` | Local: `…/20261106000000_local_platform.sql:27`. Supabase: built in. | Only `auth.uid()` is used. It reads `request.jwt.claim.sub` (`:81-88`). Supabase Auth itself is not used. | Execute granted to all three roles |
| `private` | `…/20261109000003_notifications.sql:322-323` | `private.app_settings` (push dispatch URL and secret, live topic) and `private.dispatch_notification()` | Revoked from public, anon and authenticated |
| `storage` | Local shim `…/20261106000000_local_platform.sql:95-119`, Supabase built in | `buckets` and `objects`. The `files` bucket is seeded in `…/20261109000001_files.sql:472-489`. | Policies `files_bucket_insert` and `files_bucket_select` (`…/20261109000001_files.sql:491-494`) |
| `cron` | Local shim `:126-153`, Supabase `pg_cron` (`database/platform/supabase_platform.sql:18-22`) | Scheduled jobs (section 8) | No usage for app roles |
| `net` | Local shim `:160-192`, Supabase `pg_net` (`supabase_platform.sql:23-25`) | Outgoing HTTP (push dispatch) | No usage for app roles |
| `live` | `:201-222` local, `supabase_platform.sql:97-128` | `live.broadcast_change()`. Locally `pg_notify('live_changes')`. On Supabase `realtime.send(…, private=false)` to a secret topic. | Trigger only |
| `realtime` | Local shim `:224-245`, Supabase built in | `realtime.messages` for typing channels `conversation:{id}` (policies at `…/20261109000002_messaging.sql:570-573`) | `authenticated` |
| `app_meta` | Migration runner | `schema_migrations` (docs/DatabaseSchema.md:24) | Internal |

The `live_updates` publication is only a list. After every migration run, `ensureLiveTriggers` adds a `zz_live_broadcast` AFTER trigger to each table in it (`src/server/database/migrationRunner.ts:71-83`). Tables in it: tasks, task_comments (`…/20261106000005_phase2_access_and_reporting.sql:381-382`); messages, conversation_reads, notifications (`…/20261109000004_phase3_access.sql:95-97`); tickets (`…/20261109000009_phase4_access.sql:99`); quotations, invoices (`…/20261109000012_phase5_access.sql:86-87`); message_poll_votes (`…/20261111000001_chat_status_reviewers.sql:385`); message_reactions (`…/20261116000004_chat_reactions_gifs.sql:217`).

---

## 3. Table catalogue

Conventions: the PK is `id uuid default gen_random_uuid()` unless stated otherwise. Most tables have `created_at`/`updated_at` with a `set_updated_at` trigger. FK ON DELETE is written CASCADE, SET NULL, RESTRICT, or NO ACTION (default). "Created" gives the migration.

### 3.1 Organisation and access

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `departments` | Departments, which can be nested | `name` 2-100, unique on lower(name). `parent_department_id` → departments SET NULL. `head_employee_id` → employees SET NULL (FK added at `:100-102`). Cycle guard trigger. | `…/20261106000001_organisation_foundation.sql:17` |
| `designations` | Job titles | `title` unique on lower. `management_level` 1-20 (1 = most senior). | `…:30` |
| `roles` | Named sets of permissions | `name` unique on lower. `is_protected` (Founder), `is_active`, `is_default` (Employee, one default only, `…/20261109000013_team_access.sql:18-20`), `private_records` and `tracks_attendance` (`…/20261114000003_hr_access_private_records.sql:22-24`), `tracks_workload` (`…/20261116000003_workload_leadership.sql:6-7`). | `…:40` |
| `permissions` | Every ability in the system | PK `key text`. `module`, `label`, `description`, `allowed_scopes permission_scope[]`, `sort_order`. | `…:52` |
| `role_permissions` | Which role has which permission, and at what scope | PK (role_id, permission_key). Both FKs CASCADE. `scope` must be in allowed_scopes (`guard_role_permission`). | `…:61` |
| `employees` | Everyone with a login | `auth_user_id` unique → app_auth.users SET NULL. `employee_code` 'EMP-0001' from a sequence. `work_email` unique, lowercase. `role_id` RESTRICT, `designation_id` RESTRICT, `department_id` RESTRICT. `reporting_manager_id` → self SET NULL, check not own manager. `employment_status`, `is_active`, `skills text[]`, `invite_accepted_at`. Later: `acting_role_id` (no FK, `…/20261111000004_hr_finance_foundation.sql:19-22`), `employment_type_id` SET NULL, `probation_months`, generated `probation_end_date`, `confirmation_date` (`…/20261111000005_employee_record.sql:68-72`). | `…:71` |
| `employee_extra_roles` | A second (or more) role for one person | PK (employee_id, role_id), both CASCADE | `…/20261111000004_hr_finance_foundation.sql:12` |
| `audit_logs` | Permanent change record | `id bigint identity`. `actor_employee_id` (deliberately no FK), `actor_name`, `action`, `entity_type`, `entity_id text`, `details jsonb`, `client_id` (no FK, `…/20261106000005_phase2_access_and_reporting.sql:103`). Immutable through BEFORE UPDATE/DELETE/TRUNCATE triggers (`…:636-638`). | `…:104` |

### 3.2 Sign-in (`app_auth`)

| Table | Purpose | Notes |
|---|---|---|
| `app_auth.users` | Login accounts | `email` unique, lowercase. `encrypted_password`, `banned_until` (set to 'infinity' by `process_exits`). Created at `…/20261106000000_local_platform.sql:30` (local, then moved) and `supabase_platform.sql:37`. |
| `app_auth.sessions` | Sessions, stored as token hashes | `user_id` CASCADE. `token_hash` unique. `expires_at`. |
| `app_auth.one_time_tokens` | Invitation and reset links | `kind` in (invite, recovery). Used once (`used_at`). |
| `app_auth.outgoing_emails` | Emails waiting for a provider | No email provider yet |
| `app_auth.sign_in_attempts` | Rate limiting | `key`, `attempted_at`. **No PK.** Index on (key, attempted_at). `…/20261110000001_app_auth_schema.sql:23` |
| `app_auth.user_identities` | Google account link | PK (provider, provider_user_id). `user_id` CASCADE. unique (user_id, provider). Provider must be 'google'. `…/20261110000002_google_sign_in.sql:7` |

### 3.3 Clients, services and projects

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `clients` | Leads and clients | `client_code` CLI-0001, `company_name` unique on lower, `status client_status`. `client_manager_id`, `department_id` and `created_by` all SET NULL. `industry_id` → industries RESTRICT (`…/20261109000014_service_catalog.sql:96`). `gstin` (regex) and `billing_state` (`…/20261109000011_finance.sql:34-37`). | `…/20261106000003_clients_and_projects.sql:12` |
| `client_records` | Notes, requirements, feedback, complaints and follow-ups | `client_id` CASCADE, `kind client_record_kind`, `rating` 1-5, `due_date` | `…:40` |
| `client_services` | Services a client takes | `client_id` CASCADE, `service_id` → services RESTRICT (`…/20261109000014:105`), `status`, dates, `plan` in starter, growth or premium (`…/20261114000001_client_service_plans.sql:5-6`) | `…:55` |
| `service_groups` | The "services" shown in the app (6 seeded) | `name` unique, `sort_order` | `…/20261109000014_service_catalog.sql:5` |
| `services` | Sub services | `group_id` RESTRICT, `name` unique **globally**. `billing` (monthly, one_time, per_unit), `starter_price`, `growth_price` and `premium_price` (`…/20261113000010_service_prices.sql:9-13`). `description` (`…/20261113000014:42`). | `…:15` |
| `industries` | Client industries (58 seeded) | `name` unique | `…:26` |
| `projects` | Client or internal projects | `project_code` PRJ-0001. `client_id` RESTRICT (null means internal). `department_id`, `project_manager_id` and `created_by` SET NULL. `status`, `priority`, dates, `completed_at`. | `…/20261106000003:69` |
| `project_members` | Who works on a project | PK (project_id, employee_id), both CASCADE | `…:93` |
| `project_milestones` | Key dates | `project_id` CASCADE | `…:101` |

### 3.4 Tasks

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `tasks` | Tasks and subtasks | `task_code` TSK-0001. `created_by`, `assignee_id`, `reviewer_id`, `verified_by` and `escalated_to` → employees SET NULL. `department_id`, `client_id`, `project_id` and `meeting_id` SET NULL. `parent_task_id` → tasks **RESTRICT**. `status task_status`, `priority`, `complexity` 1-5, `due_date`, `due_time` (needs a date, `…/20261111000002:13-15`), `estimated_hours`, `actual_hours` (counted automatically), `work_started_at`, the resume_request_* columns (`…/20261113000008:13-19`), `recurrence`, `quality_rating`, `escalation_reason`. 8 indexes (`…/20261106000004_tasks.sql:49-56`). | `…/20261106000004_tasks.sql:14` |
| `task_collaborators` | People helping on a task | PK (task_id, employee_id), CASCADE | `…:58` |
| `task_dependencies` | Tasks that must finish first | PK (task_id, depends_on_task_id), CASCADE, not self, cycle guard | `…:66` |
| `task_checklist_items` | Checklists | `task_id` CASCADE, `label`, `is_done` | `…:75` |
| `task_comments` | Comments | `task_id` CASCADE, `created_by` SET NULL | `…:84` |

Task history has no table of its own. It comes from `audit_logs` through `get_task_history`.

### 3.5 Files

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `files` | Uploads and links | `kind` (upload, link), `status` (uploading, ready), `name` (extension allow-list check), `external_url` (http(s), links only). `owner_id`, `department_id`, `client_id`, `project_id`, `task_id`, `meeting_id` and `ticket_id` SET NULL. `employee_id` → employees **CASCADE** with `document_type` (`…/20261111000005:372-379`). `candidate_id` → candidates **CASCADE** (`…/20261112000003:191-196`). Checks: an employee or candidate file links to nothing else. | `…/20261109000001_files.sql:18` |
| `file_versions` | Each uploaded version | `file_id` CASCADE, unique (file_id, version), `storage_path` unique (`{file}/v{n}/{name}`), `uploaded_by` SET NULL | `…:46` |
| `file_shares` | Who a file was sent to | `file_id` CASCADE. Exactly one of `recipient_employee_id` (CASCADE) or `recipient_department_id` (CASCADE). Sender name, title and department copied in. `expires_at`. | `…:63` |
| `file_access_logs` | Every view and download | `id bigint identity`, `file_id` CASCADE, `employee_id` with no FK | `…:83` |
| `file_comments` | Comments | `file_id` CASCADE | `…:94` |

### 3.6 Messages and presence

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `conversations` | direct, group, department, project, client and announcement chats | Department, project and client FKs CASCADE. `direct_key` unique. Check that the kind matches its link (`:19-24`). Partial uniques: one channel per department, project and client, and one announcement channel. | `…/20261109000002_messaging.sql:7` |
| `conversation_members` | Members of direct and group chats | PK (conversation_id, employee_id), CASCADE, `is_admin` | `…:32` |
| `conversation_reads` | Read position | PK (conversation_id, employee_id), `last_read_at` | `…:42` |
| `messages` | Messages | `conversation_id` CASCADE. `author_id`, `reply_to_id`, `file_id`, `deleted_by` and `pinned_by` SET NULL. Soft delete. Later: `contact_employee_id`, `meeting_id`, `poll_question`, `poll_options`, `poll_allows_multiple` (`…/20261111000001:15-30`), `forwarded` (`…/20261111000002:44`), `gif_kind`, `gif_url` (GIPHY only), `gif_title`, `gif_width`, `gif_height` (`…/20261116000004:13-29`). `messages_not_empty` check. | `…:49` |
| `message_mentions` | Who was @mentioned | PK (message_id, employee_id), CASCADE | `…:68` |
| `message_poll_votes` | Poll votes | PK (message_id, employee_id, option_index) | `…/20261111000001_chat_status_reviewers.sql:32` |
| `employee_presence` | Chosen status and last seen | PK `employee_id` CASCADE. `chosen_status` is one of 6 values. RPC access only. | `…:391` |
| `message_reads` | First read per person per message | PK (message_id, employee_id). RPC access only. | `…/20261111000002_chat_actions_task_times.sql:46` |
| `message_stars` / `message_hidden` | Starred messages, and messages deleted for oneself | PK (message_id, employee_id) | `…:149`, `…:158` |
| `message_deliveries` | Delivery time per recipient | PK (message_id, employee_id), filled by a presence trigger | `…/20261112000010_message_delivery_times.sql:10` |
| `conversation_pins` | Pinned chats, per person | PK (employee_id, conversation_id) | `…/20261113000014:469` |
| `message_reactions` | One emoji per person per message | PK (message_id, employee_id), `conversation_id` copied in, `emoji` check | `…/20261116000004_chat_reactions_gifs.sql:156` |

### 3.7 Notifications

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `notifications` | One per person per event | `recipient_id` CASCADE, `kind notification_kind`, `priority`, `link` must start with "/", `actor_id` (no FK). `group_key` (unique while unread) and `dedupe_key` (unique), `event_count`, `read_at`, `pushed_at`. | `…/20261109000003_notifications.sql:13` |
| `notification_preferences` | Push on or off, per kind | PK (employee_id, kind) | `…:40` |
| `push_subscriptions` | Browser and phone push endpoints | `endpoint` unique, `p256dh`, `auth` | `…:47` |
| `private.app_settings` | Dispatch URL, secret and live topic | PK `key` | `…:325` |

### 3.8 Leave, attendance and the calendar

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `company_settings` | One row: working pattern | PK `id boolean check (id)`. `work_start`, `work_end`, `late_grace_minutes`, `working_days int[]` (ISO, 1 = Monday). Later: `default_probation_months`, `overtime_after_minutes`, `half_day_minutes`, `default_pt_state`, `payroll_absence_lop`, `notice_period_days`. | `…/20261109000006_leave_and_attendance.sql:9` |
| `holidays` | Company holidays | `holiday_date` unique, `kind` (public, company), `description` | `…:22` |
| `leave_types` | Leave kinds and allowance | `yearly_allowance` (null means unlimited), `is_paid`, `requires_attachment`, `carry_forward_cap`, `carry_forward_expiry_months`, `is_encashable` (`…/20261111000006:194`) | `…:33` |
| `leave_requests` | Requests | `employee_id` CASCADE, `leave_type_id` RESTRICT, `attachment_file_id`, `approver_id` and `decided_by` SET NULL. Half day only when start equals end. Must fall in one calendar year. `days` is computed. | `…:55` |
| `attendance_records` | One row per person per day | unique (employee_id, work_date). `source` (web, manual, import). `work_mode` (office, wfh), `status_override` (`…/20261111000006:19`). `updated_by` SET NULL. | `…:87` |
| `attendance_breaks` | Breaks | `attendance_id` CASCADE, `employee_id` CASCADE | `…/20261111000006_attendance_leave.sql:28` |
| `leave_carry_forwards` | Days carried into the next year | unique (employee_id, leave_type_id, from_year), `expires_on` | `…:201` |
| `meetings` | Meetings and content entries | `organizer_id`, `client_id` and `project_id` SET NULL. `kind` (adds content), `status`, `starts_at` and `ends_at` (at most 24 hours), `meeting_link` https only, notes, decisions. `category_id` → calendar_categories SET NULL (`…/20261113000005:35`). | `…/20261109000007_meetings.sql:7` |
| `meeting_participants` | Invitees and answers | PK (meeting_id, employee_id), CASCADE | `…:31` |
| `calendar_categories` / `calendar_category_members` | Content calendar categories and who receives each | Members PK (category_id, employee_id) | `…/20261113000005_content_calendar.sql:17`, `:28` |

### 3.9 Support tickets

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `ticket_categories` | Kinds of request and their routing | `handling_department_id` and `default_assignee_id` SET NULL | `…/20261109000008_support_tickets.sql:3` |
| `tickets` | Tickets | `ticket_code` TKT-0001, `category_id` **RESTRICT**. Requester, departments and assignee SET NULL. `status ticket_status`, `resolution`. | `…:32` |
| `ticket_comments` | Comments on a ticket | `ticket_id` CASCADE | `…:56` |

### 3.10 Sales finance (quotations, invoices, payments)

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `finance_settings` | One row: company billing details | Legal name, GSTIN and PAN regexes, state, prefixes (`invoice_prefix`, `receipt_prefix` `…/20261112000007:114`, `po_prefix` `…/20261112000008:22`, `quotation_prefix` `…/20261116000002:7`), `default_tax_rate` 18, `payment_terms_days` 15, `quotation_validity_days` 30, terms. Bank and UPI fields and the UPI QR image (`…/20261113000015:103-111`), `website`. | `…/20261109000011_finance.sql:12` |
| `quotations` | Quotations | `quotation_number` from a trigger (`PREFIX-NNNN`, `…/20261116000002:21-48`). `client_id` **RESTRICT**, `project_id` SET NULL, `invoice_id` SET NULL. `status quotation_status`. Money columns computed in the database. `signed_by` SET NULL, `show_seal`, `overview`. | `…:49` |
| `quotation_items` | Lines | `quotation_id` CASCADE, `hsn_sac`, qty, price, rate, computed amounts, `service_group`, `service_name`, `billing` | `…:82` |
| `invoices` | GST invoices | `invoice_number` unique and null until issued (`PREFIX/26-27/0001`). `client_id` RESTRICT, `quotation_id` and `project_id` SET NULL. `amount_paid` ≤ total. `status invoice_status`. `sent_at`, signer and seal, `overview`. | `…:100` |
| `invoice_items` | Lines | `invoice_id` CASCADE | `…:139` |
| `invoice_number_counters` | Last number in each financial year | PK `financial_year`. RLS on, no policies, all privileges revoked. | `…:154` |
| `payments` | Money received | `invoice_id` RESTRICT, `client_id` RESTRICT (copied in), `amount` > 0, `method payment_method` (includes tds), `bank_account_id` SET NULL (`…/20261112000005:148`), `receipt_number` unique (`…/20261112000007:122`) | `…:166` |
| `invoice_follow_ups` | Notes from chasing an invoice, add-only | `invoice_id` CASCADE, `status follow_up_status` (two values are derived and never stored), promise fields | `…/20261112000007_follow_ups_receipts.sql:28` |
| `receipt_number_counters` | Receipt counter per financial year | Same shape as the invoice counters | `…:117` |
| `quotation_number_counter` | One-row quotation counter | `next_number` 1-999999 | `…/20261116000002_quotation_numbering.sql:11` |
| `document_signatures` | Each signer's signature, seal and title | PK `employee_id` CASCADE. Images as data URIs, at most 400 kB each. | `…/20261113000014:105` |

### 3.11 HR: employee record, payroll, recruitment, exits

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `employment_types` | Full-time, Part-time, Contract, Intern | name unique | `…/20261111000005_employee_record.sql:48` |
| `employee_personal_details` | Date of birth, gender, personal email, address, emergency contact | PK `employee_id` CASCADE | `…:178` |
| `employee_private_details` | Identity and bank | PK `employee_id` CASCADE. `aadhaar_encrypted` and `account_number_encrypted` ('v1:' AES-GCM done by the app) with their last four digits. `pan` in plain text. `ifsc`. | `…:254` |
| `salary_components` | Extra earnings and deductions | kind, fixed or percentage of basic or gross | `…/20261112000002_payroll.sql:55` |
| `payroll_rules` | PF, ESI, PT (state slabs) and TDS, each from a date | unique (kind, state, effective_from) | `…:82` |
| `salary_structures` | Monthly pay per employee from a date | `employee_id` CASCADE. Generated `gross`. Flags for PF and ESI. unique (employee, effective_from). No UPDATE grant. | `…:121` |
| `salary_revisions` | Written automatically for each new structure | `structure_id` CASCADE | `…:144` |
| `appraisals` | Ratings 1-5 | `reviewer_id` SET NULL | `…:158` |
| `payroll_runs` | One per month | `month` unique (day 1). `status payroll_run_status`. Totals. prepared_by, decided_by and paid_by. | `…:332` |
| `payroll_lines` | One payslip | `run_id` CASCADE, `employee_id` **RESTRICT**, `structure_id` **RESTRICT**. Day counts, earnings, statutory amounts, net pay, `warnings[]`. | `…:355` |
| `job_openings` | Openings | department, designation and type SET NULL | `…/20261112000003_recruitment.sql:34` |
| `candidates` | Candidates | `opening_id` SET NULL, `stage candidate_stage`, salary fields, the offer, `employee_id` SET NULL (not unique) | `…:54` |
| `interviews` | Interviews | `candidate_id` CASCADE, `interviewer_id` SET NULL, `meeting_id` SET NULL, `mode` check, `status`, `rating` | `…:90` |
| `letter_templates` | Offer, internship, experience and relieving letters | `{{placeholders}}` | `…:117` |
| `onboarding_items` / `onboarding_tasks` | Onboarding checklist template, and the per-employee copy | tasks unique (employee_id, item_name) | `…:140`, `…:154` |
| `resignations` | Resignations | `employee_id` **CASCADE**, `status resignation_status`, `last_working_day`, exit interview fields | `…/20261112000004_exit_management.sql:45` |
| `exit_checklist_items` / `exit_tasks` | Exit checklist template, and the per-resignation copy | category check on items only | `…:67`, `…:85` |
| `final_settlements` | Full and final settlement | PK `resignation_id` CASCADE, `employee_id` **CASCADE**. Generated `final_amount`. `status` is text (draft, paid). | `…:97` |

### 3.12 Ledger, purchases, reimbursements and budgets

| Table | Purpose | Key columns and constraints | Created |
|---|---|---|---|
| `finance_categories` | Income and expense categories | `kind`, `system_key` (salaries, settlements, reimbursements, purchases) protected by a guard | `…/20261112000005_finance_ledger.sql:43` |
| `bank_accounts` | Bank and cash accounts | Encrypted number plus last four. `opening_balance`, `opening_date`. Only one `is_primary`. | `…:109` |
| `income_records` | Income that is not an invoice payment | `category_id` RESTRICT, `bank_account_id` RESTRICT, `client_id` and `file_id` SET NULL. Soft delete with a reason. | `…:154` |
| `expense_records` | Every expense | `source` (manual, payroll, settlement, reimbursement, vendor_bill) plus `source_id` (polymorphic, no FK). Unique (source, source_id) for non-manual. Soft delete. | `…:177` |
| `bank_statement_lines` | Imported statement lines | `bank_account_id` CASCADE. Unique duplicate key. Match fields. | `…:494` |
| view `money_movements` | Union of payments, income and expenses (`security_invoker`) | Columns: id, kind, direction, occurred_on, amount, … | `…:397` |
| `vendors` | Vendors | name unique, GSTIN, payment terms | `…/20261112000008_purchases_vendors.sql:36` |
| `purchase_orders` / `purchase_order_items` / `po_number_counters` | Purchase orders (PO/FY/NNNN), GST split | `vendor_id` RESTRICT. Items CASCADE. | `…:60`, `:90`, `:104` |
| `vendor_bills` | Bills | `vendor_id` RESTRICT, `purchase_order_id` SET NULL, `category_id` RESTRICT, soft delete. Unique (vendor, bill_number) among live bills. | `…:242` |
| `vendor_bill_payments` | Payments against bills | `bill_id` RESTRICT, `bank_account_id` RESTRICT, soft delete | `…:272` |
| `reimbursements` | Expense claims | `employee_id` **CASCADE**, `category_id` RESTRICT, `receipt_file_id`, `bank_account_id` and `settled_in_resignation_id` SET NULL. `status reimbursement_status`. | `…/20261112000009_salaries_reimbursements.sql:52` |
| `approval_history` | Every decision on leave, claims, payroll runs and resignations | `item_type` check, `item_id` polymorphic with no FK. Read only through `get_approval_history`. | `…:148` |
| `department_budgets` | Budget for a month or a financial year (April start) | `department_id` **CASCADE**. unique (department, kind, start). | `…/20261113000002_profit_loss_budgets.sql:64` |
| `budget_alerts` | Alerts already sent at 80% and 100% | PK (budget_id, threshold) | `…:82` |

Tables with RLS on and **no policies**, so they are reachable only through definer functions: `invoice_number_counters`, `receipt_number_counters`, `po_number_counters`, `quotation_number_counter`, `employee_presence`, `message_reads`, `message_deliveries`, `approval_history`, `budget_alerts`.

---

## 4. Enums and status values

From `src/types/databaseTypes.ts:7304-7343`, checked against the migrations.

| Enum | Values | Defined |
|---|---|---|
| `permission_scope` | own < team < department < organisation (the order is used in `>=` comparisons) | `…/20261106000001:9` |
| `employment_status` | active, on_leave, notice_period, exited | `…/20261106000001:11` |
| `client_status` | lead, onboarding, active, on_hold, inactive | `…/20261106000003:3` |
| `client_record_kind` | note, requirement, feedback, complaint, follow_up | `…/20261106000003:4` |
| `client_service_status` | active, paused, ended | `…/20261106000003:5` |
| `project_status` | planning, active, on_hold, completed, cancelled | `…/20261106000003:6` |
| `work_priority` | low, medium, high, urgent | `…/20261106000003:7` |
| `task_status` | not_started, assigned, accepted, in_progress, under_review, changes_requested, on_hold, completed, rejected. "Overdue" is worked out, never stored. | `…/20261106000004:6-9` |
| `task_recurrence` | none, daily, weekly, monthly | `…/20261106000004:10` |
| `file_kind` / `file_status` / `file_access_action` | upload, link / uploading, ready / view, download | `…/20261109000001:5-7` |
| `conversation_kind` | direct, group, department, project, client, announcement | `…/20261109000002:5` |
| `notification_kind` | 42 values (section 9) | `…/20261109000003:6-10` plus 9 kind-only migrations |
| `notification_priority` | normal, high | `…/20261109000003:11` |
| `leave_status` | pending, approved, rejected, cancelled | `…/20261109000006:53` |
| `attendance_source` | web, manual, import | `…/20261109000006:85` |
| `attendance_work_mode` / `attendance_day_status` | office, wfh / present, half_day, absent, leave, holiday, week_off | `…/20261111000006:16-17` |
| `meeting_kind` | internal, department, management, client, project, one_to_one, content | `…/20261109000007:3`, `…/20261113000004:4` |
| `meeting_status` / `meeting_response` | scheduled, completed, cancelled / pending, accepted, declined | `…/20261109000007:4-5` |
| `ticket_status` | open, assigned, in_progress, waiting_for_response, resolved, closed | `…/20261109000008:28` |
| `quotation_status` | draft, final, sent, accepted, declined (`final` added at `…/20261114000006:11`) | `…/20261109000011:39` |
| `invoice_status` | draft, issued, partially_paid, paid, cancelled | `…/20261109000011:40` |
| `payment_method` | bank_transfer, upi, cheque, cash, card, tds, other | `…/20261109000011:41` |
| `employee_document_type` | aadhaar, pan, certificate, resume, bank, offer_letter, appointment_letter, other | `…/20261111000005:368` |
| `payroll_rule_kind` / `payroll_run_status` | pf, esi, pt, tds / draft, in_review, approved, paid | `…/20261112000002:75`, `:330` |
| `job_opening_status` | open, on_hold, closed | `…/20261112000003:32` |
| `candidate_stage` | new, shortlisted, interview_scheduled, interview_done, selected, rejected, offer_released, offer_accepted, joined | `…/20261112000003:49` |
| `interview_status` | scheduled, completed, cancelled | `…/20261112000003:88` |
| `letter_kind` | offer, internship_completion, experience, relieving | `…/20261112000003:115` |
| `resignation_status` | submitted, approved, rejected, withdrawn, completed | `…/20261112000004:43` |
| `bank_account_type` | savings, current, cash, other | `…/20261112000005:107` |
| `follow_up_status` | not_contacted, pending, contacted, promise_to_pay, payment_received | `…/20261112000007:26` |
| `purchase_order_status` | draft, issued, received, cancelled | `…/20261112000008:58` |
| `reimbursement_status` | submitted, approved, rejected, paid, cancelled | `…/20261112000009:50` |

Text checks used instead of enums (inconsistent with the enums above): presence `chosen_status` (6 values, `…/20261111000001:394`), `holidays.kind`, `finance_categories.kind` and `system_key`, `expense_records.source`, `final_settlements.status` (draft, paid), `exit_checklist_items.category`, `interviews.mode`, `services.billing`, `client_services.plan`, `department_budgets.period_kind`, `messages.gif_kind`, `approval_history.item_type`. The vendor bill status (unpaid, part_paid, paid) and invoice "overdue" are worked out and never stored.

**Workflows enforced by guards:**
- **Task** (`…/20261113000008_task_time_tracking.sql:152-177`):
  - Assignee: assigned→accepted or rejected; accepted→in_progress or on_hold; in_progress→under_review or on_hold; on_hold→in_progress; changes_requested→in_progress.
  - A task someone set for themselves with no reviewer: in_progress→completed.
  - Reviewer: under_review→completed or changes_requested.
  - Manager: any open status→on_hold; completed→changes_requested (reopen). Managers request a resume (`request_task_resume`) instead of resuming themselves.
- **Ticket** (`…/20261109000008:206-211`): a handler may move to any status except closed, and may close only once resolved. The requester may move resolved to closed or open, closed to open, and waiting_for_response to in_progress.
- **Quotation** (`…/20261114000006:71-96`): draft⇄final; final⇄sent; sent→accepted or declined; sent or declined→draft; accepted→sent only while no invoice exists. Only drafts can be edited.
- **Invoice** (`…/20261109000011:427-543`): draft→issued (numbered here); issued, partially_paid or paid→cancelled (no payments left, reason required). Payments move it to partially_paid or paid.
- **Payroll run**: draft→in_review (`submit_payroll_run`)→approved or back to draft (`decide_payroll_run`)→paid (`mark_payroll_paid`).
- **Leave**: pending→approved or rejected (decider), pending→cancelled (employee), approved→cancelled (employee before the start date, or HR at org scope).
- **Resignation**: submitted→withdrawn (owner) or approved/rejected (`decide_resignation`); approved→completed (`process_exits`).
- **Purchase order**: draft→issued (numbered here)→received; draft or issued→cancelled.

---

## 5. Key functions, RPCs and triggers

Unless noted, every function is `SECURITY DEFINER SET search_path = ''` with fully qualified names. No SECURITY DEFINER function in the migrations lacks a fixed search_path. The functions without one are invoker functions in the local platform shims: `auth.uid()`, `cron.schedule`, `cron.unschedule` and `realtime.topic()` (`…/20261106000000_local_platform.sql:81`, `:137`, `:147`, `:239`).

### 5.1 Access helpers (used by policies)

| Function | Purpose | Defined (latest) |
|---|---|---|
| `current_employee_id()` | The active employee for `auth.uid()`. Null if inactive, which removes all access. | `…/20261106000001:124` |
| `current_role_id()` | The acting role, if it is one of the person's extra roles; otherwise the main role | `…/20261111000004:160` |
| `permission_scope_for(key)` / `has_permission(key)` | Scope through `current_role_id()`, active roles only | `…/20261111000004:174`, `…/20261106000001:144` |
| `get_my_permissions()` / `get_my_roles()` / `switch_my_role(role)` | Permission list and role switching | `…/20261111000004:184`, `:209`, `:221` |
| `is_in_reporting_line(emp, mgr)` | Recursive check up the reporting chain (depth < 50) | `…/20261106000001:152` |
| `can_access_employee(key, target)` | org gives everyone; self; department gives the same department; team gives the reporting line | `…/20261106000001:171` |
| `role_within_own_access(role)` / `role_is_assignable(role)` | You hold every permission of the role at at least its scope, **or** you have `employees.update` at org scope and the role is not private | `…/20261114000003:85`, `:102` |
| `can_create_employee(dept, manager)` | Applies `employees.create` with team or department scope | `…/20261109000013:123` |
| `can_view_employee_profile(id)` / `get_directory_employee_ids()` | Who appears in the Employees directory | `…/20261109000013:80`, `:107` |
| `employee_has_private_record`, `can_see_employee_record`, `get_hidden_employee_ids` | Hide the leadership's private records | `…/20261114000003:43`, `:60`, `:72` |
| `can_manage_private_details()` / `can_see_personal_details(id)` | `employees.private_view` at org / personal details access | `…/20261111000005:37`, `…/20261114000003:210` |
| `employees_with_permission(key, scope)` | Recipients for notifications (revoked from authenticated) | `…/20261111000004:87` |
| `can_view_client_row` / `can_view_client` / `can_update_client` / `client_in_finance_reach` | Client access | `…/20261106000003:118-190`, `…/20261109000013:281` |
| `can_view_project_row` / `can_view_project` / `can_manage_project` / `can_create_project` | Project access | `…/20261106000003:194-300` |
| `can_view_task_row` / `can_view_task` / `can_manage_task` / `can_work_on_task` / `can_assign_task_to` / `get_assignable_employee_ids` / `get_reviewer_ids` | Task access and assignment rules | `…/20261106000004:100-285`, `…/20261111000001:501` |
| `can_view_file_row(files)` | Visibility of a file. Replaced 5 times; final version at `…/20261114000003:543`. | see section 6 |
| `can_view_conversation_row` / `can_view_conversation` / `can_post_in_conversation` / `is_conversation_participant` / `is_group_admin` / `can_use_conversation_channel` | Chat access | `…/20261109000002:79-160`, `:497`, `:555` |
| `can_view_leave_row` / `can_decide_leave_row` | Leave access | `…/20261109000006:162`, `…/20261111000004:105` |
| `can_view_meeting_row` / `is_meeting_organizer` / `can_plan_content` | Meeting access | `…/20261109000007:48-80`, `…/20261113000005:38` |
| `can_view_ticket_row` / `can_manage_ticket_row` | Ticket access | `…/20261109000008:78-104` |
| `finance_reach(perm, client, created_by)` and the quotation and invoice `can_*_row` helpers | org reaches every client; own reaches clients you manage plus documents you created | `…/20261109000011:243-305` |
| `can_see_ledger`, `can_manage_purchases`, `can_manage_budgets`, `can_see_payroll`, `has_paid_payslip_in`, `can_manage_recruitment`, `can_view_candidate`, `can_handle_exits`, `can_view_resignation`, `can_decide_reimbursement`, `can_view_reimbursement`, `can_sign_documents` | Module access helpers | ledger `:32`, purchases `:25`, budgets `:57`, payroll `:913`, `:948`, recruitment `:169`, `:177`, exits `:237`, `:632`, reimbursements `:79`, `:89`, signatures `:113` |

### 5.2 Main RPCs (callable by `authenticated`)

- **Organisation:**
  - `set_role_permissions` (SECURITY **INVOKER**, so RLS applies, `…/20261106000001:283`)
  - `get_assignable_role_ids`, `get_my_team_ids`
  - `set_employee_extra_roles` (`…/20261114000003:117`)
  - `change_employee_login_email` (writes `app_auth`, `…/20261114000003:162`)
  - `record_private_detail_reveal` (aadhaar, account_number, pan; `…/20261116000001:15`)
  - `get_employment_history`, `get_upcoming_birthdays`, `get_hr_dashboard`
- **Clients and projects:**
  - `set_client_services(client, services, plans)` (`…/20261114000001:11`)
  - `get_client_timeline` (values hidden, money filtered, `…/20261109000011:1006`)
  - `get_client_labels`, `get_project_progress`
- **Tasks:**
  - `get_task_history`
  - `get_workload_rows` and `get_my_workload_rows` (`…/20261116000003:11`, `:63`)
  - `request_task_resume`, `send_task_files`, `count_unsent_task_files`
- **Files:**
  - `finalize_file_version` (reads the size and type from `storage.objects`, `…/20261109000001:207`)
  - `record_file_access`
  - `delete_file` (`…/20261113000006:9`)
- **Chat:**
  - `get_or_create_direct_conversation`, `create_group_conversation`
  - `get_my_conversations` (with pins), `mark_conversation_read`, `get_conversation_read_state`, `get_message_info`
  - `vote_in_poll`, `post_conversation_event`, `react_to_message`
  - `clear_conversation_for_me`, `leave_group`
  - `record_presence`, `set_my_status`, `get_presence`
- **Notifications:** `save_push_subscription`, `mark_all_notifications_read`.
- **Leave and attendance:**
  - `attendance_check_in(work_mode)`, `attendance_check_out`, `attendance_start_break`, `attendance_end_break`
  - `import_attendance`
  - `correct_attendance_bulk` (`…/20261114000002:12`)
  - `get_attendance_report_data`, `get_leave_balances`, `get_team_leave`, `carry_forward_leave`, `get_leave_utilisation`, `count_working_days`
- **Finance:**
  - `save_quotation`, `save_invoice`, `create_invoice_from_quotation` (`…/20261113000014:245-416`, `…/20261114000006:112`)
  - `mark_invoice_sent`, `get_next_quotation_number`, `set_next_quotation_number`
  - `get_follow_up_board` (invoker)
  - `save_purchase_order`, `pay_vendor_bill`, `remove_vendor_bill_payment`, `remove_vendor_bill`
  - `remove_ledger_entry`, `get_money_movements` (invoker), `get_account_balances`
  - `import_statement_lines`, `match_statement_line`, `unmatch_statement_line`, `get_statement_suggestions`
  - `get_profit_loss` (invoker), `get_budget_usage`
- **Payroll:**
  - `start_payroll_run`, `recalculate_payroll_run`, `save_payroll_line`, `submit_payroll_run`, `decide_payroll_run`
  - `mark_payroll_paid` (with an account, `…/20261112000005:319`)
  - `discard_payroll_run`, `get_salary_structure_costs`, `get_company_profile`
- **Recruitment and exits:**
  - `schedule_interview`, `record_interview_outcome`, `complete_candidate_conversion`, `start_onboarding`, `set_onboarding_task`
  - `decide_resignation`, `set_exit_task`, `get_settlement_suggestion`
  - `mark_settlement_paid` (`…/20261112000009:433`)
- **Claims:** `decide_reimbursement`, `pay_reimbursement`, `get_approval_history`.

**System-only** (revoked from authenticated, or refusing user sessions): `notify` (`…/20261109000004:87`), `process_task_deadlines`, `send_meeting_reminders`, `send_invoice_overdue_reminders`, `configure_notification_dispatch` (service_role only, `…/20261109000004:83-84`), `process_exits` (raises for users, service_role only, `…/20261112000004:574`, `:688`), `assign_quotation_number`, `leave_days_taken`, `leave_carried_in`, `employees_with_permission`, `get_conversation_participant_ids`, `check_finance_links`, `normalize_items`, `item_lines`. Several other internal helpers were **not** revoked from authenticated; see Observations.

### 5.3 Triggers by purpose

- **Guards (BEFORE):**
  - `employees_guard_insert` and `employees_guard_update` (latest version at `…/20261112000004:127`, which can be bypassed with `app.trusted_employee_update`)
  - `role_permissions_guard`, `employees_prevent_reporting_cycle`, `departments_prevent_cycle`
  - `tasks_guard_insert`, `tasks_guard_update` (`…/20261113000008:24`), `tasks_reviewer_check`, `tasks_due_time_check`, `tasks_check_meeting_link`, `task_dependencies_prevent_cycle`
  - `files_guard_insert`, `files_guard_update`, `files_check_record_links`, `file_versions_prepare`, `file_shares_stamp` (employee and candidate files cannot be shared)
  - `messages_guard_insert` and `messages_guard_update` (immutable fields; 5-minute edit and delete window; latest at `…/20261116000004:52`)
  - `notifications_guard_update` (only `read_at` may change)
  - `leave_requests_guard_insert` (balance, overlap, working days) and `leave_requests_guard_update`
  - `attendance_records_guard` and `attendance_records_person` (`…/20261114000003:295`)
  - `meetings_guard_insert`, `meetings_guard_update`, `meeting_participants_guard_update`, `meetings_guard_category`
  - `tickets_guard_insert` and `tickets_guard_update`
  - `quotations_guard`, `invoices_guard`, `payments_guard` (locks the invoice, caps the amount at the balance), `quotations_guard_signer`, `invoices_guard_signer`, `quotations_overview_guard`, `invoices_overview_guard`
  - `employee_personal_details_guard`, `employee_private_details_stamp`
  - `candidates_guard`, `resignations_guard_insert`, `resignations_guard_update`, `final_settlements_guard`
  - `finance_categories_guard`, `income_records_guard`, `expense_records_guard`, `purchase_orders_guard`, `vendor_bills_guard`, `reimbursements_guard`, `invoice_follow_ups_guard`
- **Stamping:** `stamp_created_by` on clients, records, services, projects and comments (it keeps the old `created_by` on UPDATE). `stamp_recruitment_row`, reused for vendors and budgets. `salary_structures_stamp`, `appraisals_stamp`.
- **GST:** `quotations_split_tax`, `invoices_split_tax` and `purchase_orders_split_tax` run `apply_gst_split()` (`…/20261109000011:210`). When the place of supply is in the company's state, tax splits into CGST and SGST (any odd paisa goes on SGST); otherwise it is IGST.
- **Numbering:**
  - Sequences for EMP-, CLI-, PRJ-, TSK- and TKT- codes.
  - Invoice numbers from `invoice_number_counters` inside `guard_invoice_write` (`…/20261109000011:505-513`).
  - Receipts from `payments_number_receipt` → `next_receipt_number` (`…/20261112000007:132-159`).
  - PO numbers inside `guard_purchase_order`.
  - Quotations from `quotations_assign_number`, using a locked counter (`…/20261116000002:23-48`).
- **Money roll-ups:** `payments_refresh_invoice` recomputes `amount_paid`, status and `paid_at`. `expense_records_check_budget` and `department_budgets_check` run the budget alerts. `salary_structures_revision` records revisions.
- **Audit:**
  - `audit_row_change()` on most tables (latest at `…/20261109000011:926`). Updates log a diff of the changed columns; creates and deletes log the whole row.
  - `audit_employee_detail_change()` logs field names only (`…/20261111000005:321`).
  - `audit_document_signature()` never copies the images.
  - `record_status_approval()` writes `approval_history` (`…/20261112000009:174-204`).
- **Notifications:**
  - `tasks_notify` (`notify_task_events`, latest at `…/20261114000008:43`), `task_comments_notify`, `file_shares_notify`, `messages_notify`
  - `meeting_participants_notify`, `meetings_notify_change`, `leave_requests_notify`, `tickets_notify`, `ticket_comments_notify`
  - `payments_notify`, `candidates_notify`, `resignations_notify`, `reimbursements_notify`, `employees_notify_added`
  - `notifications_dispatch` → `private.dispatch_notification()` → `net.http_post` (skipped with no subscription, with push turned off, or when do-not-disturb; `…/20261113000015:57`)
- **Live updates:** `zz_live_broadcast` → `live.broadcast_change()` on each table in `live_updates`. The payload carries ids only (`id`, `*_id`, `assigned_to`, `created_by`).
- **Chat side effects:**
  - `messages_after_insert` (bumps the conversation, records @mentions)
  - `departments_create_conversation`, `projects_create_conversation`, `clients_create_conversation`
  - `employee_presence_record_deliveries`
  - `messages_clear_reactions`
- **Tasks:**
  - `tasks_create_next_recurring`
  - `tasks_track_time` (`…/20261113000008:261`)
  - `meetings_add_category_people` (creates tasks, `…/20261113000009:14`)
  - `meetings_move_content_tasks`

**Order matters.** Postgres fires triggers on the same event in alphabetical order, and some rules depend on it:
- `messages_after_insert` must run before `messages_notify` (`…/20261109000003:262`).
- `tasks_guard_update` must run before `tasks_track_time` (`…/20261113000008:223-224`).
- `quotations_assign_number` must run before `quotations_guard` (`…/20261116000002:48`).
- `payments_notify` runs before `payments_refresh_invoice` (`…/20261109000011:873`, `:885` vs `:605`).

---

## 6. Row level security

### 6.1 How it works

1. **Identity.** On each request the server opens a transaction, sets `request.jwt.claim.sub` to the login id and `role` to `authenticated` (`src/server/database/sqlDatabase.ts:29`). `auth.uid()` reads the claim, and `current_employee_id()` turns it into an *active* employee. If the employee is inactive, the result is null and every policy fails.
2. **Permissions, not role names.** Every policy calls `has_permission(key)`, `permission_scope_for(key)` or a module helper. The scope is the acting role's scope (`current_role_id()`). Role names appear only in seed data.
3. **Scopes.** `own < team < department < organisation`. `can_access_employee` turns a scope into a check on a person. Module helpers (`finance_reach`, `can_view_task_row`, …) apply scopes to their own records.
4. **Select policies pass the whole row.** A policy reads, for example, `can_view_task_row(tasks)` rather than an id lookup, so a row being inserted can be read back (`docs/DatabaseSchema.md:250`, `…/20261106000003:116-117`).
5. **Field rules live in triggers, not in WITH CHECK.** Many UPDATE policies use a broad `USING can_view…(row)` with `WITH CHECK current_employee_id() is not null`, and the BEFORE UPDATE guard decides which columns may change and which status moves are allowed. Examples: `tasks_update` (`…/20261106000004:647`), `messages_update` (`…/20261109000002:544`), `leave_requests_update` (`…/20261109000006:631`), `meetings_update` (`…/20261109000007:295`), `tickets_update` (`…/20261109000008:404`), `resignations_update` (`…/20261112000004:648`), `employees_update` (`…/20261106000001:712`).
6. **RPC-only tables.** Some tables have RLS on but no INSERT, UPDATE or DELETE policy, so all writes go through definer RPCs. Examples: purchase orders (no insert policy), payroll runs and lines, ledger matching, presence, reads, reactions and votes.
7. **Soft delete and "never delete".** Many tables have no DELETE policy or grant (clients, projects, employees, tickets, leave, money records). Money records are removed by soft delete with a reason.
8. **`service_role`** has BYPASSRLS and is used only through `createAdminDatabaseClient()` (`CLAUDE.md`) and in cron jobs.

### 6.2 Typical patterns, with examples

| Pattern | Example |
|---|---|
| Any active employee may read | `departments_select using (current_employee_id() is not null)` (`…/20261106000001:653`). The same applies to designations, roles, permissions, leave_types, holidays, company_settings, ticket_categories, the service catalogue, employment_types, finance_categories and **employees** (`…/20261109000013:76-78`). |
| Permission alone | `departments_insert with check has_permission('departments.manage')` (`:655`). `holidays_write for all using has_permission('hr.manage')` (`…/20261109000006:618`). |
| Permission at org scope | `ticket_categories_write … permission_scope_for('tickets.manage') = 'organisation'` (`…/20261109000008:395`). `finance_settings_update` needs org `finance.manage` (`…/20261109000011:1078`). |
| Row helper | `tasks_select using can_view_task_row(tasks)`, `files_select using can_view_file_row(files)`, `quotations_select using can_view_quotation_row(quotations)` |
| Child table follows its parent | `task_comments_select using can_view_task(task_id)`. `quotation_items_select using can_view_quotation(quotation_id)`. `payments_select using can_view_invoice(invoice_id)`. |
| Owner only | `notifications_select using recipient_id = current_employee_id()`. `message_stars_own for all using employee_id = me with check … and can_view_message(message_id)` (`…/20261111000002:178`). `conversation_pins_*`. |
| Scope through the employee | `attendance_records_select using can_access_employee('attendance.view', employee_id)` (`…/20261109000006:635`). `leave_carry_forwards_select`. |
| Privilege escalation blocked in the policy | `role_permissions_insert` requires `permission_scope_for(permission_key) >= scope` and a role that is not protected (`…/20261106000001:691`). |
| Draft-only delete | `quotations_delete using can_manage_quotation_row(quotations) and status='draft'` (`…/20261109000011:1090`). `tasks_delete … status in ('not_started','assigned')`. `files_delete … status='uploading'`. |
| Private records | `employee_private_details_select using employee_id = me or (can_manage_private_details() and can_see_employee_record(employee_id))` (`…/20261114000003:226`) |
| Storage | `files_bucket_insert with check bucket_id='files' and can_upload_file_object(name)`. `files_bucket_select … can_read_file_object(name)` (`…/20261109000001:491-494`). |
| Realtime channels | `conversation_channel_read using can_use_conversation_channel(realtime.topic())` (`…/20261109000002:570`) |

### 6.3 `can_view_file_row` (the most complex helper)

The final version is at `…/20261114000003_hr_access_private_records.sql:543`. Earlier versions are at `…/20261109000001:109`, `…/20261109000008:307`, `…/20261111000005:383`, `…/20261112000003:198` and `…/20261112000009:485`. It checks in this order:

1. While a file is still uploading, only its owner can see it.
2. **Employee document:** visible to the owner, the person it belongs to, or `employees.private_view` holders who may see that person's record. Shares do not widen this.
3. **Candidate file:** visible to the owner or `can_view_candidate`.
4. Otherwise any of these is enough:
   - org `files.view`, or ownership;
   - an active share to me or my department;
   - a task, project, client, meeting or ticket I can see;
   - department scope on the file's department;
   - an attachment in a message I can see;
   - a reimbursement receipt I can see;
   - a ledger or vendor-bill attachment, for ledger or purchases users.

### 6.4 Grants

- Tables: `authenticated` gets explicit S, I, U and D per table. `revoke delete` is used on clients, projects, employees and task_comments. `revoke truncate` appears only from finance onward (`…/20261109000012:46-87`, `…/20261109000014:222-223`, `…/20261113000014:570`) and on audit_logs (`…/20261106000001:747`).
- Functions: `revoke execute on all functions in schema public from public, anon`, then explicit grants. This does **not** remove the EXECUTE that default privileges give `authenticated`. See Observations O1.

---

## 7. Permissions and roles

### 7.1 All 67 permissions

| Key | Module | Allowed scopes | Description (seeded) | Seeded |
|---|---|---|---|---|
| dashboard.view | Overview | own | Open the overview page. | `…/20261106000002:4-17` |
| employees.view | Employees | own, team, department, organisation | See employee profiles in Employees. Own: your manager and colleagues sharing that manager. Team: your reports (rewritten at `…/20261109000013:31-33`) | same |
| employees.create | Employees | team, department, organisation (widened at `…/20261109000013:26-29`) | Add employees. Team scope adds people who report to you or your team. | same |
| employees.update | Employees | team, department, organisation | Change employee details, managers and designations. | same |
| employees.assign_role | Employees | team, department, organisation | Change which role an employee has. | same |
| employees.deactivate | Employees | team, department, organisation | Control whether an employee can sign in. | same |
| team.view | Employees | team | See the people who report to you. | same |
| organisation.view | Organisation | organisation | See the organisation chart. | same |
| organisation.stats | Organisation | department, organisation | See headcount figures on the dashboard. | same |
| departments.manage | Organisation | organisation | Add, edit and remove departments. | same |
| designations.manage | Organisation | organisation | Add, edit and remove designations and management levels. | same |
| roles.manage | Settings | organisation | Create roles and decide what each one can do. | same |
| audit.view | Settings | own, organisation | See the record of who changed what. | same |
| catalog.manage | Settings | organisation | Add, rename and hide the services and industries clients choose from. | `…/20261109000014:175` |
| clients.view | Clients | own, department, organisation | Open client profiles and Client 360. | `…/20261106000005:3-16` |
| clients.create | Clients | organisation | Add leads and clients. | same |
| clients.update | Clients | own, department, organisation | Change client details, notes, requirements and services. | same |
| projects.view | Projects | own, team, department, organisation | See projects and their progress. | same |
| projects.create | Projects | department, organisation | Start new projects. | same |
| projects.update | Projects | own, department, organisation | Change projects, teams and milestones. | same |
| tasks.view | Tasks | own, team, department, organisation | See tasks beyond those you are involved in. | same |
| tasks.create | Tasks | own | Create tasks for yourself. | same |
| tasks.assign | Tasks | team, department, organisation | Give tasks to other people. | same |
| tasks.assign_heads | Tasks | organisation | Give tasks to the head of any department. | same |
| tasks.assign_project_team | Tasks | own | Give tasks to people on the same project. | same |
| tasks.manage | Tasks | team, department, organisation | Edit, reassign and review tasks you did not create. | same |
| workload.view | Tasks | team, department, organisation | See workload and performance figures. | same |
| files.view | Files | own, department, organisation | See files beyond those you own, received or work on. | `…/20261109000004:3-7` |
| files.upload | Files | own | Upload files, add Drive links and send them to colleagues. | same |
| messages.use | Messages | own | Send messages and take part in channels. | same |
| messages.announce | Messages | organisation | Post in the company announcements channel. | same |
| leave.request | Leave and attendance | own | Apply for leave and see your own balance. | `…/20261109000009:3-12` |
| leave.approve | Leave and attendance | team, department, organisation | Approve or reject leave for people in your reach. | same |
| attendance.view | Leave and attendance | own, team, department, organisation | See attendance records and reports. | same |
| attendance.manage | Leave and attendance | department, organisation | Correct attendance records and import them from other systems. | same |
| hr.manage | Leave and attendance | organisation | Set leave types, holidays and working hours. | same |
| meetings.create | Meetings | own | Schedule meetings and invite people. | same |
| meetings.view | Meetings | own, organisation | See meetings beyond those you are invited to. | same |
| content_calendar.manage | Meetings | organisation | Put content work in the calendar under a category, and choose who each category goes to. | `…/20261113000005:7-9` |
| tickets.create | Support | own | Ask the support team for help. | `…/20261109000009` |
| tickets.manage | Support | department, organisation | Work on tickets for your department, or for everyone. | same |
| quotations.view | Finance | own, organisation | See quotations for the clients you manage, or for every client. | `…/20261109000012:3-10` |
| quotations.manage | Finance | own, organisation | Create, edit and send quotations, and record the client's answer. | same |
| invoices.view | Finance | own, organisation | See invoices and payments for the clients you manage, or for every client. | same |
| invoices.manage | Finance | own, organisation | Create, issue and cancel invoices. | same |
| payments.record | Finance | organisation | Record payments received, and remove ones entered by mistake. | same |
| finance.reports | Finance | organisation | See revenue, collections, money owed and GST summaries. | same |
| finance.manage | Finance | organisation | Set the company's billing details, invoice numbering and default terms. | same |
| finance.dashboard | Finance | organisation | See income, money owed and collections at a glance. | `…/20261111000004:28-30` |
| followups.manage | Finance | organisation | See every unpaid invoice, record follow-ups with clients and get reminders. | `…/20261112000007:12-14` |
| ledger.manage | Finance | organisation | Record income and expenses, and see every money movement. | `…/20261112000005:19-23` |
| banks.manage | Finance | organisation | Add bank and cash accounts, import statements and reconcile them. | same |
| purchases.manage | Finance | organisation | Keep vendors, raise purchase orders, record vendor bills and pay them. | `…/20261112000008:12-14` |
| reimbursements.submit | Finance | own | Claim back money you spent for work. | `…/20261112000009:19-24` |
| reimbursements.approve | Finance | team, department, organisation | Approve or reject claims from people in your reach. Reporting managers can always decide their team's claims. | same |
| reimbursements.pay | Finance | organisation | Pay approved reimbursement claims. | same |
| budgets.manage | Finance | organisation | Set department budgets and see how much of each is spent. | `…/20261113000002:11-12` |
| hr.dashboard | HR | organisation | See company-wide HR figures: headcount, attendance, leave and work anniversaries. | `…/20261111000004:28-30` |
| employees.private_view | HR | organisation | See and change identity numbers, bank details and employee documents for everyone. | `…/20261111000005:19` |
| payroll.manage | Payroll | organisation | Set salary components, payroll rules and salary structures, prepare payroll runs and record appraisals. | `…/20261112000002:18-23` |
| payroll.approve | Payroll | organisation | Approve payroll runs prepared by HR, send them back, and mark them paid. | same |
| payslips.view | Payroll | own | See your own payslips once salary is paid. | same |
| recruitment.manage | Recruitment | organisation | Manage job openings, candidates, interviews, offer letters and onboarding. | `…/20261112000003:18` |
| exits.manage | Exits | organisation | Approve or reject resignations, run exit checklists and prepare full and final settlements. | `…/20261112000004:18-21` |
| resignation.submit | Exits | own | Submit your own resignation. | same |

### 7.2 Seeded roles and what they hold after all 69 migrations

The roles: Founder (protected, `private_records`, does not track attendance or workload), Co-Founder (`private_records`, no workload), Client Manager, Branch Manager, Finance Head, Design & Development Head, Digital Marketing Head, Employee (`is_default`), and Human Resource (`…/20261111000004:34-36`). Role grants are written by name (for example `r.name = 'Founder'`, `lower(r.name) = 'human resource'`).

These are the net results of the grant and delete statements. The owner may have changed them since in Settings > Roles.

| Role | Holds |
|---|---|
| **Founder** | Every permission at its widest scope. Each module migration grants new keys to the Founder by `sort_order` or by name (for example `…/20261106000002:48-52`, `…/20261106000005:18-22`, `…/20261109000009:14-18`). |
| **Co-Founder** | org: employees view, create, update, assign_role and deactivate; organisation.view and stats; departments and designations; audit.view; clients.* and projects.*; tasks view, assign, assign_heads and manage; workload; files.view; messages.announce; leave.approve; attendance view and manage; hr.manage; meetings.view; tickets.manage; the 7 sales finance permissions; catalog.manage. own: dashboard.view, tasks.create, files.upload, messages.use, leave.request, meetings.create, tickets.create, payslips.view, resignation.submit, reimbursements.submit. team: team.view. Not held: roles.manage, the HR and finance dashboards, private_view, payroll, recruitment, exits, ledger and banks, purchases, follow-ups, budgets, reimbursement approve and pay. |
| **Client Manager** | dashboard.view own; employees.view and update team (create removed at `…/20261116000001:9-13`); team.view; clients view and create org, update own; projects view and create org, update own; tasks view org, create own, assign team, assign_heads org, manage team; workload.view org (`…/20261110000004:279-282`); files.view own; attendance.view team; quotations and invoices view and manage own; content_calendar.manage org; the usual own-scope set (files.upload, messages.use, leave.request, meetings.create, tickets.create, payslips.view, resignation.submit, reimbursements.submit). Removed: leave.approve (`…/20261111000004:76-80`), organisation.view (`…/20261109000013:57-61`), HR settings permissions (`…/20261114000005:6-10`). |
| **Branch Manager** | dashboard.view; employees view and update team; team.view; organisation.stats dept; projects.view dept; tasks view, assign and manage dept, assign_heads org, create own; workload dept; files.view dept; attendance view and manage dept; tickets.manage dept; the own-scope set. |
| **Finance Head** | The same as the heads below, but without the projects create and update and without `attendance.manage`. Plus org: the 7 sales finance permissions, finance.dashboard, payroll.approve, ledger.manage, banks.manage, followups.manage, purchases.manage, reimbursements.pay, budgets.manage. clients.view was removed (`…/20261109000013:64-68`). |
| **Design & Development Head / Digital Marketing Head** | dashboard.view; employees view and update team; team.view; organisation.stats dept; projects view, create and update dept; tasks view, assign and manage dept, assign_heads org, create own; workload dept; files.view dept; attendance.view dept; tickets.manage dept; the own-scope set. clients.view removed. |
| **Employee** (default) | own: dashboard.view, projects.view, tasks.view, tasks.create, files.view, files.upload, messages.use, leave.request, attendance.view, meetings.create, tickets.create, payslips.view, resignation.submit, reimbursements.submit. employees.view and organisation.view were removed. |
| **Human Resource** | org: hr.dashboard, hr.manage, employees view, create, update and deactivate, employees.assign_role (`…/20261114000003:32-36`), leave.approve, attendance view and manage, employees.private_view, payroll.manage, recruitment.manage, exits.manage, reimbursements.approve. own: dashboard.view, leave.request, meetings.create, tickets.create, messages.use, files.upload, files.view, tasks.view, tasks.create, projects.view, payslips.view, resignation.submit, reimbursements.submit. content_calendar.manage was added and then removed (`…/20261113000014:16-20`). |

---

## 8. Scheduled cron jobs

Locally, these run through the app's background service (`src/server/database/backgroundServices.ts`), which reads the `cron.job` shim. On Supabase they run in pg_cron. All schedules are in UTC.

| Job | Schedule (UTC) | India time | Command | What it does | Defined |
|---|---|---|---|---|---|
| `process-task-deadlines` | `*/15 * * * *` | every 15 min | `process_task_deadlines()` | Reminds about work due today or tomorrow and about overdue work, once each (dedupe keys). Escalates tasks 2 or more days overdue to the assignee's manager. | `…/20261109000003:315` |
| `send-meeting-reminders` | `*/5 * * * *` | every 5 min | `send_meeting_reminders()` | Reminds everyone who has not declined, plus the organiser, about 15 minutes before the start, once | `…/20261109000007:277` |
| `send-invoice-overdue-reminders` | `30 * * * *` | hourly at :30 | `send_invoice_overdue_reminders()` | Tells the Client Manager and whoever raised the invoice, once per due date | `…/20261109000011:919` |
| `carry-forward-leave` | `30 0 1 1 *` | 06:00 on 1 January | `carry_forward_leave(year-1)` | Carries unused leave into the new year, up to each type's cap | `…/20261111000006:393-394` |
| `send-interview-reminders` | `*/30 * * * *` | every 30 min | `send_interview_reminders()` | Tells the interviewer about interviews in the next 24 hours, once | `…/20261112000003:509` |
| `process-exits` | `0 19 * * *` | 00:30 | `process_exits()` | After the last working day: sets the person to exited and inactive, sets `app_auth.users.banned_until = infinity`, and completes the resignation | `…/20261112000004:606` |
| `send-follow-up-reminders` | `30 3 * * *` | 09:00 | `send_follow_up_reminders()` | Invoices due in 3 days, and follow-ups whose next date has come | `…/20261112000007:225` |
| `send-vendor-bill-reminders` | `35 3 * * *` | 09:05 | `send_vendor_bill_reminders()` | Unpaid vendor bills due in 3 days | `…/20261112000008:484` |
| `send-attendance-irregularities` | `15 3 * * *` | 08:45 | `send_attendance_irregularities()` | People who checked in yesterday without checking out, plus a summary to org `attendance.manage` holders | `…/20261113000003:73` |

The table above lists 9 jobs. There is no job to clear `app_auth.sign_in_attempts`. The docs say it is cleared after a day, presumably by app code (**possible**; not checked).

---

## 9. Notification kinds (42)

| Group | Kinds | Added in |
|---|---|---|
| Tasks | task_assigned, task_due_soon, task_overdue, task_review_requested, task_changes_requested, task_completed, task_rejected, task_escalated, task_comment | `…/20261109000003:6-10` |
| Files and chat | file_received, message_received, mention, announcement | same |
| Meetings | meeting_invited, meeting_changed, meeting_cancelled, meeting_reminder | `…/20261109000005:4-7` |
| Leave | leave_requested, leave_decided | `…/20261109000005:8-9` |
| Tickets | ticket_raised, ticket_updated | `…/20261109000005:10-11` |
| Sales finance | payment_received, invoice_overdue | `…/20261109000010:4-5` |
| Tasks (later) | task_rescheduled | `…/20261110000003:4` |
| Payroll, recruitment, exits | payroll_review, payroll_decided, salary_paid, candidate_added, interview_reminder, resignation_submitted, resignation_decided | `…/20261112000001:4-10` |
| Finance stages 8-10 | invoice_due_soon, follow_up_due, vendor_bill_due, reimbursement_submitted, reimbursement_decided, reimbursement_paid | `…/20261112000006:4-9` |
| Reports | budget_alert, employee_added, attendance_irregularity | `…/20261113000001:5-7` |
| Tasks (later) | task_resume_requested, task_updated | `…/20261113000007:4`, `…/20261113000011:4` |

How `notify()` behaves (`…/20261109000003:64`): it skips a null recipient, the person who caused the event, and inactive recipients. A `group_key` updates one unread notification (`event_count + 1`). A `dedupe_key` means the notification is sent once. Bodies are cut at 300 characters. `notify_budget` is the exception: it writes directly and does not skip the actor (`…/20261113000002:132`).

---

## 10. Seeded starting data

| Data | Values | Where |
|---|---|---|
| Departments | Management, Client Services, Branch Operations, Finance, Design & Development, Digital Marketing | `…/20261106000002:29-35` |
| Designations (level) | Founder 1, Co-Founder 1, Client Manager 2, Branch Manager 2, Finance Head 2, D&D Head 2, Digital Marketing Head 2, Team Member 5 | `:37-45` |
| Roles | 8 roles, plus Human Resource (section 7.2) | `:19-27`, `…/20261111000004:34` |
| Working hours | 09:30–18:30, late grace 15 min, Mon–Fri. Probation, overtime, half-day, PT state and notice period are left empty on purpose. Absence counts as loss of pay (`payroll_absence_lop` = true). | `…/20261109000006:9-20`, `…/20261112000002:49` |
| Leave types | Casual 12 days (paid), Sick 6 (paid), Earned 15 (paid), Unpaid (no limit, unpaid) | `…/20261109000006:47-51` |
| Ticket categories | Technical issue, Software problem, Hardware requirement → Design & Development. Access permission, HR, General administration → Management. Finance → Finance. | `…/20261109000008:15-26` |
| Finance settings | Prefix INV, 18% GST, 15-day terms, 30-day quotation validity, RCPT, PO, QUO. Company legal name, address, state Karnataka, contact, website, bank and UPI details, UPI QR, quotation terms. | `…/20261109000011:31`, `…/20261113000014:30-36`, `…/20261113000015:114-120`, `…/20261114000004:9-18` |
| Service catalogue | 6 groups, first 29 sub services. Replaced by 22 priced sub services (Starter, Growth, Premium in INR; others deactivated) and descriptions. | `…/20261109000014`, `…/20261113000010:22-83`, `…/20261113000014:45-87` |
| Industries | 58 (Real Estate … Chemical Industry) | `…/20261109000014:78-88` |
| Storage | Bucket `files`: private, 50 MB, 27 MIME types (video, audio, PDF, Office, txt and csv, images, zip) | `…/20261109000001:472-489` |
| Chat | One channel for each existing department, project and client, plus "Announcements" | `…/20261109000002:348-351` |
| Employment types | Full-time, Part-time, Contract, Intern | `…/20261111000005:58` |
| Letter templates | Offer, Internship completion, Experience, Relieving (with `{{placeholders}}`) | `…/20261112000003:130-138` |
| Onboarding items | Documents verified, Laptop given, Accounts created | `…/20261112000003:149` |
| Exit checklist | Knowledge transfer completed, Laptop returned, ID card returned, Department clearance, Finance clearance, No objection certificate issued | `…/20261112000004:77` |
| Finance categories | Expense: Salaries*, Full and final settlements*, Reimbursements*, Purchases* (* are system categories), Rent, Utilities, Software and subscriptions, Travel, Marketing, Office supplies, Professional fees, Bank charges, Other expenses. Income: Interest, Other income. | `…/20261112000005:56-71` |
| Bank account | "Cash in hand" (cash, opening 0, dated the day the migration ran) | `…/20261112000005:132` |
| Calendar categories | Posters and design, Video shoot, Social media reels and stories. Members are matched by name prefix to real employees. | `…/20261113000005:113-127` |
| Payroll | **No** statutory rates are seeded. HR enters PF, ESI, PT and TDS. | `…/20261112000002` header |
| Role flags | private_records for founder and co-founder name variants; tracks_attendance false for Founder; tracks_workload false for Founder and Co-Founder | `…/20261114000003:26-29`, `…/20261116000003:9` |

---

## 11. Entity relationships (text for a diagram)

```text
[ACCESS]
app_auth.users 1──1 employees (auth_user_id)          app_auth.users 1──* sessions, one_time_tokens, user_identities
employees *──1 roles ──* role_permissions *──1 permissions
employees *──* roles (employee_extra_roles); employees.acting_role_id ~> roles (no FK)
employees *──1 designations ; employees *──1 departments ; employees *──1 employees (reporting_manager)
departments *──1 departments (parent) ; departments.head_employee_id ──> employees
employees 1──1 employee_personal_details ; 1──1 employee_private_details ; 1──1 document_signatures ; 1──1 employee_presence
audit_logs ~> any entity (entity_type, entity_id, client_id: copies, no FKs)

[CRM]
clients *──1 employees (client_manager) ; clients *──1 departments ; clients *──1 industries
clients 1──* client_records ; clients 1──* client_services *──1 services *──1 service_groups
clients 1──* projects (RESTRICT) ; projects 1──* project_milestones ; projects *──* employees (project_members)

[WORK]
tasks *──1 projects / clients / departments / meetings ; tasks *──1 tasks (parent, RESTRICT)
tasks *──1 employees as created_by, assignee, reviewer, escalated_to, verified_by, resume_requested_by
tasks 1──* task_checklist_items, task_comments ; tasks *──* employees (task_collaborators) ; tasks *──* tasks (task_dependencies)
meetings *──1 employees (organizer), clients, projects, calendar_categories ; meetings *──* employees (meeting_participants)
calendar_categories *──* employees (calendar_category_members)
tickets *──1 ticket_categories (RESTRICT) *──1 departments ; tickets *──1 employees (requester, assigned_to) ; tickets 1──* ticket_comments

[FILES]
files *──1 employees (owner) and optional links to task, project, client, meeting, ticket, employee (HR document) or candidate
files 1──* file_versions ──> storage.objects (by storage_path) ; files 1──* file_shares ──> employee | department ; files 1──* file_access_logs, file_comments

[CHAT]
conversations 0..1──1 department | project | client (one channel each) ; direct and group conversations *──* employees (conversation_members)
conversations 1──* messages *──1 employees (author) ; messages ──> files, meetings, employees (contact card), messages (reply)
messages 1──* message_mentions, message_poll_votes, message_reads, message_deliveries, message_stars, message_hidden, message_reactions
employees *──* conversations (conversation_reads, conversation_pins)
employees 1──* notifications, notification_preferences, push_subscriptions

[HR]
employees 1──* leave_requests *──1 leave_types ; leave_carry_forwards (employee × type × year)
employees 1──* attendance_records 1──* attendance_breaks ; holidays and company_settings are standalone
employees 1──* salary_structures 1──* salary_revisions ; employees 1──* appraisals
payroll_runs 1──* payroll_lines *──1 employees (RESTRICT), *──1 salary_structures (RESTRICT)
job_openings 1──* candidates 1──* interviews ──> meetings ; candidates ──> employees (after joining) ; candidates 1──* files
employees 1──* onboarding_tasks (copied from onboarding_items)
employees 1──* resignations 1──* exit_tasks (copied from exit_checklist_items) ; resignations 1──1 final_settlements

[SALES FINANCE]
clients 1──* quotations 1──* quotation_items ; quotations 0..1──0..1 invoices (quotation_id / invoice_id)
clients 1──* invoices 1──* invoice_items ; invoices 1──* payments ──> bank_accounts ; invoices 1──* invoice_follow_ups
quotations and invoices *──1 employees (signed_by, created_by) ; finance_settings: one row ; counters: one row per financial year

[LEDGER AND PAYABLES]
bank_accounts 1──* income_records, expense_records, vendor_bill_payments, bank_statement_lines, payments
finance_categories 1──* income_records, expense_records, vendor_bills, reimbursements
expense_records.source_id ~> payroll_runs | resignations | reimbursements | vendor_bill_payments (polymorphic, no FK)
vendors 1──* purchase_orders 1──* purchase_order_items ; vendors 1──* vendor_bills 1──* vendor_bill_payments ; vendor_bills *──0..1 purchase_orders
employees 1──* reimbursements ──> resignations (settled_in) ; approval_history ~> leave | reimbursement | payroll_run | resignation
departments 1──* department_budgets 1──* budget_alerts ; money_movements = view over payments + income + expenses
```

---

## 12. Generated types (`src/types/databaseTypes.ts`)

- The file is generated by `scripts/generateDatabaseTypes.ts` from `database/migrations` (header `:1-2`). Run `npm run db:types` after each migration.
- One `Database['public']` namespace:
  - `Tables` (103) with `Row`, `Insert`, `Update` and `ComputedFields` per table
  - `Views` (`money_movements`)
  - `Functions` (about 217 entries with `Args` and `Returns`)
  - `Enums` (43)
  - `CompositeTypes` (none)
- It ends with the standard helper types `Tables<…>`, `TablesInsert`, `TablesUpdate`, `Enums` and a `Constants` object (from `:7350`).
- `app_auth`, `private` and the platform schemas are not typed. They are reached through raw SQL in `src/server/auth`.

---

## Observations: risks with evidence

Severity: **H** high, **M** medium, **L** low. Anything not checked against the running database or the app code is marked **possible**.

### Security and access

1. **O1 [M] Internal SECURITY DEFINER helpers remain callable by `authenticated`.** Default privileges give EXECUTE on every new function to `authenticated` (`…/20261106000000_local_platform.sql:21`; `database/platform/supabase_platform.sql:11`). The standard lockdown only revokes from `public, anon` (for example `…/20261112000002_payroll.sql:971`, `…/20261112000005_finance_ledger.sql:698-700`). Only 13 functions are explicitly revoked from `authenticated` (`…/20261109000004:83-89`, `…/20261109000009:96-97`, `…/20261109000012:81-84`, `…/20261111000004:385`, `…/20261111000006:472`, `…/20261116000002:91`). Helpers left callable include:
   - `record_system_expense` (inserts an expense with no permission check, `…/20261112000005_finance_ledger.sql:292-311`)
   - `record_source_expense` (`…/20261112000008:339`)
   - `calculate_payroll_line` (no permission or run-status check, `…/20261114000003:349`)
   - `refresh_payroll_run_totals` (`…/20261112000002:602`)
   - `record_approval` (`…/20261112000009:160`)
   - `notify_budget` and `check_budget_alerts` (`…/20261113000002:132`, `:150`)
   - `next_receipt_number` (`…/20261112000007:132`; the comment says it is revoked at `:246`, but that is the public/anon block)
   - the `send_*` cron functions (`send_follow_up_reminders`, `send_vendor_bill_reminders`, `send_interview_reminders`, `send_attendance_irregularities`)
   - `system_category`, `budget_spent`, `unsent_task_files`, `apply_document_signature`

   Browsers do not run SQL directly. The in-process engine (`src/server/database/queryEngine.ts:692`) is reached only from server code (`src/server/database/queryClients.ts`) and the secret-protected test route (`src/app/api/test-support/[...path]/route.ts`), so exploiting this needs a server action that forwards a function name (**possible**). Fix: `alter default privileges … revoke execute on functions from authenticated`, then grant explicitly. Or revoke each internal helper.
2. **O2 [M] `authenticated` keeps TRUNCATE, REFERENCES and TRIGGER** on every table created before the finance phase. `grant all` comes from the default privileges (`…/20261106000000:19`). The early access migrations only add grants or `revoke delete` (`…/20261106000005_phase2_access_and_reporting.sql:339-352`, `…/20261109000004_phase3_access.sql:46-58`, `…/20261109000009:60-74`). TRUNCATE ignores RLS. Only `audit_logs` (`…/20261106000001:747`) and finance-era tables revoke it. The query builder cannot send TRUNCATE, so this is defence in depth.
3. **O3 [M] Every active employee can read every column of `employees`.** `employees_select using (current_employee_id() is not null)` (`…/20261109000013_team_access.sql:76-78`). Directory narrowing exists only in RPCs and the app. Phone, joining date, employment status, `acting_role_id`, probation and confirmation columns are readable by all staff. Personal and private details live in their own tables, so the worst data is protected.
4. **O4 [M] `delete_file` is broader than `can_view_file_row`.** Org-scope `files.view` may delete any file by id (`…/20261113000006_file_delete.sql:19`), including employee HR documents and candidate files that the same person cannot see (`…/20261114000003:543`).
5. **O5 [M] Assigning roles can grant more than the actor holds.**
   - `role_is_assignable` lets anyone with org `employees.update` (HR) assign any role that is not private, even one with more permissions than HR holds (`…/20261114000003_hr_access_private_records.sql:102-113`).
   - Earlier, `set_employee_extra_roles` did not check roles it removed (`…/20261111000004:246-276`). The newer version checks the main role and the new roles (`…/20261114000003:117-160`); removal is still unfiltered (**possible**).
6. **O6 [M] Comments can be moved to another parent.** UPDATE policies on comments check only authorship: `task_comments_update` (`…/20261106000004_tasks.sql:682-684`), `file_comments_update` (`…/20261109000001_files.sql:463-465`) and `ticket_comments_update` (`…/20261109000008_support_tickets.sql:412-414`). No guard freezes `task_id`, `file_id` or `ticket_id`, so an author can move a comment onto a record they cannot see.
7. **O7 [L] Some task columns are not protected.** `guard_task_update` does not protect `escalation_reason` or `created_at`. `tasks_update` USING is `can_view_task_row` (`…/20261106000004:647-649`), so anyone who can view a task can rewrite them (**possible**: the later guard replacements at `…/20261110000004:16` and `…/20261113000008:24` were not diffed line by line for these two columns).
8. **O8 [M] Trusted-write flags bypass guards completely.** Examples: `app.trusted_employee_update` (`…/20261112000004:137`), `app.finance_internal` (`…/20261109000011:312-317`), `app.trusted_ledger`, `app.trusted_attendance`, `app.trusted_candidate`, `app.trusted_resignation`. They are transaction-local, and some are never switched off (`…/20261112000003:526`, `…/20261112000004:371`, `…/20261111000006:62`, `:79`). Safety depends on users never being able to call `set_config`. That holds through the query builder, but a later raw-SQL path running as the user would undo every guard.
9. **O9 [L] Guards skip nested writes.** `pg_trigger_depth() > 1` in `guard_task_update` (`…/20261113000008:37`), `guard_invoice_write` (`…/20261109000011:456-458`) and `guard_candidate_change` (`…/20261112000003:337`). Content-calendar tasks are created and moved this way, skipping the assignment rules (`…/20261113000009:34`, `:74`).
10. **O10 [L] Interviewers see candidate salaries.** `candidates_select using can_view_candidate(id)` returns whole rows to interviewers, including `current_salary`, `expected_salary` and `offered_salary` (`…/20261112000003_recruitment.sql:605`, `:177`).
11. **O11 [L] Signature images are widely readable.** Any `invoices.view` or `quotations.view` holder can read every signer's full-resolution image (`…/20261113000014:123-128`).
12. **O12 [L] `using (true)` select policies.** `calendar_categories_select` and `calendar_category_members_select` (`…/20261113000005_content_calendar.sql:140`, `:143`). This is harmless today, but a future client portal login running as `authenticated` would see them (**possible**).
13. **O13 [L] Read-along viewers can post.** `can_post_in_conversation` equals `can_view_conversation` outside announcements, so people with project or client visibility can post and pin in those channels (`…/20261109000002_messaging.sql:136-160`). `create_group_conversation` adds any active ids passed in (`:223-226`).
14. **O14 [L] Sessions survive some account changes.**
    - `change_employee_login_email` does not end existing `app_auth.sessions` (`…/20261114000003:162-204`).
    - `process_exits` only sets `banned_until` (`…/20261112000004:595`). Whether that ends open sessions depends on `src/server/auth` (**possible**).
15. **O15 [L] Live broadcasts on Supabase are public.** They use `private=false`, protected only by a secret topic (`database/platform/supabase_platform.sql:120-123`). The payload is ids only. Errors are swallowed (`:125-127`).
16. **O16 [L] Plain-text secrets and identifiers.**
    - The push dispatch secret is stored in plain text in `private.app_settings` and copied into each queued `net.http_request_queue` row (`…/20261109000003:325-367`).
    - PAN is stored in plain text, unlike Aadhaar and account number (`…/20261111000005:259`).
    - Reading `employee_private_details` ciphertext is not audited; only `record_private_detail_reveal` calls are (`…/20261111000005:294`, `:606`).
17. **O17 [L] `import_attendance` treats a null `auth.uid()` as a trusted system import** and skips all checks (`…/20261109000006:476`, `:486`, `:507`). It was open to `anon` between migrations 12 and 15 (`…/20261109000009:62-64` revokes it). It is closed now, but the "no session = system" rule applies to every guard (O8, O9).

### Missing indexes (foreign keys or filter columns used in RLS, triggers or joins)

18. **O18 [M] File-visibility lookups.** `can_view_file_row` and `delete_file` run EXISTS against `reimbursements.receipt_file_id`, `expense_records.receipt_file_id`, `income_records.file_id` and `vendor_bills.file_id`, none of which is indexed (`…/20261112000009:510-521`, `…/20261113000006:23-26`, `…/20261112000005:163`, `:188`, `…/20261112000008:257`). Because the file policy runs per row, file lists will scan 4 tables per file as data grows.
19. **O19 [M]** `expense_records.department_id` (`…/20261112000005:180`) is used by `budget_spent` on every expense write (`…/20261113000002:96-102`, `:214`).
20. **O20 [L] Other FK and filter columns without an index:**
    - `payments.client_id` (RESTRICT, also used by the timeline) and `payments.bank_account_id` (`…/20261109000011:170`, `…/20261112000005:148`)
    - `quotations` and `invoices`: `project_id`, `created_by`, `quotation_id`, `invoice_id` and `signed_by` (`…/20261109000011:54`, `:160`; `…/20261113000014:186`, `:189`)
    - `tickets.category_id` (RESTRICT, `…/20261109000008:38`)
    - `messages.author_id`, `reply_to_id`, `contact_employee_id` and `meeting_id` (`…/20261109000002:52-54`, `…/20261111000001:15-24`)
    - `message_hidden.employee_id`, `message_reactions.employee_id` (`…/20261116000004:160`)
    - `attendance_breaks.employee_id` (RLS filter, `…/20261111000006:31`)
    - `final_settlements.employee_id` (RLS filter, `…/20261112000004:99`)
    - `candidates.employee_id` (also not unique, `…/20261112000003:76`)
    - `interviews.meeting_id`, `employee_extra_roles.role_id`, `leave_requests.leave_type_id` and `attachment_file_id`
    - `tasks.verified_by` and `escalated_to`, `projects.created_by` (used in `can_view_project_row`)
    - `reimbursements` category, bank and settled_in columns, `vendor_bills.category_id` and `department_id`
21. **O21 [M] Hot path: delivery recording.** Every presence check-in runs an INSERT…SELECT over the window of recent messages, calling `is_conversation_participant` per message (`…/20261112000010:38-47`, `…/20261113000013:42-51`). `message_reads`, `message_deliveries` and `message_hidden` grow as messages × members, with no clean-up.

### Data integrity and finance logic

22. **O22 [M] Cascades delete HR and money history.** ON DELETE CASCADE from `employees` on `reimbursements` (`…/20261112000009:54`), `resignations` and `final_settlements` (`…/20261112000004:47`, `:99`), `salary_structures` and `appraisals` (`…/20261112000002`), and `files.employee_id` (`…/20261111000005:373`). Also from departments on `department_budgets` (`…/20261113000002:66`). Matching `expense_records` rows remain with a dangling `source_id`. `payroll_lines` RESTRICT protects only employees who have been paid. The rule is to deactivate rather than delete, but the schema allows deletion.
23. **O23 [M] Payroll expense is posted at net pay only.** Withheld PF, ESI, PT and TDS and the employer contributions are never recorded (`…/20261112000005:342`). Profit and loss under-states the real payroll cost (`total_employer_cost`).
24. **O24 [M] Past balances can move.** Invoice payments without an account are given one at read time through `account_or_default(null)` (`…/20261112000005:399`). Changing the primary account moves historical payments and alters past balances and reconciliation.
25. **O25 [L] A settlement pays every claim approved at that moment** (`…/20261112000009:464-469`), which can include claims approved after the settlement amount was fixed. `pay_reimbursement` blocks all of an employee's claims while a draft settlement lists any reimbursements due (`:293`).
26. **O26 [L] Mid-month payroll counts future days as paid.** The attendance loop stops at yesterday (`…/20261112000002:477`). A status override of leave, holiday or week_off counts as paid without any leave balance (`:508`).
27. **O27 [L] Receipt numbers can have gaps.** Payments can be deleted (`…/20261109000011:1114`), leaving holes in the series (`…/20261112000007:142-159`).
28. **O28 [L] Bulk attendance correction can fail outright.** Picking anyone whose role has `tracks_attendance = false`, on a day with no record, raises in `guard_attendance_person` with no per-row handling (`…/20261114000002:157`, `…/20261114000003:284-287`).
29. **O29 [L] A seed overwrites without a filter.** `quotation_terms` is updated with no `where` clause (`…/20261114000004_upi_qr_quotation_terms.sql:13`), so it replaces any terms the owner had already set.
30. **O30 [L] Concurrency gaps.**
    - Leave balance and overlap checks read then insert, with no lock (`…/20261109000006:285-301`).
    - "One candidate per employee" is enforced only in a function (`…/20261112000003:521`).
    - File version numbers use max+1 (`…/20261109000001:359`).

### Supabase and PGlite compatibility, and the migration process

31. **O31 [L] The first migration cannot run on Supabase.** `20261106000000_local_platform.sql` creates roles and the `auth`, `storage`, `cron`, `net` and `realtime` objects, which already exist there (`:11-13`, `:27`, `:95`, `:126`, `:160`, `:224`). It works only because the runner swaps in `supabase_platform.sql` (`src/server/database/migrationRunner.ts:12-29`). Running the migrations with any other tool would fail.
32. **O32 [L] Local `cron.schedule` accepts only the 3-argument form** (`…/20261106000000:137`). pg_cron's 2-argument form would fail locally. Local `auth.uid()` reads only `request.jwt.claim.sub` (`:81-85`).
33. **O33 [L] `ALTER TYPE … ADD VALUE` inside a later migration** (`…/20261114000006:11`) is safe only because the new value is used inside plpgsql bodies alone. A runner that wraps several files in one transaction would break later kind-only migrations (`…/20261109000005:1-2`).
34. **O34 [L] Supabase runs schema and data together.** `npm run db:supabase` applies data migrations (prices, bank details, real employee names for calendar members) to the live database (`…/20261113000010:22-83`, `…/20261113000015:114-120`, `…/20261113000005:119-127`). Company bank and UPI details, prices and staff names live in schema history.

### Consistency and naming

35. **O35 [L] Role names are matched inconsistently** in seed and data migrations:
    - exact case: `'Client Manager'` (`…/20261114000005:9`), `('Founder','Co-Founder')` (`…/20261116000003:9`)
    - lower case with variants: `lower(name) in ('founder','co-founder','co founder','cofounder')` (`…/20261114000003:26-27`)
    - `lower(name)='human resource'` (`…/20261111000005:26`)

    A renamed role silently gets nothing.
36. **O36 [L] Other naming inconsistencies:**
    - `stamp_recruitment_row()` is reused for vendors and budgets (`…/20261112000008:490`, `…/20261113000002:230`).
    - `system_key` uses plurals (`reimbursements`, `purchases`) where `expense_records.source` uses singular and different words (`reimbursement`, `vendor_bill`) (`…/20261112000005:48`, `:190`).
    - Status columns mix enums and text checks (section 4).
    - `finance.dashboard` and `finance.reports` share sort_order 1050 (`…/20261111000004:30`, `…/20261109000012:9`).
    - `quotation_number_counter` is singular while the other counters are plural.
    - Trigger names do not follow one pattern (`attendance_records_person`, `quotations_overview_guard` vs `*_guard_*`).
    - Function parameters are named with a variable prefix (`v_file`, `v_presence`).
37. **O37 [L] Audit gaps:**
    - Not audited: task_comments, task_checklist_items, task_collaborators, task_dependencies (`…/20261106000005:179-192`); meeting_participants; ticket_comments; attendance inserts and imports (`…/20261109000006:602`); onboarding_tasks; purchase_order_items; statement imports; salary_revisions.
    - Each `create or replace` of `audit_row_change` puts full row snapshots into the permanent log on create and delete. That includes leave reasons (`…/20261109000006:600`) and deleted message text (by design).
38. **O38 [L] `app_auth.sign_in_attempts` has no primary key and no clean-up job** in SQL (`…/20261110000001:23-27`).
39. **O39 [L] Leave visibility ignores private records.** `get_team_leave` does not apply `can_see_employee_record`, so the leadership's leave stays visible to approvers and HR while their attendance is hidden (`…/20261114000008:10-38`).


# Appendix — Commands and working rules

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 (the owner's; holds `.data/database` open) |
| `npm run build` / `npm run start` | Production build and server |
| `npm test` / `npm run test:watch` | Vitest, with throwaway in-memory databases |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:types` | Regenerate `src/types/databaseTypes.ts` after a migration |
| `npm run db:supabase` | Apply new migrations to the live Supabase database (run before deploying code that needs them) |
| `npm run founder:create -- --name … --email … --password …` | Create the Founder account from the terminal (app stopped) |
| `npm run images:webp` | Convert JPG/PNG in `public/images` to WebP |
| `powershell -File scripts/saveVersion.ps1 -Name Task_N` | Save a snapshot to `C:\Users\dhanu\.claude\projects\e--CRM-2-0\versions\` |
| `powershell -File scripts/restoreVersion.ps1 -Name Task_N` | Restore a snapshot (saves current state first; code only, not `.data`) |

## Testing a production build

Port 3100 with its own folders: `DATABASE_DIR=.data/test-database`, `FILE_STORAGE_DIR=.data/test-files`. Browser tests also set `TEST_SUPPORT_SECRET` (32+ characters) on that server only, never in `.env.local`.

## Adding a module (from the roadmap)

1. Migration with tables, RLS policies and audit triggers.
2. Permissions in `public.permissions`, granted to the Founder role in the same migration.
3. Revoke `anon` access at the end of the migration. (Per finding S6, also consider revoking internal helpers from `authenticated`.)
4. Keys in `src/lib/access/permissionKeys.ts`.
5. Pages in `src/lib/access/navigationRegistry.ts`.
6. Widgets in `src/lib/access/dashboardWidgetRegistry.ts`.
7. `npm run db:types`; after deploy prep, the owner runs `npm run db:supabase`.

## Important project rules (from CLAUDE.md)

- No role-name checks; check permissions. Sidebar and dashboards come from permissions.
- No fake buttons. Every important action writes to `audit_logs`.
- Updates refused by RLS return zero rows: always `.select()` and check a row came back.
- `createAdminDatabaseClient()` only in `src/server/` and `scripts/`.
- Postgres 18 reports a delete blocked by a protected link as `23001`; use `isStillInUse(error)`.
- Code must work on both databases; raw SQL only through `SqlDatabase`.
- Never delete or reset `.data/database`.
