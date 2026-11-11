import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { LineChart } from '@/components/charts/LineChart';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PeriodFilter } from '@/components/ui/PeriodFilter';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { chooseRange, periodLabels } from '@/lib/finance/financialPeriods';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getHrDashboard, getUpcomingBirthdays } from '@/server/services/hrService';
import styles from './HrDashboard.module.css';

export const metadata: Metadata = { title: 'HR dashboard' };

type HrDashboardProps = {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The HR person's overview of the whole company: people, attendance and leave.
// Today's figures are for today whatever the period; the period sets joinings, the
// attendance trend and leave by type.
export default async function HrDashboardPage({ searchParams }: HrDashboardProps) {
  const access = await requirePagePermission(permissionKeys.hrDashboard);
  const params = await searchParams;
  const { range, period } = chooseRange(params, todayInIndia(), 'this-month');
  const [hr, birthdays] = await Promise.all([getHrDashboard(range.from, range.to), getUpcomingBirthdays()]);
  const canApprove = access.permissions[permissionKeys.leaveApprove] !== undefined;
  const leaveHref = access.permissions[permissionKeys.leaveApprove] === 'organisation' ? '/hr/leave' : '/approvals';

  return (
    <>
      <PageHeader
        title="HR dashboard"
        description={`${period ? `${periodLabels[period]}: ` : ''}${formatDate(range.from)} to ${formatDate(range.to)}.`}
      />
      <PeriodFilter basePath="/hr" range={range} period={period} />

      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Employees', value: hr.total, href: '/people/employees' },
            { label: 'Active', value: hr.active },
            { label: 'New joinings in period', value: hr.newJoinings },
            { label: 'Present today', value: hr.presentToday, href: '/attendance/report' },
          ]}
        />
        <StatTiles
          tiles={[
            { label: 'On leave today', value: hr.onLeaveToday },
            { label: 'Leave waiting for approval', value: hr.pendingLeave, href: canApprove ? leaveHref : undefined },
            { label: 'Serving notice', value: hr.servingNotice },
            { label: 'Work anniversaries, 30 days', value: hr.anniversaries.length },
          ]}
        />

        <div className={layout.columns}>
          <Panel title="Attendance trend" description="People who checked in on each working day of the period (up to 60 days).">
            <LineChart
              label="People present each working day"
              points={hr.attendanceTrend.map((day) => ({ label: shortDay.format(new Date(`${day.date}T00:00:00Z`)), value: day.present }))}
              valueHeading="Present"
            />
          </Panel>
          <Panel title="Leave by type" description="Approved leave days starting in the period.">
            <DonutChart
              label="Approved leave days by type"
              slices={hr.leaveByType.map((row) => ({ label: row.name, value: row.days }))}
              valueHeading="Days"
              formatValue={(value) => `${value.toLocaleString('en-IN')} ${value === 1 ? 'day' : 'days'}`}
              centreLabel={`${hr.leaveByType.reduce((sum, row) => sum + row.days, 0)} days`}
            />
          </Panel>
        </div>

        <div className={layout.columns}>
          <Panel title="Headcount by department" description="Active employees.">
            <BarChart
              label="Active employees by department"
              data={hr.departments.map((department) => ({ label: department.name, value: department.count }))}
              valueHeading="People"
            />
          </Panel>
          <Panel title="Work anniversaries" description="In the next 30 days." flush>
            {hr.anniversaries.length === 0 ? (
              <p className={layout.emptyText}>No work anniversaries in the next 30 days.</p>
            ) : (
              <ul className={layout.list}>
                {hr.anniversaries.map((person) => (
                  <li key={person.id} className={`${layout.row} ${styles.person}`}>
                    <PersonAvatar name={person.name} size="small" />
                    <div className={layout.rowMain}>
                      <Link href={`/people/employees/${person.id}`} className={layout.link}>
                        {person.name}
                      </Link>
                      <p className={layout.muted}>
                        {person.years} {person.years === 1 ? 'year' : 'years'} on {formatDate(person.date)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.note}>
              <p className={styles.noteTitle}>Birthdays in the next 30 days</p>
              {birthdays.length === 0 ? (
                <p>None. Birthdays appear once dates of birth are added to employee records.</p>
              ) : (
                <ul>
                  {birthdays.map((person) => (
                    <li key={person.employee_id}>
                      <Link href={`/people/employees/${person.employee_id}`} className={layout.link}>
                        {person.full_name}
                      </Link>{' '}
                      on {formatDate(person.birthday)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
