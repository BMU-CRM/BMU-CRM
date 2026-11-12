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

### Payroll, recruitment and exits

| Permission | Founder | Human Resource | Finance Head | Everyone else |
| --- | --- | --- | --- | --- |
| `payroll.manage` (salary structures, rules, components, prepare runs, appraisals) | Org | Org | | |
| `payroll.approve` (approve or send back runs, mark runs and settlements paid) | Org | | Org | |
| `payslips.view` (own payslips, once paid) | Own | Own | Own | Own |
| `recruitment.manage` (openings, candidates, interviews, letters, onboarding) | Org | Org | | |
| `exits.manage` (decide resignations, exit checklist, prepare settlements) | Org | Org | | |
| `resignation.submit` (resign) | Own | Own | Own | Own |

- No statutory rate is built in. PF, ESI, professional tax and TDS come from rules HR enters in **HR settings > Payroll**, each from a date; anything missing is shown as "not set up" and left off payslips.
- Payroll runs are worked out in the database from salary structures, attendance and leave. HR prepares and sends a run; Finance approves (or sends it back with a note) and marks it paid. One person in both roles can do both steps, each recorded.
- Payslips are seen by the person only after the run is paid.
- Interviewers who are not recruiters see only their own interviews and those candidates, at **/interviews**.
- Candidate files are seen only by recruiters and the candidate's interviewers, and never appear in Files.
- A resignation is seen by the person, HR, Finance and the person's reporting manager. The night after the last working day the person is marked exited and their sign-in is blocked, as with deactivating by hand.

### Ledger and bank accounts

| Permission | Founder | Finance Head | Everyone else |
| --- | --- | --- | --- |
| `ledger.manage` (income and expenses, Transactions, categories) | Org | Org | |
| `banks.manage` (bank accounts, statement import, reconciliation) | Org | Org | |

- Every money movement is recorded once: invoice money in payments, other income in income entries, and every expense in expense entries. Paid payroll and paid settlements create their expense automatically and can only be changed where they came from.
- Money records are never deleted. Removing one keeps it, marked removed, with who removed it and why.
- Bank account numbers are encrypted like employee bank details and shown masked.
- Categories can be read by everyone (for reimbursement claims); only Finance changes them.

### Payment follow-ups, purchases and reimbursements (Stages 8 to 10)

| Permission | Founder | Finance Head | Human Resource | Everyone else |
| --- | --- | --- | --- | --- |
| `followups.manage`: follow-up board, record follow-ups, reminders | Organisation | Organisation | — | — |
| `purchases.manage`: vendors, purchase orders, vendor bills and paying them | Organisation | Organisation | — | — |
| `reimbursements.submit`: claim back money spent for work | Own | Own | Own | Own |
| `reimbursements.approve`: approve or reject claims | Organisation | — | Organisation | — |
| `reimbursements.pay`: pay approved claims, Salaries and reimbursements page | Organisation | Organisation | — | — |

- Follow-up notes are seen by Finance and by whoever can see the invoice's money, such as its Client Manager. Follow-ups are never edited; each one is a new note.
- Every invoice payment gets a receipt number (`RCPT/26-27/0001`), in a series per financial year. Anyone who can see the invoice can print its receipts.
- A purchase order gets its number (`PO/26-27/0001`) when issued and is then locked; it can be marked received or cancelled with a reason.
- Paying a vendor bill, in full or in parts, files one expense per payment under the bill's category. Removing a payment keeps it, marked removed, and removes its expense the same way. Only an unpaid bill can be removed.
- A claim is decided by the claimant's **reporting manager**, whatever their role, or by anyone whose `reimbursements.approve` reaches the person. Nobody decides their own claim. Claims are seen only by the claimant, the people who can decide them, and Finance.
- Paying a claim files the expense under the claim's category, once. A leaver's approved but unpaid claims are suggested in their full and final settlement; paying the settlement marks them paid, and they cannot be paid separately while the settlement includes them.
- Every decision on leave, claims, payroll runs and resignations is kept in an approvals record, shown as **Approval history** on the claim, payroll run and exit pages. It is read only through a function that checks the reader may see the item.
- **Approvals** shows a tab for each kind of decision a person can make: leave and work, reimbursements, payroll runs, resignations.

### Profit and loss, budgets and reports (Stages 11 and 12)

| Permission | Founder | Finance Head | Human Resource | Everyone else |
| --- | --- | --- | --- | --- |
| `ledger.manage`: also opens **Profit & loss** | Organisation | Organisation | — | — |
| `budgets.manage`: set department budgets, see spending against them | Organisation | Organisation | — | — |
| `hr.dashboard`: also opens **HR reports** | Organisation | — | Organisation | — |

- Profit and loss is cash basis: invoice payments and other income received, against every expense paid (salaries and settlements apart from operating expenses). It compares the period with the one before and the same period last year, and prints and exports as CSV.
- A budget is per department for a month or a financial year (April to March). Spent is that department's expenses in the period. Everyone with `budgets.manage`, including whoever entered the expense, and the department head are told once at 80% and once at 100%.
- The Finance dashboard shows each figure only to people who may see the money behind it: ledger figures need `ledger.manage` or `banks.manage`, payables need `purchases.manage` or `reimbursements.pay`, and payroll needs `payroll.manage` or `payroll.approve`.
- HR reports cover headcount, joinings and leavers, leave by type, and salaries paid (the Salaries tab needs `payroll.manage` or `payroll.approve`). Each exports as CSV and prints.
- New notifications: HR and the reporting manager are told when an employee is added; each morning anyone who checked in yesterday without checking out is reminded, and people with organisation-wide `attendance.manage` get one summary.

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
