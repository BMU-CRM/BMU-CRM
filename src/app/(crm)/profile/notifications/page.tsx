import type { Metadata } from 'next';
import { PushDeviceToggle, PushPreferencesForm } from '@/components/notifications/PushSettings';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { requireAccess } from '@/server/services/accessService';
import { getPushPreferences } from '@/server/services/notificationService';

export const metadata: Metadata = { title: 'Notification settings' };

export default async function NotificationSettingsPage() {
  await requireAccess();
  const preferences = await getPushPreferences();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Everything always appears under the bell. Here you choose what also arrives as a push notification."
      />
      <div className={layout.stack}>
        {publicKey && (
          <Panel title="This device">
            <PushDeviceToggle publicKey={publicKey} />
          </Panel>
        )}
        <Panel title="Send a push notification when">
          <PushPreferencesForm preferences={preferences} />
        </Panel>
      </div>
    </>
  );
}
