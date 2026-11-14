'use client';

import type { ReactNode } from 'react';
import styles from './ChatHeaderActions.module.css';

export const openChatInfoEvent = 'crm:open-chat-info';

// The chat's name and details in the header. Clicking them opens group or contact info,
// as in WhatsApp; the info itself is in ChatHeaderActions.
export function ChatTitleButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button type="button" className={styles.titleButton} onClick={() => window.dispatchEvent(new Event(openChatInfoEvent))} aria-label={label}>
      {children}
    </button>
  );
}
