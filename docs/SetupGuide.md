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

Each teammate clones the project and runs the same two commands. Each computer has its own `.data` folder, so everyone starts with their own empty workspace and creates their own Founder account. The shared workspace is the live site on Vercel, which uses Supabase (see Going live).

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
| `npm run db:supabase` | Apply new migrations to the Supabase database used by the live site. See Going live |
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

## Going live on Vercel and Supabase

Vercel keeps no disk between requests, so the live site uses Supabase for what `.data` does on your computer:

| On your computer | On Vercel |
| --- | --- |
| Embedded database in `.data/database` | Supabase Postgres, through its connection pooler |
| Files in `.data/files`, sent through the app | Supabase Storage. The browser sends and fetches files directly with short-lived signed links |
| Scheduled jobs and push requests run by the app | `pg_cron` and `pg_net`, inside Supabase |
| Live updates and typing through `/api/live` | Supabase Realtime channels |

`DATABASE_PROVIDER=supabase` switches all four. Without it, as on your computer, nothing changes. Sign-in is the app's own on both, and the app's accounts are kept in `app_auth`, apart from Supabase's own `auth` tables.

### 1. Set up the Supabase database

Put these in `.env.local` (from Supabase: **Connect** for the two database addresses, **Project Settings > Data API** for the URL, **Project Settings > API Keys** for the keys):

```env
SUPABASE_DB_POOLER_URL=postgresql://postgres.<project>:<password>@aws-...pooler.supabase.com:6543/postgres
SUPABASE_DB_SESSION_URL=postgresql://postgres.<project>:<password>@aws-...pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Then run:

```powershell
npm run db:supabase
```

It applies every migration Supabase does not have yet, using `database/platform/supabase_platform.sql` in place of the first one, and turns on `pg_cron` and `pg_net`. Run it again after any new migration, **before** deploying the code that needs it. It never touches `.data`, so it can run while `npm run dev` is running.

### 2. Settings in Vercel

In **Vercel > Project > Settings > Environment Variables**, for Production:

| Name | Value |
| --- | --- |
| `DATABASE_PROVIDER` | `supabase` |
| `SUPABASE_DB_POOLER_URL` | Same as in `.env.local` (port 6543) |
| `SUPABASE_URL` | Same as in `.env.local` |
| `SUPABASE_PUBLISHABLE_KEY` | Same as in `.env.local` |
| `SUPABASE_SECRET_KEY` | Same as in `.env.local` |
| `NEXT_PUBLIC_SITE_URL` | The live address, `https://crm.bmumarketing.in` |
| `FIELD_ENCRYPTION_KEY` | 32 random bytes in base64 (see `.env.example`). Keep a copy; never change it once numbers are saved. |

`SUPABASE_DB_SESSION_URL` is only for `npm run db:supabase` and is not needed in Vercel. Never give the secret key or the database password a `NEXT_PUBLIC_` name: those are sent to browsers.

Optional:

- **Push notifications:** the VAPID keys from `.env.example`, plus `NOTIFICATION_DISPATCH_URL` (`https://<live address>/api/notifications/dispatch`) and `NOTIFICATION_DISPATCH_SECRET` (a long random value). Supabase then calls that address for each notification.
- **Attendance import:** `ATTENDANCE_IMPORT_SECRET`.
- **Google sign-in:** the four `NEXT_PUBLIC_FIREBASE_*` values, the same as in `.env.local`. See "Google sign-in" below.

`vercel.json` runs the app in Mumbai (`bom1`), next to the database. Every page makes several database queries, so a region on another continent would make each page seconds slower.

### 3. Deploy

Push the code and let Vercel build it, or press **Redeploy** after changing settings, because settings only reach a new deployment. Then open `/setup` on the live address to create the Founder account.

### Google sign-in (Firebase)

Anyone with a login (an invited employee, and clients once the portal exists) can sign in with the Google account for the same email. Nobody else can, and password sign-in keeps working alongside it.

1. **Firebase console > Authentication > Sign-in method:** enable **Google**.
2. **Authentication > Settings > Authorized domains:** add the live address (`crm.bmumarketing.in`). `localhost` is there already.
3. **Google Cloud console > Google Auth Platform > Audience:** with user type External, the publishing status must be **In production**, or only listed test users can sign in.
4. **Project settings > General > Your apps > SDK setup and configuration (npm):** copy `apiKey`, `authDomain`, `projectId` and `appId` into `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID` and `_APP_ID`, in `.env.local` and in Vercel. Restart `npm run dev` or redeploy.

No Firebase service account key is needed: the server checks each sign-in against Google's public keys and the project ID. The first Google sign-in links that Google account to the login. To let someone use a different Google account later, the link in `app_auth.user_identities` has to be removed.

### Android app (APK)

The Android app is the live site packaged by PWABuilder as a Trusted Web Activity: it opens `https://crm.bmumarketing.in` full-screen. Every change deployed to the site reaches the app the next time it is opened. A new APK is needed only to change the app's name, icon or address.

1. Make sure `https://crm.bmumarketing.in` opens and signs in.
2. Go to **pwabuilder.com**, enter `https://crm.bmumarketing.in` and press **Start**. It reads the app's details from `/manifest.webmanifest`.
3. Press **Package for stores**, then **Android**, then **Generate Package**. In the options, keep the name **BMU Workspace**, set **Package ID** to `in.bmumarketing.crm.twa`, and keep **Signing key: Create new**. Download the zip.
4. In the zip:
   - The **.apk** is the file staff install. The **.aab** is only for the Google Play Store.
   - **signing.keystore** and **signing-key-info.txt** are the app's signing key and its passwords. Keep them safe and private. Without them no update to the app can be installed over this one.
   - **assetlinks.json** holds the package name and a `sha256_cert_fingerprints` value.
5. In **Vercel > Settings > Environment Variables**, add `ANDROID_APP_PACKAGE` = `in.bmumarketing.crm.twa` and `ANDROID_APP_SHA256` = the fingerprint from `assetlinks.json` (`AB:CD:…`). Redeploy. `https://crm.bmumarketing.in/.well-known/assetlinks.json` should then show them. Without this the app still works, but with a browser bar at the top.
6. Share the .apk with staff. On their phone they allow installing apps from that source once, then install it.

If the app is later published on Google Play with Play App Signing, add Play's fingerprint (Play Console > App integrity) to `ANDROID_APP_SHA256` as well, separated by a comma.

### Before real company data goes in

- Move Supabase to the Pro plan: the free plan pauses a project after a week without use and has no daily backups.
- Connect an email provider, and set `ATTENDANCE_IMPORT_SECRET` to a long random value if it is used.
- Files are limited to 50 MB each, set in the files migration and by the Supabase plan.
