# Permission matrix

These are the starting permissions, which the Founder can change in **Settings > Roles**. The owner will confirm the final version.

**Key:** Org = organisation, Dept = department, Team = own reporting line, Own = self only (for `employees.view`: also your manager and colleagues), blank = no access.

**Department heads** are the Client Manager, Branch Manager, Finance Head, Design & Development Head and Digital Marketing Head.

## Organisation

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dashboard.view` | Own | Own | Own | Own | Own | Own | Own | Own |
| `employees.view` | Org | Org | Team | Team | Team | Team | Team | |
| `employees.create` | Org | Org | Team | Team | Team | Team | Team | |
| `employees.update` | Org | Org | Team | Team | Team | Team | Team | |
| `employees.assign_role` | Org | Org | | | | | | |
| `employees.deactivate` | Org | Org | | | | | | |
| `team.view` | Team | Team | Team | Team | Team | Team | Team | |
| `organisation.view` | Org | Org | | | | | | |
| `organisation.stats` | Org | Org | | Dept | Dept | Dept | Dept | |
| `departments.manage` | Org | Org | | | | | | |
| `designations.manage` | Org | Org | | | | | | |
| `roles.manage` | Org | | | | | | | |
| `audit.view` | Org | Org | | | | | | |
| `catalog.manage` | Org | Org | | | | | | |

Every employee can update their own phone number and skills, without needing a permission.

**Who appears in Employees** (`employees.view`):

| Scope | Shows |
| --- | --- |
| Org | Everyone |
| Team | You and everyone who reports to you, at any depth |
| Own | You, your manager, and the colleagues who share that manager |

The Employees section is for the Founder, Co-Founder, Client Managers and department heads. Team members (the Employee role) do not have it; their own details are under **Profile**.

This limits the Employees page and profiles only. Everyone's name still shows wherever people pick or see colleagues: tasks, chats, meetings and files.

**Adding people with Team scope** (`employees.create`):

- The new person joins your own department.
- They report to you or to someone in your team.
- They always get the **default role**, Employee, because heads do not have `employees.assign_role`.
- You can create their invitation link.
- Editing with Team scope cannot move someone to a manager outside your team.

The organisation chart (`organisation.view`) is for the Founder and Co-Founder only.

## Clients and projects

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `clients.view` | Org | Org | Org | | | | | |
| `clients.create` | Org | Org | Org | | | | | |
| `clients.update` | Org | Org | Own | | | | | |
| `projects.view` | Org | Org | Org | Dept | Dept | Dept | Dept | Own |
| `projects.create` | Org | Org | Org | | | Dept | Dept | |
| `projects.update` | Org | Org | Own | | | Dept | Dept | |

Own means clients they manage, or projects they manage, created or work on.

Only Client Managers, the Founder and the Co-Founder have the Clients section and Client 360. Everyone else:

- sees the client's name on their tasks, projects, meetings, files and client chats, without opening the client's record;
- cannot link a new project, task or meeting to a client. Editing a record keeps the client it already has.

The Finance Head has no Clients section, but sees client names and billing details inside Quotations and Invoices.

## Tasks

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tasks.view` | Org | Org | Org | Dept | Dept | Dept | Dept | Own |
| `tasks.create` | Own | Own | Own | Own | Own | Own | Own | Own |
| `tasks.assign` | Org | Org | Team | Dept | Dept | Dept | Dept | |
| `tasks.assign_heads` | Org | Org | Org | Org | Org | Org | Org | |
| `tasks.assign_project_team` | Own | | | | | | | |
| `tasks.manage` | Org | Org | Team | Dept | Dept | Dept | Dept | |
| `workload.view` | Org | Org | Org | Dept | Dept | Dept | Dept | |

## Files and messages

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `files.view` | Org | Org | Own | Dept | Dept | Dept | Dept | Own |
| `files.upload` | Own | Own | Own | Own | Own | Own | Own | Own |
| `messages.use` | Own | Own | Own | Own | Own | Own | Own | Own |
| `messages.announce` | Org | Org | | | | | | |

Whatever someone's scope, they can always see files they own, files sent to them or their department, files attached to tasks, projects or clients they can see, and files sent in chats they can read.

Who can read a conversation:

| Conversation | Who takes part | Who else can read it |
| --- | --- | --- |
| Direct and group | Members only | Nobody, not even the Founder |
| Department channel | Everyone in the department | Nobody |
| Project channel | Project manager, creator and team | Anyone who can see the project |
| Client channel | Client Manager and the client's project teams | Anyone who can see the client |
| Announcements | Everyone | Only `messages.announce` can post |

