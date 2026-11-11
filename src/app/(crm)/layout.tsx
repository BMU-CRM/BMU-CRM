import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PushPrompt } from '@/components/notifications/PushPrompt';
import { requireAccess } from '@/server/services/accessService';
import { listMyRoles } from '@/server/services/employeeService';
import { getNotificationSummary } from '@/server/services/notificationService';

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const [access, cookieStore] = await Promise.all([requireAccess(), cookies()]);
  const [notifications, roles] = await Promise.all([getNotificationSummary(), listMyRoles()]);
  const currentRole = roles.find((role) => role.isCurrent);
  const pushPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return (
    <AppShell
      permissions={access.permissions}
      initiallyCollapsed={cookieStore.get('sidebar')?.value === 'collapsed'}
      notifications={notifications}
      user={{
        employeeId: access.employee.id,
        fullName: access.employee.full_name,
        workEmail: access.employee.work_email,
        roleName: currentRole?.name ?? access.employee.role?.name ?? '',
        roles,
      }}
    >
      {pushPublicKey && <PushPrompt publicKey={pushPublicKey} />}
      {children}
    </AppShell>
  );
}
