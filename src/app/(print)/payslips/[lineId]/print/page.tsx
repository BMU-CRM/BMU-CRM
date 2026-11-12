import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayslipPrint } from '@/components/payroll/PayslipPrint';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requireAccess } from '@/server/services/accessService';
import { getCompanyProfile, getPayrollLine } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Payslip' };

// Payroll people print any payslip; everyone else only their own, once paid. Row level
// security decides which lines can be read at all.
export default async function PayslipPrintPage({ params }: { params: Promise<{ lineId: string }> }) {
  const access = await requireAccess();
  const lineId = parseId((await params).lineId);
  if (!lineId) notFound();

  const [line, company] = await Promise.all([getPayrollLine(lineId), getCompanyProfile()]);
  if (!line) notFound();

  const isPayroll = access.permissions[permissionKeys.payrollManage] !== undefined || access.permissions[permissionKeys.payrollApprove] !== undefined;
  const backHref = isPayroll && line.employee_id !== access.employee.id ? `/hr/payroll/${line.run_id}` : '/payslips';

  return <PayslipPrint line={line} company={company} backHref={backHref} />;
}
