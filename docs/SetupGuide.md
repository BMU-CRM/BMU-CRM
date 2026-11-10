# Setup guide

## Run locally

Needs Node.js 20.9 or newer. Nothing else: the database runs inside the app.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. On the first visit the app opens **Set up your workspace**, where you create the Founder account. Everyone else is then invited from **People**.

The database and uploaded files are stored in the `.data` folder, which Git ignores. To start again from an empty workspace, stop the app and delete `.data`.

Copying `.env.example` to `.env.local` is optional. It turns on push notifications and the attendance import key.

### Teammates

Each teammate clones the project and runs the same two commands. Each computer has its own `.data` folder, so everyone starts with their own empty workspace and creates their own Founder account. Shared data between computers comes with a hosted database, which is planned for going live.

### One program at a time

Only one program can open the `.data/database` folder at a time. If you see "The database is already open in another program", stop the other `npm run dev` or `npm run start` first.

To run a second copy, give it its own folders:

```powershell
$env:DATABASE_DIR = '.data/second-database'; $env:FILE_STORAGE_DIR = '.data/second-files'; npx next dev -p 3100
```

## Email

No email provider is connected yet. Invitation and password reset emails are queued in the database instead, and their links are printed in the terminal while developing.

To let someone in, an administrator opens their page in **People > Employees** and uses **Invitation link** (before they have joined) or **Password reset link** (after). The link is shown to copy and send, for example in chat. Each link works once, and creating a new one stops the old one working. Invitations last 7 days, reset links 1 hour.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the app for development |
| `npm test` | Unit tests and database rule tests. Each test file builds its own throwaway database in memory |
| `npm run typecheck` | Type check |
| `npm run lint` | Lint |
| `npm run build` | Production build |
| `npm run db:types` | Rebuild `src/types/databaseTypes.ts` after changing a migration |
| `npm run founder:create -- --name "Name" --email you@company.com --password "AStrongPassword1"` | Create the Founder account from the terminal, instead of the setup page. Stop the app first |
| `npm run images:webp` | Convert JPG and PNG files in `public/images` to WebP |

## Database changes

Add a file to `database/migrations`, named `<timestamp>_<snake_case_name>.sql`. The app applies new migrations automatically the next time it starts, once each, in name order. Then run `npm run db:types`.

Never edit a migration that has already run on a database people use. Add a new one instead.

## Sending attendance from another system

`POST /api/integrations/attendance` with the header `x-integration-key` set to `ATTENDANCE_IMPORT_SECRET`, and a JSON body:

```json
{ "rows": [{ "employee": "EMP-0001 or work email", "date": "2027-01-05", "check_in": "09:40", "check_out": "18:35" }] }
```

Times are Indian time. The reply says how many rows were imported and why any were not. Records that HR corrected by hand are never overwritten.

## Going live

Not decided yet. The current setup suits one server with a disk that is kept, such as a small virtual machine, because the database and files live in folders. Hosting that resets the disk on every deploy, such as Vercel, needs a hosted database and file store first.

The app is ready for a hosted Postgres such as Supabase:

- The migrations are standard Postgres. The first one, `20261106000000_local_platform.sql`, creates what a hosted platform normally provides, and is replaced by the platform's own versions.
- Queries go through the standard PostgREST format, so pointing the query clients at a hosted service is a configuration change, not a rewrite.
- File storage, sign-in and live updates each sit behind one module (`src/server/storage`, `src/server/auth`, `src/server/live`), so each can be swapped on its own.

Before going live, also set `NEXT_PUBLIC_SITE_URL` to the live address, connect an email provider, and set `ATTENDANCE_IMPORT_SECRET` to a long random value.
