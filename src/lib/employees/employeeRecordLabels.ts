// Labels and masking for the employee record, shared by pages, forms and exports.

export const genderLabels: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefers not to say',
};

export const employeeDocumentTypes = [
  'aadhaar',
  'pan',
  'certificate',
  'resume',
  'bank',
  'offer_letter',
  'appointment_letter',
  'other',
] as const;

export type EmployeeDocumentType = (typeof employeeDocumentTypes)[number];

export const documentTypeLabels: Record<EmployeeDocumentType, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  certificate: 'Certificate',
  resume: 'Resume',
  bank: 'Bank proof',
  offer_letter: 'Offer letter',
  appointment_letter: 'Appointment letter',
  other: 'Other',
};

export const employmentStatusLabels: Record<string, string> = {
  active: 'Active',
  on_leave: 'On leave',
  notice_period: 'Notice period',
  exited: 'Exited',
};

// What each field in the employment history is called.
export const historyFieldLabels: Record<string, string> = {
  created: 'Record created',
  designation_id: 'Designation',
  department_id: 'Department',
  reporting_manager_id: 'Reporting manager',
  role_id: 'Role',
  employment_status: 'Employment status',
  employment_type_id: 'Employment type',
  joining_date: 'Joining date',
  probation_months: 'Probation (months)',
  confirmation_date: 'Confirmation date',
  is_active: 'Account',
};

export function maskAadhaar(last4: string | null) {
  return last4 ? `XXXX XXXX ${last4}` : null;
}

export function maskAccount(last4: string | null) {
  return last4 ? `XXXXXX${last4}` : null;
}

// 123456789012 becomes 1234 5678 9012.
export function formatAadhaar(digits: string) {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
