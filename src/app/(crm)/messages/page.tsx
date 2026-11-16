import type { Metadata } from 'next';
import { MessagesShell } from '@/components/messages/MessagesShell';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listMyConversations } from '@/server/services/messageService';
import styles from './MessagesLayout.module.css';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage() {
  await requirePagePermission(permissionKeys.messagesUse);
  const conversations = await listMyConversations();

  return (
    <MessagesShell conversations={conversations}>
      <p className={styles.placeholder}>Choose a conversation, or search for someone to start one.</p>
    </MessagesShell>
  );
}
