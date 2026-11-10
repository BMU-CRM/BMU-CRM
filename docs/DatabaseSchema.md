# Database schema

The source of truth is `database/migrations/`. This page explains how the tables fit together.

## Tables

### Platform (local_platform migration)

The first migration creates what a hosted Postgres platform would normally provide. None of it is in the public schema, so no user query can reach it.

| Schema or object | Purpose |
| --- | --- |
| Roles `anon`, `authenticated`, `service_role` | Every query runs as one of these. Only `service_role` bypasses row level security |
| `auth.users`, `auth.sessions` | Accounts, password hashes and sign-in sessions. Only token hashes are stored |
| `auth.one_time_tokens` | Invitation and password reset links. Each works once |
| `auth.outgoing_emails` | Emails waiting for an email provider |
| `auth.uid()` | The signed-in user for the current query |
| `storage.buckets`, `storage.objects` | One row per stored file, checked by the file rules. The bytes are on disk |
| `cron.job`, `cron.schedule()` | Scheduled jobs, run by the app |
| `net.http_request_queue`, `net.http_post()` | Outgoing requests such as push delivery, sent by the app after the change is saved |
| `live_updates` publication, `live.broadcast_change()` | Announces changes to open pages |
| `app_meta.schema_migrations` | Which migrations have run |

### Organisation (Phase 1)

| Table | Purpose | Main links |
| --- | --- | --- |
| `departments` | Company departments, which can be nested | Parent department, department head |
| `designations` | Job titles and management levels | Used by employees |
| `roles` | Named sets of permissions. One role is the default (`is_default`, Employee), given to people added by someone who cannot choose roles | Used by employees |
| `permissions` | Every ability in the system | Added by each module's migration |
| `role_permissions` | Which role has which permission, and at what scope | Roles, permissions |
| `employees` | Everyone with an account | Login, role, designation, department, reporting manager |
| `audit_logs` | Permanent record of changes | Copies actor details, so entries never change. Also carries `client_id` |

### Clients and projects (Phase 2)

| Table | Purpose | Main links |
| --- | --- | --- |
| `clients` | Leads and clients. Status `lead` covers leads | Client Manager, department |
| `client_records` | Notes, requirements, feedback, complaints and follow-ups | Client |
| `client_services` | Services a client takes, each linked to the service list, with status and dates | Client, service |
| `service_groups`, `services` | Shown in the app as **services** (Marketing & Visibility, Web & AI, and so on) and the **sub services** under them (SEO, Website Design, …). A client chooses services first, then at least one sub service for each | Edited in Settings, Services and industries |
| `industries` | The industries a client can belong to. A client has one, which is optional | Clients |
| `projects` | Client or internal projects | Client, department, project manager |
| `project_members` | Who works on a project | Project, employee |
| `project_milestones` | Key dates | Project |

### Tasks (Phase 2)

| Table | Purpose | Main links |
| --- | --- | --- |
| `tasks` | The task itself, including subtasks | Creator, assignee, reviewer, department, client, project, parent task |
| `task_collaborators` | People helping on a task | Task, employee |
| `task_dependencies` | Which tasks must finish first | Task, task |
| `task_checklist_items` | Checklists | Task |
| `task_comments` | Comments | Task, author |

Task history needs no table of its own. It comes from `audit_logs`.

### Files (Phase 3)

| Table | Purpose | Main links |
| --- | --- | --- |
| `files` | Uploads and Drive links | Owner, source department, client, project, task |
| `file_versions` | Each uploaded version and where it is stored | File |
| `file_shares` | Who a file was sent to, with the sender's name, title and department copied in | File, employee or department |
| `file_access_logs` | Every view and download | File |
| `file_comments` | Comments | File |

File contents live in the private `files` Storage bucket, at `{file id}/v{version}/{name}`. Uploads go from the browser straight to Storage through a signed link, and the database then reads the real size and type from Storage before marking the file ready.

### Messages (Phase 3)

| Table | Purpose |
| --- | --- |
| `conversations` | Direct, group, department, project, client and announcement conversations |
| `conversation_members` | Members of direct and group conversations. Other kinds follow the organisation |
| `conversation_reads` | Read positions, for unread counts and "Seen" receipts |
| `messages` | Messages, with replies, attachments, edits, soft deletes and pins |
| `message_mentions` | Who was @mentioned |

A department, project or client channel is created automatically when the department, project or client is created.

### Notifications (Phase 3)

| Table | Purpose |
| --- | --- |
| `notifications` | One per person per event. Repeated chat messages update one unread notification |
| `notification_preferences` | Which kinds each person wants pushed |
| `push_subscriptions` | Each browser or phone signed up for push |
| `private.app_settings` | Where to send push requests, and the shared secret. Not reachable through the API |

