import { PageTabs } from '@/components/ui/PageTabs';

export const employeeRecordTabs = ['overview', 'personal', 'private', 'documents', 'history'] as const;
export type EmployeeRecordTab = (typeof employeeRecordTabs)[number];

const labels: Record<EmployeeRecordTab, string> = {
  overview: 'Overview',
  personal: 'Personal',
  private: 'ID and bank',
  documents: 'Documents',
  history: 'History',
};

// The parts of an employee's record, each shown only to people who may see it.
export function EmployeeRecordTabs({ employeeId, tabs, current }: { employeeId: string; tabs: EmployeeRecordTab[]; current: EmployeeRecordTab }) {
  return (
    <PageTabs
      label="Employee record"
      tabs={tabs.map((tab) => ({
        href: tab === 'overview' ? `/people/employees/${employeeId}` : `/people/employees/${employeeId}?tab=${tab}`,
        label: labels[tab],
        current: tab === current,
      }))}
    />
  );
}
