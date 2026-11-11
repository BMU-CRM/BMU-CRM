import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HolidayForm } from '@/components/hr/HrForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { getHoliday } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Edit holiday' };

type EditHolidayPageProps = {
  params: Promise<{ holidayId: string }>;
};

export default async function EditHolidayPage({ params }: EditHolidayPageProps) {
  await requirePagePermission(permissionKeys.hrManage);
  const holidayId = parseId((await params).holidayId);
  if (!holidayId) notFound();

  const holiday = await getHoliday(holidayId);
  if (!holiday) notFound();

  return (
    <>
      <PageHeader title={`Edit ${holiday.name}`} />
      <Panel>
        <HolidayForm holiday={holiday} />
      </Panel>
    </>
  );
}
