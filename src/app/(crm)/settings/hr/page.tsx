import type { Metadata } from 'next';
import { EmploymentTypeForm, LeaveTypeForm, WorkingHoursForm } from '@/components/hr/HrForms';
import { ButtonLink } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmploymentTypes } from '@/server/services/employeeService';
import { getCompanySettings, listHolidaysBetween, listLeaveTypes } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'HR settings' };

export default async function HrSettingsPage() {
  await requirePagePermission(permissionKeys.hrManage);
  const today = todayInIndia();

  const [settings, leaveTypes, employmentTypes, upcomingHolidays] = await Promise.all([
    getCompanySettings(),
    listLeaveTypes(),
    listEmploymentTypes(),
    listHolidaysBetween(today, `${Number(today.slice(0, 4)) + 1}-12-31`),
  ]);

  return (
    <>
      <PageHeader title="HR settings" description="Working hours, leave types, employment types and holidays for the whole company." />
      <div className={layout.stack}>
        <Panel title="Working hours" description="Used for late arrivals, early departures, half days, overtime and counting leave days.">
          <WorkingHoursForm settings={settings} />
        </Panel>
        <Panel
          title="Leave types"
          description="Allowances are per calendar year. Unused days carry forward on 1 January, up to each type's limit. Turning a type off hides it from new requests."
          flush
        >
          <ul className={layout.list}>
            {leaveTypes.map((leaveType) => (
              <li key={leaveType.id} className={layout.sectionForm}>
                <LeaveTypeForm leaveType={leaveType} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add a leave type</p>
              <LeaveTypeForm />
            </li>
          </ul>
        </Panel>
        <Panel title="Employment types" description="Offered when editing an employee. Turning one off keeps it on the people who already have it." flush>
          <ul className={layout.list}>
            {employmentTypes.map((employmentType) => (
              <li key={employmentType.id} className={layout.sectionForm}>
                <EmploymentTypeForm employmentType={employmentType} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add an employment type</p>
              <EmploymentTypeForm />
            </li>
          </ul>
        </Panel>
        <Panel
          title="Holidays"
          description="Holidays are not counted as working days or leave."
          action={<ButtonLink href="/hr/holidays">Open the holiday calendar</ButtonLink>}
          flush
        >
          {upcomingHolidays.length === 0 ? (
            <p className={layout.emptyText}>No upcoming holidays. Add them from the holiday calendar.</p>
          ) : (
            <ul className={layout.list}>
              {upcomingHolidays.slice(0, 5).map((holiday) => (
                <li key={holiday.id} className={layout.row}>
                  <span className={layout.rowMain}>
                    <span className={layout.rowTitle}>{holiday.name}</span> <span className={layout.muted}>{formatDate(holiday.holiday_date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
