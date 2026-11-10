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
};

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
  actual_hours: 'actual hours',
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
};

// Worked out from other fields, so listing them alongside the change adds nothing.
const derivedFinanceFields = ['is_inter_state', 'cgst_total', 'sgst_total', 'igst_total', 'total', 'issued_at', 'paid_at', 'sent_at', 'decided_at', 'cancelled_at'];

// Recorded automatically alongside another change, so they add nothing for a reader.
const hiddenFields = new Set(['completed_at', 'verified_by', 'escalated_at', 'escalation_reason', ...derivedFinanceFields]);

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

  if (action !== 'updated') return subject;

  const fields = Object.keys(recordOf(detailRecord.changes))
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