Edited and deleted messages keep their original text in the audit log, as the brief requires. Anyone with `audit.view` at organisation scope can read it there.

## Leave and attendance

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `leave.request` | Own | Own | Own | Own | Own | Own | Own | Own |
| `leave.approve` | Org | Org | | | | | | |
| `attendance.view` | Org | Org | Team | Dept | Dept | Dept | Dept | Own |
| `attendance.manage` | Org | Org | | Dept | | | | |
| `hr.manage` | Org | Org | | | | | | |

- Nobody can approve their own leave, or correct their own attendance.
- Check-in and check-out use the server's clock, not the browser's.
- A manual correction is never overwritten by a later import.

## Meetings

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `meetings.create` | Own | Own | Own | Own | Own | Own | Own | Own |
| `meetings.view` | Org | Org | | | | | | |

- The organiser and the people invited can see a meeting. `meetings.view` at Org sees every meeting.
- Only the organiser can edit, cancel or change who is invited. Everyone in the meeting can write notes and add follow-up tasks.

## Support tickets

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tickets.create` | Own | Own | Own | Own | Own | Own | Own | Own |
| `tickets.manage` | Org | Org | | Dept | Dept | Dept | Dept | |

- A ticket goes to the department set on its category. `tickets.manage` at Dept handles that department's tickets; at Org, every ticket. Whoever a ticket is assigned to can also handle it.
- Only `tickets.manage` at Org can change ticket categories.
- A ticket can only be resolved with a note saying what was done. The person who raised it can confirm the fix or reopen it.

## Finance

| Permission | Founder | Co-Founder | Client Manager | Branch Manager | Finance Head | D&D Head | Marketing Head | Employee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `quotations.view` | Org | Org | Own | | Org | | | |
| `quotations.manage` | Org | Org | Own | | Org | | | |
| `invoices.view` | Org | Org | Own | | Org | | | |
| `invoices.manage` | Org | Org | Own | | Org | | | |
| `payments.record` | Org | Org | | | Org | | | |
| `finance.reports` | Org | Org | | | Org | | | |
| `finance.manage` | Org | Org | | | Org | | | |

- Own means the clients someone manages, plus documents they created themselves. A Client Manager can quote and invoice only for their own clients, and cannot see other clients' money.
- Only `payments.record` can record or remove payments. Client Managers are told when their client pays.
- Someone who can see a client but not its money, such as a department head, does not see quotations, invoices or payments on that client's timeline.
- An issued invoice cannot be edited by anyone, including the Founder. It is cancelled and reissued instead.

## Who can assign to whom

| From | To | Allowed by |
| --- | --- | --- |
| Founder | Anyone | `tasks.assign` at Org |
| Co-Founder | Anyone, unless the Founder narrows it | `tasks.assign` at Org |
| Department head | Their team | `tasks.assign` at Dept |
| Department head | Another department head | `tasks.assign_heads` |
| Client Manager | Any department head | `tasks.assign_heads` |
| Employee | Themselves | `tasks.create` |
| Authorised employee | People on the same project | `tasks.assign_project_team`, off by default |

A department head is whoever is set as **Department head** in People > Departments. Assigning to heads only works once that is filled in.

To reach another team, assign to its head, who passes the work on.

## Task rules that apply to everyone

- People involved in a task can always see it: the assignee, creator, reviewer, collaborators and anyone it was escalated to.
- Nobody can sign off work assigned to them, even with manager access. The exception is a task someone set for themselves.
- A reviewer must have **Manage tasks** (today: the Founder, Co-Founder, Client Managers and department heads) or be whoever assigned the task. Team members cannot be chosen. Giving a role Manage tasks in Settings > Roles makes its people reviewers.
- A manager cannot change the details of work assigned to them by someone else.
- Anyone can postpone or bring forward the deadline of their own open work, from the calendar or otherwise. They cannot remove it. Whoever assigned the task and its reviewer are notified, and the audit log records the change.

## HR and Finance

The **Human Resource** role runs HR and the **Finance Head** role runs Finance. There are no separate admin tiers.

| Permission | Founder | Human Resource | Finance Head | Everyone else |
| --- | --- | --- | --- | --- |
| `hr.dashboard` (HR dashboard, `/hr`) | Org | Org | | |
| `finance.dashboard` (Finance dashboard, `/finance`) | Org | | Org | |
| `leave.approve` | Org | Org | | Co-Founder: Org |
| `employees.private_view` (ID and bank details, employee documents) | Org | Org | | |

Human Resource also has the HR work that already existed, across the organisation: Employees (view, add, edit, activate), attendance (view, correct), HR settings, and leave approval.

**Leave is approved by HR only.** Reporting managers and department heads no longer approve leave; new requests notify everyone who can approve leave across the organisation.

**One person, two roles.** Someone who does two jobs (for example HR and Finance) is given a second role under **Additional roles** on their employee record, by whoever can assign roles (the Founder). They keep one login and switch from the menu under their avatar ("Working as"). Their sidebar, dashboards and access follow the role they are working in, worked out in the database by `current_role_id()`. Every switch is recorded in the audit log.

### The employee record

| Part of the record | The person | Their managers (`employees.update`) | HR and Founder (`employees.private_view`) | Colleagues |
| --- | --- | --- | --- | --- |
| Work details (employment type, probation, confirmation) | See | See and change | See and change | See (directory) |
| Personal details (date of birth, gender, personal email, address, emergency contact) | See; change contact details only | See and change | See and change | No |
| ID and bank (Aadhaar, PAN, bank account) | See masked; can show their own full number | No | See masked, show full numbers, change | No |
| Documents | See and add their own | No | See and add for anyone | No |
| Employment history | See | See | See | No |

- Aadhaar and account numbers are encrypted by the app (AES-256-GCM, key in `FIELD_ENCRYPTION_KEY`) before they are stored. Every "Show" of a full number is recorded in the audit log, as is every change, by field name only.
- Employee documents never appear in Files and cannot be shared, whatever other file access someone has.
- The directory CSV export (`/people/employees/export`) has work details only.
- People without Directory access (the Employee role) see their own record on **My profile**.

### Attendance and leave

- **Leave requests** (`/hr/leave`) needs `leave.approve` at organisation scope. **Leave report** (`/hr/leave/utilisation`), **Holidays** (`/hr/holidays`) and the year-end carry forward need `hr.manage`.
- Breaks and working from home are recorded only through Check in, Start a break and End break. HR sets a day's status (half day, absent and so on) through **Correct a record**, which is audited.
- Unused leave carries forward automatically at 06:00 on 1 January (India time), up to each leave type's limit; HR can run it again from the Leave report.

## Overseeing work

The Founder, Co-Founder, Client Managers and department heads oversee others' tasks:

- **Workload** shows each person's and each department's work as yet to start, being worked on, waiting for review and done (last 90 days). Every count opens those tasks.
- **Tasks > All tasks** filters by person, department and progress.
- Reach follows `tasks.view` and `workload.view`: Founder, Co-Founder and Client Managers see the whole organisation; department heads see their own department.
- A task cannot be escalated sideways, only up the reporting line or back to whoever assigned it.
- Only tasks that have not started can be deleted.

## What each role sees today

| Role | Sidebar | Dashboard |
| --- | --- | --- |
| Founder | Everything | Revenue, organisation, client, project and task figures, attendance, leave to approve, workload, meetings, tickets, overdue invoices, headcount, quotations awaiting an answer, team, follow-ups, activity, profile |
| Co-Founder | Everything except Roles | Same as Founder |
| Client Manager | Tasks, Projects, Workload, Clients, Quotations, Invoices, Calendar, Support, Leave, Attendance, Approvals, Employees (their team) | Client, project and task figures, attendance, leave to approve, workload, meetings, their overdue invoices, their quotations awaiting an answer, follow-ups, team, profile |
| D&D and Marketing Heads | Tasks, Projects, Workload, Calendar, Support, Leave, Attendance, Approvals, Employees (their team) | Department, project and task figures, attendance, leave to approve, workload, meetings, tickets, team, profile |
| Finance Head | The heads' pages, plus Quotations, Invoices, Reports and Finance settings | The heads' dashboard, plus revenue figures, overdue invoices and quotations awaiting an answer |
| Branch Manager | Tasks, Projects, Workload, Calendar, Support, Leave, Attendance, Approvals, Employees (their team) | Department, project and task figures, attendance, leave to approve, workload, meetings, tickets, team, profile |
| Employee | Tasks, Projects, Calendar, Support, Leave, Attendance | Their project and task figures, their tasks, attendance, leave balance, meetings, profile |

Everyone who has tasks also sees **My workload**: their own open work against a 40-hour week. Managers see their team's workload as well.

Dashboards grow as each phase adds its modules.
