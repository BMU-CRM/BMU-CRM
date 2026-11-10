import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { requireAccess } from '@/server/services/accessService';
import { getNotificationSummary } from '@/server/services/notificationService';

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const [access, cookieStore] = await Promise.all([requireAccess(), cookies()]);
  const notifications = await getNotificationSummary();

  return (
    <AppShell
      permissions={access.permissions}
      initiallyCollapsed={cookieStore.get('sidebar')?.value === 'collapsed'}
      notifications={notifications}
      user={{
        employeeId: access.employee.id,
        fullName: access.employee.full_name,
        workEmail: access.employee.work_email,
        roleName: access.employee.role?.name ?? '',
      }}
    >
      {children}
    </AppShell>
  );
}