Notifications are created by database triggers, so no part of the app can forget to send one. A scheduled job runs `process_task_deadlines()` every 15 minutes. It sends due-soon and overdue reminders once each, and escalates work that is two days overdue to the assignee's manager.

### Leave and attendance (Phase 4)

| Table | Purpose |
| --- | --- |
| `company_settings` | One row: working hours, working days and the grace period for late arrival |
| `holidays` | Company holidays, which are not counted as working days or leave |
| `leave_types` | Kinds of leave and their yearly allowance. Empty allowance means no limit |
| `leave_requests` | Requests, with half days, the decision and who made it |
| `attendance_records` | One row per person per day. Source is `self`, `manual` or `import` |

Leave days count working days only, so weekends and holidays inside a request are free. A request is refused if it overlaps another or goes over the balance.

### Meetings (Phase 4)

| Table | Purpose |
| --- | --- |
| `meetings` | Title, agenda, time, place or link, client, project, notes and decisions |
| `meeting_participants` | Who is invited, and their answer |

Tasks have a `meeting_id` for follow-ups. A scheduled job runs `send_meeting_reminders()` every 5 minutes and reminds everyone who has not declined, once, about 15 minutes before the start.

### Support tickets (Phase 4)

| Table | Purpose |
| --- | --- |
| `ticket_categories` | Kinds of request, the department that handles each, and an optional person to send them straight to |
| `tickets` | Codes run TKT-0001 upwards. Status, handler, priority and resolution |
| `ticket_comments` | The conversation on a ticket |

Files have `meeting_id` and `ticket_id`, so meetings and tickets can carry attachments.

### Finance (Phase 5)

| Table | Purpose |
| --- | --- |
| `finance_settings` | One row: the company's legal name, GSTIN, PAN, state, bank details, invoice prefix, usual GST rate, payment terms and default terms |
| `quotations` | Codes run QUO-0001 upwards. Draft, sent, accepted or declined. Points to the invoice it became |
| `quotation_items` | Lines of a quotation: description, HSN/SAC, quantity, rate, GST rate and the worked-out amounts |
| `invoices` | Draft, issued, part paid, paid or cancelled. Numbered only when issued |
| `invoice_items` | Lines of an invoice, the same shape as quotation items |
| `invoice_number_counters` | The last number used in each financial year. Not reachable through the API |
| `payments` | Money received against an invoice, including TDS the client deducted |

Clients gained `gstin` and `billing_state`.

How the money rules work:

- **Amounts are worked out by the database.** Line items are written only by `save_quotation`, `save_invoice` and `create_invoice_from_quotation`, which round every figure to paise and recalculate the totals. Totals sent any other way are ignored.
- **GST split.** If the place of supply is the company's state, the tax is split equally into CGST and SGST, with any odd paisa on SGST. Otherwise it is all IGST. If either state is unknown, CGST and SGST are used.
- **Numbering.** An invoice gets its number when it is issued, as `PREFIX/26-27/0001`, starting again each April. Drafts have no number, so deleting one leaves no gap. A cancelled invoice keeps its number.
- **Locking.** An issued invoice cannot be changed. It can be cancelled, with a reason, once any payments against it are removed. A quotation can be changed while it is a draft or sent.
- **Payments** cannot exceed what is still due, be dated in the future, or be recorded on a draft or cancelled invoice. They move the invoice to part paid or paid by themselves.
- **Overdue** is not stored. A scheduled job runs `send_invoice_overdue_reminders()` every hour and tells the Client Manager and whoever raised the invoice, once per due date.
- Quotations, invoices and payments carry `client_id`, so they appear on the Client 360 timeline, but only for people who may see that client's money.

## Relationships

```text
auth.users ──1:1── employees ──many:1── roles ──1:many── role_permissions ──many:1── permissions
                     │  │  │
                     │  │  └─ many:1 ── designations
                     │  └──── many:1 ── departments ── parent department (self)
                     └─────── many:1 ── employees (reporting manager, self)

clients ──1:many── client_records
   │  ├───1:many── client_services
   │  ├───1:many── quotations ──1:many── quotation_items
   │  │                │ └──── becomes ── invoices
   │  └───1:many── invoices ──1:many── invoice_items
   │                    └─────1:many── payments
   └──────1:many── projects ──1:many── project_milestones
                      │  └────many:many── employees (project_members)
                      └───────1:many── tasks ──1:many── subtasks (self)
                                         ├──1:many── task_checklist_items
                                         ├──1:many── task_comments
                                         ├──many:many── employees (task_collaborators)
                                         └──many:many── tasks (task_dependencies)
```

## Task workflow

```text
Not started ──assign──> Assigned ──> Accepted ──> In progress ──> Under review ──> Completed
                           │                       │    ▲             │
                           ▼                       ▼    │             ▼
                        Rejected                On hold └──── Changes requested
```

