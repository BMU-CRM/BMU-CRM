import type { Metadata } from 'next';
import { HolidayForm } from '@/components/hr/HrForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { isCalendarDate } from '@/lib/calendar/calendarRange';
import { requirePagePermission } from '@/server/services/accessService';

export const metadata: Metadata = { title: 'Add holiday' };

type NewHolidayPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function NewHolidayPage({ searchParams }: NewHolidayPageProps) {
  await requirePagePermission(permissionKeys.hrManage);
  const { date } = await searchParams;

  return (
    <>
      <PageHeader title="Add holiday" />
      <Panel>
        <HolidayForm defaultDate={isCalendarDate(date) ? date : undefined} />
      </Panel>
    </>
  );
}
