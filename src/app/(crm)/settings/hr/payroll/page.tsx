import { Plus, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { HrSettingsTabs } from '@/components/hr/HrSettingsTabs';
import { PayrollSettingsForm } from '@/components/payroll/PayrollForms';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { payrollRuleKinds, payrollRuleLabels, type PayrollRuleKind } from '@/lib/validation/payrollSchema';
import { deletePayrollRuleAction } from '@/server/actions/payrollActions';
import { requirePagePermission } from '@/server/services/accessService';
import {
  getPayrollSettings,
  getPayrollSetupProblems,
  listPayrollRules,
  listSalaryComponents,
  type PayrollRule,
} from '@/server/services/payrollService';

export const metadata: Metadata = { title: 'Payroll settings' };

function describeRule(rule: PayrollRule) {
  if (rule.kind === 'pt') {
    return (rule.slabs ?? []).map((slab) => `${formatRupees(slab.from)}${slab.to === null ? ' and above' : ` to ${formatRupees(slab.to)}`}: ${formatRupees(slab.amount)}`).join(' · ');
  }
  const limit = rule.wage_limit === null ? '' : rule.kind === 'tds' ? `, above ${formatRupees(rule.wage_limit)} a year` : `, limit ${formatRupees(rule.wage_limit)}`;
  if (rule.kind === 'tds') return `${rule.employee_rate}%${limit}`;
  return `Employee ${rule.employee_rate}%, employer ${rule.employer_rate}%${limit}`;
}

export default async function PayrollSettingsPage() {
  const access = await requirePagePermission(permissionKeys.payrollManage);
  const today = todayInIndia();
  const [settings, components, rules, problems] = await Promise.all([
    getPayrollSettings(),
    listSalaryComponents(),
    listPayrollRules(),
    getPayrollSetupProblems(),
  ]);

  return (
    <>
      <PageHeader title="HR settings" description="Payroll rules, salary components and how pay is worked out. No rate is built in: enter the current ones." />
      <HrSettingsTabs current="payroll" permissions={access.permissions} />
      <div className={layout.stack}>
        {problems.length > 0 && (
          <Panel title="Not set up yet">
            <ul className={layout.factsStacked}>
              {problems.map((problem) => (
                <li key={problem} className={layout.badges}>
                  <TriangleAlert size={16} aria-hidden="true" />
                  {problem}
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <Panel title="Payroll defaults">
          <PayrollSettingsForm settings={settings} />
        </Panel>
        {payrollRuleKinds.map((kind: PayrollRuleKind) => {
          const kindRules = rules.filter((rule) => rule.kind === kind);
          return (
            <Panel
              key={kind}
              title={payrollRuleLabels[kind]}
              description={kind === 'pt' ? 'Monthly slabs on gross pay, per state.' : 'Each rule applies from its date until a newer one starts.'}
              action={
                <ButtonLink href={`/settings/hr/payroll/rules/new?kind=${kind}`} variant="ghost">
                  <Plus size={16} aria-hidden="true" />
                  Add
                </ButtonLink>
              }
              flush
            >
              {kindRules.length === 0 ? (
                <p className={layout.emptyText}>Not set up.</p>
              ) : (
                <ul className={layout.list}>
                  {kindRules.map((rule, index) => {
                    const inForce = rule.effective_from <= today && !kindRules.slice(0, index).some((newer) => newer.effective_from <= today && newer.state === rule.state);
                    return (
                      <li key={rule.id} className={layout.row}>
                        <span className={layout.rowMain}>
                          <span className={layout.rowTitle}>
                            {rule.state ? `${rule.state}, from ` : 'From '}
                            {formatDate(rule.effective_from)}
                          </span>{' '}
                          {inForce && <StatusBadge tone="good">In force</StatusBadge>}
                          <p className={layout.muted}>{describeRule(rule)}</p>
                        </span>
                        <span className={layout.rowActions}>
                          <ButtonLink href={`/settings/hr/payroll/rules/${rule.id}/edit`} variant="ghost">
                            Edit
                          </ButtonLink>
                          <ConfirmActionButton
                            label="Remove"
                            title="Remove this rule?"
                            description="Payroll runs already worked out keep their figures. Draft runs change when recalculated."
                            confirmLabel="Remove rule"
                            action={deletePayrollRuleAction.bind(null, rule.id)}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          );
        })}
        <Panel
          title="Salary components"
          description="Extra earnings or deductions applied to everyone on payroll, such as a canteen deduction."
          action={
            <ButtonLink href="/settings/hr/payroll/components/new" variant="ghost">
              <Plus size={16} aria-hidden="true" />
              Add
            </ButtonLink>
          }
          flush
        >
          {components.length === 0 ? (
            <p className={layout.emptyText}>None yet. Basic, HRA, allowances, incentive and bonus are part of each salary structure.</p>
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    <th scope="col">Type</th>
                    <th scope="col">Worked out as</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((component) => (
                    <tr key={component.id}>
                      <td>
                        <Link href={`/settings/hr/payroll/components/${component.id}/edit`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {component.name}
                        </Link>
                      </td>
                      <td>{component.kind === 'earning' ? `Earning${component.is_taxable ? '' : ', not taxable'}` : 'Deduction'}</td>
                      <td>
                        {component.calculation === 'fixed'
                          ? `${formatRupees(component.amount ?? 0)} a month`
                          : `${component.percentage}% of ${component.percentage_of === 'basic' ? 'basic' : 'fixed gross'}`}
                      </td>
                      <td>
                        <StatusBadge tone={component.is_active ? 'good' : 'neutral'}>{component.is_active ? 'In use' : 'Off'}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
