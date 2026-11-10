import type { Database } from '@/types/databaseTypes';

export type ConversationKind = Database['public']['Enums']['conversation_kind'];

type ConversationNames = {
  kind: ConversationKind;
  title: string | null;
  department_name: string | null;
  project_name: string | null;
  client_name: string | null;
  other_person_name: string | null;
};

export function conversationTitle(conversation: ConversationNames) {
  switch (conversation.kind) {
    case 'direct':
      return conversation.other_person_name ?? 'Direct message';
    case 'group':
      return conversation.title ?? 'Group';
    case 'department':
      return `${conversation.department_name ?? 'Department'} team`;
    case 'project':
      return `Project: ${conversation.project_name ?? 'Unnamed'}`;
    case 'client':
      return `Client: ${conversation.client_name ?? 'Unnamed'}`;
    default:
      return conversation.title ?? 'Announcements';
  }
}

export const conversationKindLabels: Record<ConversationKind, string> = {
  direct: 'Direct message',
  group: 'Group',
  department: 'Department channel',
  project: 'Project channel',
  client: 'Client channel',
  announcement: 'Company announcements',
};
