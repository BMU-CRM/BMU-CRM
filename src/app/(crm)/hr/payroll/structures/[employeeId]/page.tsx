import { Plus, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { deleteSalaryStructureAction } from '@/server/actions/payrollActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getEmployee } from '@/server/services/employeeService';
import { getEmployeeSalary } from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Salary' };

export default async function EmployeeSalaryPage({ params }: { params: Promise<{ employeeId: string }> }) {
  await requirePagePermission(permissionKeys.payrollManage);
  const employeeId = parseId((await params).employeeId);
  if (!employeeId) notFound();
  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  const today = todayInIndia();
  const { structures, revisions, appraisals } = await getEmployeeSalary(employeeId);
  const current = structures.find((structure) => structure.effective_from <= today) ?? null;

  return (
    <>
      <PageHeader
        title={`Salary: ${employee.full_name}`}
        description={[employee.employee_code, employee.department?.name, employee.designation?.title].filter(Boolean).join(' · ')}
        actions={
          <>
            <ButtonLink href={`/hr/payroll/appraisals/new?employeeId=${employee.id}`}>Add appraisal</ButtonLink>
            <ButtonLink href={`/hr/payroll/structures/${employee.id}/new`} variant="primary">
              <Plus size={16} aria-hidden="true" />
              {current ? 'Revise salary' : 'Set salary'}
            </ButtonLink>
          </>
        }
      />
      <div className={layout.stack}>
        {current?.cost ? (
          <>
            <StatTiles
              tiles={[
                { label: 'Monthly gross', value: formatRupees(current.gross ?? 0) },
                { label: 'Employer PF and ESI', value: formatRupees(current.cost.employer_pf + current.cost.employer_esi) },
                { label: 'Monthly cost to company', value: formatRupees(current.cost.monthly_ctc) },
                { label: 'Yearly cost to company', value: formatRupees(current.cost.annual_ctc) },
              ]}
            />
            {current.cost.warnings.length > 0 && (
              <p className={`${layout.muted} ${layout.badges}`}>
                <TriangleAlert size={14} aria-hidden="true" /> {current.cost.warnings.join('. ')}. Employer contributions for those are left out.
              </p>
            )}
          </>
        ) : (
          <Panel>
            <p className={layout.muted}>No salary is set yet, so this person is left off payroll.</p>
          </Panel>
        )}
        <Panel title="Salary structures" description="Monthly amounts. The newest one on or before a payroll month is used." flush>
          {structures.length === 0 ? (
            <p className={layout.emptyText}>None yet.</p>
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">From</th>
                    <th scope="col" className={tableStyles.numeric}>Basic</th>
                    <th scope="col" className={tableStyles.numeric}>HRA</th>
                    <th scope="col" className={tableStyles.numeric}>Allowances</th>
                    <th scope="col" className={tableStyles.numeric}>Incentive and bonus</th>
                    <th scope="col" className={tableStyles.numeric}>Gross</th>
                    <th scope="col" className={tableStyles.numeric}>Yearly CTC</th>
                    <th scope="col">Deductions</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {structures.map((structure) => (
                    <tr key={structure.id}>
                      <td>
                        <p className={tableStyles.primaryText}>{formatDate(structure.effective_from)}</p>
                        {structure.id === current?.id && <p className={tableStyles.secondaryText}>In force now</p>}
                        {structure.effective_from > today && <p className={tableStyles.secondaryText}>Starts later</p>}
                      </td>
                      <td className={tableStyles.numeric}>{formatRupees(structure.basic)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(structure.hra)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(structure.other_allowances + structure.special_allowance)}</td>
                      <td className={tableStyles.numeric}>{formatRupees(structure.incentive + structure.bonus)}</td>
                      <td className={`${tableStyles.numeric} ${tableStyles.primaryText}`}>{formatRupees(structure.gross ?? 0)}</td>
                      <td className={tableStyles.numeric}>{structure.cost ? formatRupees(structure.cost.annual_ctc) : '—'}</td>
                      <td className={tableStyles.secondaryText}>
                        {[structure.pf_applies ? 'PF' : null, structure.esi_applies ? 'ESI' : null, structure.pt_state ? `PT ${structure.pt_state}` : null, structure.tds_monthly !== null ? `TDS ${formatRupees(structure.tds_monthly)}` : null]
                          .filter(Boolean)
                          .join(' · ') || 'None'}
                      </td>
                      <td>
                        <div className={tableStyles.rowActions}>
                          <ConfirmActionButton
                            label="Remove"
                            title="Remove this salary structure?"
                            description="Only possible if no payroll run uses it yet. Use it for a structure entered by mistake."
                            confirmLabel="Remove"
                            action={deleteSalaryStructureAction.bind(null, employee.id, structure.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className={layout.columns}>
          <Panel title="Salary revisions" flush>
            {revisions.length === 0 ? (
              <p className={layout.emptyText}>No revisions yet.</p>
            ) : (
              <div className={tableStyles.scroller}>
                <table className={tableStyles.table}>
                  <thead>
                    <tr>
                      <th scope="col">From</th>
                      <th scope="col" className={tableStyles.numeric}>Before</th>
                      <th scope="col" className={tableStyles.numeric}>After</th>
                      <th scope="col" className={tableStyles.numeric}>Change</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisions.map((revision) => (
                      <tr key={revision.id}>
                        <td>{formatDate(revision.effective_from)}</td>
                        <td className={tableStyles.numeric}>{formatRupees(revision.previous_gross)}</td>
                        <td className={tableStyles.numeric}>{formatRupees(revision.revised_gross)}</td>
                        <td className={tableStyles.numeric}>{revision.change_percent === null ? '—' : `${revision.change_percent > 0 ? '+' : ''}${revision.change_percent}%`}</td>
                        <td className={tableStyles.secondaryText}>{revision.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Appraisals" flush>
            {appraisals.length === 0 ? (
              <p className={layout.emptyText}>No appraisals yet.</p>
            ) : (
              <ul className={layout.list}>
                {appraisals.map((appraisal) => (
                  <li key={appraisal.id} className={layout.row}>
                    <span className={layout.rowMain}>
                      <span className={layout.rowTitle}>
                        {appraisal.period_label}: {appraisal.rating} of 5
                      </span>
                      <span className={layout.muted}> by {appraisal.reviewer?.full_name ?? 'someone who has left'}</span>
                      {appraisal.notes && <p className={layout.muted}>{appraisal.notes}</p>}
                    </span>
                    <ButtonLink href={`/hr/payroll/appraisals/${appraisal.id}/edit`} variant="ghost">
                      Edit
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
