import tableStyles from '@/components/ui/DataTable.module.css';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { employmentStatusLabels } from '@/lib/employees/employeeRecordLabels';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { formatPayrollMonth } from '@/lib/payroll/payrollMonth';
import type { LeaveSummaryRow } from '@/lib/hr/hrReports';
import type { PeopleReport } from '@/server/services/hrReportService';

export type PayrollSummaryRow = { month: string; employee_count: number; total_gross: number; total_deductions: number; total_net: number; paid_on: string | null };

function CountTable({ title, heading, rows, labels }: { title: string; heading: string; rows: { name: string; count: number }[]; labels?: Record<string, string> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Panel title={title} flush>
      {rows.length === 0 ? (
        <p className={layout.emptyText}>Nobody to count.</p>
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">{heading}</th>
                <th scope="col" className={tableStyles.numeric}>People</th>
                <th scope="col" className={tableStyles.numeric}>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{labels?.[row.name] ?? row.name}</th>
                  <td className={tableStyles.numeric}>{row.count}</td>
                  <td className={tableStyles.numeric}>{total > 0 ? `${Math.round((row.count / total) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function PeopleTables({ report }: { report: PeopleReport }) {
  return (
    <div className={layout.columns}>
      <CountTable title="Headcount by department" heading="Department" rows={report.byDepartment} />
      <div className={layout.stack}>
        <CountTable title="By employment type" heading="Type" rows={report.byType} />
        <CountTable title="By status" heading="Status" rows={report.byStatus} labels={employmentStatusLabels} />
      </div>
    </div>
  );
}

export function MovementTables({ report }: { report: PeopleReport }) {
  return (
    <div className={layout.columns}>
      <Panel title={`Joined (${report.joined})`} flush>
        {report.joiners.length === 0 ? (
          <p className={layout.emptyText}>Nobody joined in this period.</p>
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Joined</th>
                </tr>
              </thead>
              <tbody>
                {report.joiners.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <p className={tableStyles.primaryText}>{person.full_name}</p>
                      <p className={tableStyles.secondaryText}>{[person.employee_code, person.department, person.designation].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td>{person.joining_date ? formatDate(person.joining_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title={`Left (${report.left})`} flush>
        {report.leavers.length === 0 ? (
          <p className={layout.emptyText}>Nobody left in this period.</p>
        ) : (
          <div className={tableStyles.scroller}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Last day</th>
                </tr>
              </thead>
              <tbody>
                {report.leavers.map((row) => (
                  <tr key={row.employee_id}>
                    <td>
                      <p className={tableStyles.primaryText}>{row.person?.full_name ?? 'Former employee'}</p>
                      <p className={tableStyles.secondaryText}>{[row.person?.department, row.reason].filter(Boolean).join(' · ')}</p>
                    </td>
                    <td>{formatDate(row.last_working_day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function LeaveTable({ rows, year }: { rows: LeaveSummaryRow[]; year: number }) {
  return (
    <Panel title={`Leave taken in ${year}, by type`} description="Approved and waiting days for leave starting in the year." flush>
      {rows.length === 0 ? (
        <p className={layout.emptyText}>No leave types set up.</p>
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Leave type</th>
                <th scope="col" className={tableStyles.numeric}>People</th>
                <th scope="col" className={tableStyles.numeric}>Days allowed</th>
                <th scope="col" className={tableStyles.numeric}>Approved days</th>
                <th scope="col" className={tableStyles.numeric}>Waiting</th>
                <th scope="col" className={tableStyles.numeric}>Used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.leaveType}>
                  <th scope="row">{row.leaveType}</th>
                  <td className={tableStyles.numeric}>{row.people}</td>
                  <td className={tableStyles.numeric}>{row.allowance === null ? 'No limit' : row.allowance}</td>
                  <td className={tableStyles.numeric}>{row.approved}</td>
                  <td className={tableStyles.numeric}>{row.pending}</td>
                  <td className={tableStyles.numeric}>{row.allowance ? `${Math.round((row.approved / row.allowance) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function PayrollTable({ rows, year }: { rows: PayrollSummaryRow[]; year: number }) {
  const total = (key: 'total_gross' | 'total_deductions' | 'total_net') => rows.reduce((sum, row) => sum + Number(row[key]), 0);
  return (
    <Panel title={`Salaries paid in ${year}`} flush>
      {rows.length === 0 ? (
        <p className={layout.emptyText}>No payroll paid in {year}.</p>
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className={tableStyles.numeric}>People</th>
                <th scope="col" className={tableStyles.numeric}>Gross</th>
                <th scope="col" className={tableStyles.numeric}>Deductions</th>
                <th scope="col" className={tableStyles.numeric}>Net paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{formatPayrollMonth(row.month)}</th>
                  <td className={tableStyles.numeric}>{row.employee_count}</td>
                  <td className={tableStyles.numeric}>{formatRupees(row.total_gross)}</td>
                  <td className={tableStyles.numeric}>{formatRupees(row.total_deductions)}</td>
                  <td className={tableStyles.numeric}>{formatRupees(row.total_net)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className={tableStyles.primaryText}>
                  Total
                </th>
                <td />
                <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(total('total_gross'))}</td>
                <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(total('total_deductions'))}</td>
                <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(total('total_net'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
