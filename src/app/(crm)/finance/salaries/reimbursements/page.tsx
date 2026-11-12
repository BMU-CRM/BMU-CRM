import { redirect } from 'next/navigation';

// Claims are listed on the Reimbursements tab; this address only appears in breadcrumbs.
export default function FinanceReimbursementsPage() {
  redirect('/finance/salaries?view=reimbursements');
}
