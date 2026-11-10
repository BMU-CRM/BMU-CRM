import type { Metadata } from 'next';
import { LeaveTypeForm, WorkingHoursForm } from '@/components/hr/HrForms';
import { ActionButton } from '@/components/ui/ActionButton';
import { TextField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { addHolidayAction, removeHolidayAction } from '@/server/actions/hrActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getCompanySettings, listHolidays, listLeaveTypes } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'HR settings' };

export default async function HrSettingsPage() {
  await requirePagePermission(permissionKeys.hrManage);
  const year = Number(todayInIndia().slice(0, 4));

  const [settings, leaveTypes, holidays, nextYearHolidays] = await Promise.all([
    getCompanySettings(),
    listLeaveTypes(),
    listHolidays(year),
    listHolidays(year + 1),
  ]);

  return (
    <>
      <PageHeader title="HR settings" description="Working hours, holidays and leave types for the whole company." />
      <div className={layout.stack}>
        <Panel title="Working hours" description="Used for late arrivals, early departures and counting leave days.">
          <WorkingHoursForm settings={settings} />
        </Panel>
        <Panel title="Leave types" description="Allowances are per calendar year. Turning a type off hides it from new requests." flush>
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
        <Panel title="Holidays" description="Holidays are not counted as working days or leave." flush>
          <ul className={layout.list}>
            {[...holidays, ...nextYearHolidays].map((holiday) => (
              <li key={holiday.id} className={layout.row}>
                <span className={layout.rowMain}>
                  <span className={layout.rowTitle}>{holiday.name}</span> <span className={layout.muted}>{formatDate(holiday.holiday_date)}</span>
                </span>
                <ActionButton label="Remove" action={removeHolidayAction.bind(null, holiday.id)} />
              </li>
            ))}
          </ul>
          {holidays.length + nextYearHolidays.length === 0 && <p className={layout.emptyText}>No holidays added yet.</p>}
          <div className={layout.sectionForm}>
            <InlineActionForm action={addHolidayAction} submitLabel="Add holiday">
              <TextField label="Date" name="holidayDate" type="date" required />
              <TextField label="Name" name="name" required />
            </InlineActionForm>
          </div>
        </Panel>
      </div>
    </>
  );
}
