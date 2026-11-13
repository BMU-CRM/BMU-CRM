const entityLabels: Record<string, string> = {
  employees: 'employee',
  departments: 'department',
  designations: 'designation',
  roles: 'role',
  role_permissions: 'role permission',
  clients: 'client',
  client_records: 'client record',
  client_services: 'service',
  projects: 'project',
  project_members: 'project team',
  project_milestones: 'milestone',
  tasks: 'task',
  quotations: 'quotation',
  invoices: 'invoice',
  payments: 'payment',
  finance_settings: 'finance settings',
  service_groups: 'service',
  services: 'sub service',
  industries: 'industry',
  google_account: 'Google account',
  employee_extra_roles: 'additional role',
  employee_personal_details: 'personal details of',
  employee_private_details: 'ID and bank details of',
  employment_types: 'employment type',
  leave_carry_forwards: 'carried forward leave',
  holidays: 'holiday',
  leave_types: 'leave type',
  files: 'file',
  salary_components: 'salary component',
  payroll_rules: 'payroll rule',
  salary_structures: 'salary structure',
  appraisals: 'appraisal',
  payroll_runs: 'payroll run',
  payroll_lines: 'payslip',
  job_openings: 'job opening',
  candidates: 'candidate',
  interviews: 'interview',
  letter_templates: 'letter template',
  onboarding_items: 'onboarding item',
  resignations: 'resignation',
  exit_tasks: 'exit checklist item',
  final_settlements: 'full and final settlement',
  exit_checklist_items: 'exit checklist item',
  finance_categories: 'finance category',
  bank_accounts: 'bank account',
  income_records: 'income entry',
  expense_records: 'expense',
  bank_statement_lines: 'statement line',
  invoice_follow_ups: 'payment follow-up',
  vendors: 'vendor',
  purchase_orders: 'purchase order',
  vendor_bills: 'vendor bill',
  vendor_bill_payments: 'vendor payment',
  reimbursements: 'reimbursement claim',
  department_budgets: 'department budget',
  calendar_categories: 'content calendar category',
  calendar_category_members: 'content calendar person',
};

const revealedFields: Record<string, string> = { aadhaar: 'Aadhaar number', account_number: 'bank account number' };

const fieldLabels: Record<string, string> = {
  full_name: 'name',
  phone: 'phone',
  skills: 'skills',
  role_id: 'role',
  designation_id: 'designation',
  department_id: 'department',
  reporting_manager_id: 'reporting manager',
  joining_date: 'joining date',
  employment_status: 'employment status',
  is_active: 'account status',
  invite_accepted_at: 'invitation',
  auth_user_id: 'login account',
  acting_role_id: 'role in use',
  scope: 'access scope',
  management_level: 'management level',
  parent_department_id: 'parent department',
  head_employee_id: 'department head',
  client_manager_id: 'client manager',
  next_follow_up_date: 'follow-up date',
  onboarding_date: 'onboarding date',
  important_notes: 'important notes',
  project_manager_id: 'project manager',
  assignee_id: 'assignee',
  reviewer_id: 'reviewer',
  due_date: 'due date',
  start_date: 'start date',
  estimated_hours: 'estimated hours',
  actual_hours: 'hours worked',
  completion_percentage: 'progress',
  quality_rating: 'quality rating',
  escalated_to: 'escalation',
  invoice_number: 'invoice number',
  amount_paid: 'amount received',
  bill_to_name: 'bill-to name',
  bill_to_address: 'bill-to address',
  client_gstin: 'client GSTIN',
  place_of_supply: 'place of supply',
  valid_until: 'valid until',
  issue_date: 'date',
  cancel_reason: 'cancellation reason',
  industry_id: 'industry',
  service_id: 'service',
  group_id: 'group',
  employment_type_id: 'employment type',
  probation_months: 'probation',
  confirmation_date: 'confirmation date',
  date_of_birth: 'date of birth',
  personal_email: 'personal email',
  emergency_contact_name: 'emergency contact',
  emergency_contact_relation: 'emergency contact relationship',
  emergency_contact_phone: 'emergency contact phone',
  aadhaar_encrypted: 'Aadhaar number',
  account_number_encrypted: 'account number',
  bank_name: 'bank',
  ifsc: 'IFSC',
  pan: 'PAN',
  account_holder: 'account holder',
  status_override: 'day status',
  work_mode: 'work location',
  check_in_at: 'check-in',
  check_out_at: 'check-out',
  carry_forward_cap: 'carry forward limit',
  carry_forward_expiry_months: 'carry forward expiry',
  is_encashable: 'encashment',
  document_type: 'document type',
};

// Worked out from other fields, so listing them alongside the change adds nothing.
const derivedFinanceFields = ['is_inter_state', 'cgst_total', 'sgst_total', 'igst_total', 'total', 'issued_at', 'paid_at', 'sent_at', 'decided_at', 'cancelled_at'];

// Recorded automatically alongside another change, so they add nothing for a reader.
// Bookkeeping that follows from another change already shown: the task clock follows the
// status, and the resume request shows as a comment on the task.
const hiddenFields = new Set([
  'completed_at',
  'verified_by',
  'escalated_at',
  'escalation_reason',
  'work_started_at',
  'resume_requested_at',
  'resume_requested_by',
  'resume_request_note',
  ...derivedFinanceFields,
]);

type AuditEntry = {
  action: string;
  entity_type: string;
  details: unknown;
};

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function describeAuditEntry({ action, entity_type, details }: AuditEntry): string {
  const entity = entityLabels[entity_type] ?? entity_type;
  const detailRecord = recordOf(details);
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  const label = typeof detailRecord.label === 'string' ? detailRecord.label : undefined;
  const subject = label ? `${verb} ${entity} ${label}` : `${verb} ${entity}`;

  // Someone looked at a full identity or bank number.
  if (action === 'revealed') {
    const field = revealedFields[String(detailRecord.field)] ?? 'private detail';
    return `Viewed the full ${field} of ${label ?? 'an employee'}`;
  }

  if (action !== 'updated') return subject;

  // Personal and private details record field names only, never values.
  const changed = Array.isArray(detailRecord.fields) ? detailRecord.fields.map(String) : Object.keys(recordOf(detailRecord.changes));
  const fields = changed
    .filter((field) => !hiddenFields.has(field))
    .map((field) => fieldLabels[field] ?? field.replaceAll('_', ' '));

  return fields.length > 0 ? `${subject}: ${fields.join(', ')}` : subject;
}

const readableValues: Record<string, (value: unknown) => string> = {
  status: (value) => String(value).replaceAll('_', ' '),
  priority: (value) => String(value),
  due_date: (value) => (value ? String(value) : 'none'),
  completion_percentage: (value) => `${String(value)}%`,
  actual_hours: (value) => `${String(value)}h`,
  estimated_hours: (value) => (value ? `${String(value)}h` : 'none'),
};

// A plain-language list of what changed on a task, for its history panel.
export function describeTaskChanges(details: unknown): string[] {
  const detailRecord = recordOf(details);
  if (recordOf(detailRecord.created).id) return ['Created this task'];
  // Entries that are not a change to the task itself, such as sending files, say what happened.
  if (typeof detailRecord.summary === 'string') return [detailRecord.summary];

  return Object.entries(recordOf(detailRecord.changes))
    .filter(([field]) => !hiddenFields.has(field))
    .map(([field, change]) => {
      const label = fieldLabels[field] ?? field.replaceAll('_', ' ');
      const format = readableValues[field];
      const { from, to } = recordOf(change);

      if (!format) return `Changed ${label}`;
      return `Changed ${label} from ${format(from)} to ${format(to)}`;
    });
}
