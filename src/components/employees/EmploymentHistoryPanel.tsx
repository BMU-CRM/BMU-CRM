import { History } from 'lucide-react';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { employmentStatusLabels, historyFieldLabels } from '@/lib/employees/employeeRecordLabels';
import { formatDate, formatDateTime } from '@/lib/formatDate';

type HistoryEntry = {
  changed_at: string;
  actor_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

function describe(field: string, value: string | null) {
  if (value === null || value === '') return 'None';
  if (field === 'employment_status') return employmentStatusLabels[value] ?? value;
  if (field === 'is_active') return value === 'true' ? 'Active' : 'Deactivated';
  if (field === 'joining_date' || field === 'confirmation_date') return formatDate(value);
  return value;
}

// Changes to someone's job over time, from the audit log. Salary increments join this
// list when payroll is built.
export function EmploymentHistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Panel title="Employment history" description="Changes to designation, department, manager, role and status." flush>
      {entries.length === 0 ? (
        <EmptyState icon={History} title="No changes recorded yet" description="Changes made from now on appear here." />
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What changed</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr key={`${entry.changed_at}-${entry.field}-${index}`}>
                  <td>{formatDateTime(entry.changed_at)}</td>
                  <td className={tableStyles.primaryText}>{historyFieldLabels[entry.field] ?? entry.field}</td>
                  <td>{entry.field === 'created' ? '—' : describe(entry.field, entry.old_value)}</td>
                  <td>{entry.field === 'created' ? '—' : describe(entry.field, entry.new_value)}</td>
                  <td>{entry.actor_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
