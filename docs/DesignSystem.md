# Design system

Modern, calm and dense enough for daily work. Neutral surfaces with one primary colour.

## Tokens

All tokens are in `src/app/globals.css`. Components use token names, never raw colours.

| Group | Tokens |
| --- | --- |
| Primary | `--color-primary`, `-hover`, `-soft`, `--color-on-primary` |
| Surfaces | `--color-page`, `-surface`, `-surface-raised`, `-surface-muted` |
| Borders | `--color-border`, `-border-strong` |
| Text | `--color-text`, `-text-secondary`, `-text-muted` |
| Status | `--color-good`, `-warning`, `-critical`, each with a `-soft` background |
| Spacing | `--space-1` to `--space-7` (4px to 48px) |
| Text sizes | `--text-small`, `-body`, `-large`, `-title`, `-display` |
| Corners | `--radius-small`, `-medium`, `-large` |

**To apply the brand colour:** change the `--color-primary` group in `globals.css`. It appears in three places: light, dark by system preference, and dark by choice. Check that white text stays readable on the light theme's primary colour.

## Rules

- Status colours mean state only. They always come with a text label.
- Use one primary button per screen area.
- Empty, loading and error states are required on every data view.
- Actions that are hard to undo use `ConfirmActionButton`.
- Pages must fit 375px width with no sideways scrolling. Wide tables scroll inside their own panel.
- Leave a control out until its feature works. No placeholder buttons.
- A rejected form never loses what the user typed. Use `KeepValuesForm` or `InlineActionForm`, never a plain `<form action>`.
- Every field on a page needs a unique `id`. Pass one when the same field name appears twice, as in dialogs.
- Money is shown with `formatRupees` (Indian grouping, ₹12,34,567.00). Number columns use the `numeric` class on both the heading and the cells.
- The only raw colours allowed are in `PrintableDocument.module.css`, because paper is always white.

## Components

| Component | Use |
| --- | --- |
| `Button`, `ButtonLink` | Primary, secondary, ghost and danger actions |
| `TextField`, `SelectField`, `TextAreaField` | Labelled form fields with hints and errors |
| `SubmitButton`, `FormMessage` | Form submission and results |
| `Panel` | Standard content card |
| `PageHeader` | Page title, description and actions |
| `StatusBadge` | Short status labels |
| `PersonAvatar` | Initials avatar. Photos arrive with file storage in Phase 3 |
| `EmptyState`, `LoadingPanel` | Empty and loading states |
| `ConfirmActionButton` | Confirmation dialog |
| `PaginationBar`, `DataTable.module.css` | Tables |
| `StatTiles` | Rows of headline figures |
| `ProgressBar` | Progress and workload |
| `KeepValuesForm` | Full forms. Keeps what was typed if the server rejects it |
| `InlineActionForm` | Small add forms inside a panel. Clears on success, keeps values on error |
| `ActionButton` | Quick actions that are easy to undo |
| `WorkspaceLayout.module.css` | Layout for client, project and task detail pages |
| `ListFilters.module.css` | Filter rows above tables |
| `FileUploader` | Drag-and-drop uploads with progress, straight to Storage |
| `LinkedFilesPanel` | Attachments on a task, project or client |
| `SearchablePicker` | A field you type into to find an option in a long list, such as services or industries. Single or several choices, optional groups. Works with the keyboard and screen readers |
| `FinanceDocumentForm`, `DocumentItemsEditor` | Quotation and invoice forms, with line items and live GST totals |
| `DocumentLines` | Items and totals of a saved quotation or invoice |
| `PrintableDocument` | Paper layout for quotations and invoices. Always black on white, whatever the theme |
| `ConfirmActionButton` variant `primary` | For a main action that cannot be undone, such as issuing an invoice |
| `.visually-hidden` (global class) | Text for screen readers only |
