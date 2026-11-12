import { PageTabs } from '@/components/ui/PageTabs';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { payrollRunStatusLabels } from '@/lib/validation/payrollSchema';

const tabs = [
  { key: 'runs', href: '/hr/payroll', label: 'Payroll runs' },
  { key: 'structures', href: '/hr/payroll/structures', label: 'Salary structures' },
  { key: 'appraisals', href: '/hr/payroll/appraisals', label: 'Appraisals' },
] as const;

export function PayrollTabs({ current }: { current: (typeof tabs)[number]['key'] }) {
  return <PageTabs label="Payroll" tabs={tabs.map((tab) => ({ href: tab.href, label: tab.label, current: tab.key === current }))} />;
}

const tones: Record<string, 'neutral' | 'good' | 'warning' | 'critical'> = {
  draft: 'neutral',
  in_review: 'warning',
  approved: 'good',
  paid: 'good',
};

export function PayrollStatusBadge({ status }: { status: string }) {
  return <StatusBadge tone={tones[status]}>{payrollRunStatusLabels[status] ?? status}</StatusBadge>;
}