- **Overdue** is not stored. It is worked out from the due date, so a task keeps its real status.
- Reassigning restarts the workflow at Assigned.
- Someone who set a task for themselves can go straight from In progress to Completed, unless they named a reviewer.
- A manager can reopen a completed task.
- A task cannot start while something it depends on is unfinished, and cannot complete while a subtask is open.
- Completing a recurring task creates its next run, with a fresh copy of the checklist.

## Database functions

| Function | Purpose |
| --- | --- |
| `current_employee_id()` | The signed-in employee. Null if inactive, which removes all access |
| `permission_scope_for(key)` | The user's scope for a permission |
| `has_permission(key)` | Whether the user has a permission |
| `can_access_employee(key, id)` | Applies a scoped permission to one employee |
| `is_in_reporting_line(employee, manager)` | Checks the reporting chain at any depth |
| `role_is_assignable(role)` | Whether the user already holds everything the role grants |
| `can_create_employee(department, manager)` | Applies the scope of `employees.create`. Team scope needs the new person in the actor's department, reporting to the actor or their team |
| `can_view_employee_profile(id)`, `get_directory_employee_ids()` | Who appears in Employees: everyone, the person's team, or their manager and colleagues. Names elsewhere are readable by every active employee |
| `client_in_finance_reach(client)` | Lets people who bill a client read its row for names and billing details, without the Clients section |
| `get_my_permissions()` | Everything the user can do |
| `get_my_team_ids()` | Everyone below the user in the reporting line |
| `get_assignable_role_ids()` | Roles the user can assign |
| `set_role_permissions(role, list)` | Replaces a role's permissions in one transaction |
| `can_view_client(id)`, `can_update_client(id)` | Client access |
| `can_view_project(id)`, `can_manage_project(id)`, `can_create_project(department)` | Project access |
| `can_view_task(id)`, `can_manage_task(id)`, `can_work_on_task(id)` | Task access |
| `can_assign_task_to(employee, project)` | Who the user can give work to |
| `get_assignable_employee_ids(project)` | Everyone the user can give work to |
| `get_client_timeline(client, limit)` | Client history, showing which fields changed but not their values |
| `get_task_history(task)` | A task's change history |
| `get_client_labels(ids)` | Client names only, for people working for a client |
| `set_client_services(client, services)` | Replaces a client's current services from the list in one step, keeping ended ones and ones typed before the list existed. At least one is required |
| `get_project_progress(ids)` | Task counts for projects the user can see |
| `get_workload_rows()` | Raw workload data, limited by the user's scope |
| `get_my_workload_rows()` | The signed-in person's own workload data, for the My workload card everyone sees |
| `attendance_check_in()`, `attendance_check_out()` | Records the user's own day using the server clock |
| `import_attendance(rows)` | Imports attendance from a CSV or another system, reporting each row it could not use |
| `get_attendance_report_data(from, to)` | Attendance, leave and holidays for everyone in the user's reach |
| `get_leave_balances(employee, year)` | Allowance, taken, pending and remaining per leave type |
| `get_team_leave(from, to)` | Approved leave the user may see, for the calendar |
| `count_working_days(from, to)` | Working days between two dates, skipping days off and holidays |
| `can_view_meeting(id)`, `is_meeting_organizer(id)` | Meeting access |
| `send_meeting_reminders()` | Sends reminders for meetings starting soon |
| `can_view_ticket(id)`, `can_manage_ticket_row(ticket)` | Ticket access |
| `finance_reach(permission, client, created_by)` | Applies a finance permission: organisation reaches every client; own reaches clients the person manages and documents they created |
| `can_view_quotation(id)`, `can_manage_quotation_row(quotation)` | Quotation access |
| `can_view_invoice(id)`, `can_manage_invoice_row(invoice)` | Invoice access |
| `save_quotation(id, values, items)`, `save_invoice(id, values, items)` | Creates or updates a document and replaces its items in one step |
| `create_invoice_from_quotation(id)` | Turns an accepted quotation into a draft invoice, once |
| `send_invoice_overdue_reminders()` | Tells people about invoices that have passed their due date |

## Conventions

- Every table has row level security enabled.
- The `anon` role has no access to anything. New tables and functions start open to it, so each migration revokes that at the end.
- Primary keys are UUIDs, except `audit_logs`, which uses a sequence.
- Each table with important data has an audit trigger.
- Prefer deactivating records over deleting them.
- `created_by` always comes from the session, never from what a client sends.
- **Select policies must pass the row itself**, as in `can_view_task_row(tasks)`. A function that looks a row up by id cannot see a row being inserted, so reading it back fails for everyone except organisation-wide users.
- Changes go in a new migration. Applied migrations are never edited once a real database uses them.
