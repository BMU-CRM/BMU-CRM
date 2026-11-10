# Project roadmap

The system is built in phases. Each phase delivers working features with a real database, not mock-ups.

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Sign-in, employees, organisation hierarchy, roles and permissions, dynamic dashboards, audit log | Built |
| 2 | Clients, Client 360, projects, milestones, task management, workload and performance | Built |
| 3 | File management, internal messaging, notifications, push, deadline reminders, automatic escalation | Built |
| 4 | Meetings, calendar, leave, attendance, support tickets | Built |
| 5 | Quotations, GST invoices, payments, finance reports, revenue dashboard, invoices and meetings on Client 360 | Built |
| 6 | AI assistant (answers questions only), analytics, external integrations | Next |
| 7 | Security audit, MFA, rate limiting, performance, deployment | Planned |

## Moved to a later phase

These parts of the brief depend on something that does not exist yet.

| Feature | Moves to | Waiting for |
| --- | --- | --- |
| Email notifications | Going live | An email provider. The preference table is ready for it |
| Invitation and password reset emails | Going live | An email provider. Emails are queued in `auth.outgoing_emails`, and administrators create links to pass on meanwhile |
| Shared data between teammates' computers | Going live | A hosted database. Each computer has its own workspace until then |
| Malware scanning of uploads | Phase 7 | A scanning service. Programs and web pages are already refused by name and file type |
| File retention policies | Phase 7 | A decision on how long to keep files |
| Client portal, client file exchange and client approvals | Next, alongside Phase 6 | Invoices now exist, so clients can be shown theirs |
| Emailing quotations and invoices to clients | Going live | An email provider. Until then, print or save them as PDF and send them yourself |
| Credit notes | When needed | A decision on whether to use them. Today a wrong invoice is cancelled and reissued |
| Recurring invoices, discounts, other currencies | When needed | The owner asking for them |
| A revenue chart on the finance reports | When needed | The report shows the same figures as tables today |
| Pagerbook attendance | When Pagerbook access is available | Pagerbook's API details. The import endpoint `/api/integrations/attendance` and CSV import are ready for it |
| Video meeting links created automatically | Phase 6 | A Google Meet or Zoom connection. People paste links for now |
| Meeting reminders by email | Going live | An email provider. In-app and push reminders work now |
| Push on iPhone | Works now | People must first add the site to their home screen. Android and desktop work in the browser |

The department-specific tools, such as bug tracking and campaign tracking, are built on top of tasks once files are in place.

## Adding a module

1. Add a migration with its tables, row level security policies and audit triggers.
2. Add its permissions to `public.permissions`, and grant them to the Founder role in the same migration.
3. Revoke `anon` access again at the end of the migration, because new tables and functions start open.
4. Add its keys to `src/lib/access/permissionKeys.ts`.
5. Add its pages to `src/lib/access/navigationRegistry.ts`.
6. Add any dashboard widgets to `src/lib/access/dashboardWidgetRegistry.ts`.
7. Regenerate types: `npm run db:types`.

## Decisions still needed

| Decision | Needed before |
| --- | --- |
| Final role permissions | Going live |
| Whether a public landing page is needed | Going live |
| Brand colour, logo and company name | Going live |
| Weekly capacity per employee, if it should differ from 40 hours | Going live |
| Leave types and yearly allowances (started as Casual 12, Sick 6, Earned 15, Unpaid) | Going live. Editable in Settings > HR settings |
| Working hours and days (started as 9:30 to 18:30, Monday to Friday, 15 minutes grace) | Going live. Editable in Settings > HR settings |
| Who handles each ticket category | Going live. Editable in Settings > Ticket categories |
| Hosted database, such as Supabase, so teammates share one workspace | Going live. The app runs on its own embedded database until then |
| File storage: the local `.data/files` folder (used now), or a hosted store | Going live. The limit is 50 MB per file, set in the files migration |
| Email sending provider | Going live. Until then, administrators create invitation and reset links to pass on |
| Company legal name, GSTIN, PAN, state and bank details | Before the first real invoice. Editable in Settings > Finance settings |
| Invoice number prefix (started as INV, giving INV/26-27/0001) | Before the first real invoice. It cannot be changed for numbers already issued |
| Payment terms (started as 15 days), quotation validity (30 days), usual GST rate (18%) | Going live. Editable in Settings > Finance settings |
| Whether Client Managers should issue invoices themselves, or only prepare drafts for Finance | Going live. Today they can issue invoices for their own clients |
| Branch structure | Before branch-level reporting is built |
| AI provider | Phase 6 |
