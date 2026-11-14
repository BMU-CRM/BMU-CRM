// What /api/live/config tells an open page about how to receive live updates.
export type LiveConfig =
  | { mode: 'stream' }
  | {
      mode: 'realtime';
      url: string;
      key: string;
      changesTopic: string;
      userId: string;
      // This person's name, sent with their typing signal.
      name: string;
      // Channel names for the requested conversations this person may read.
      typingTopics: Record<string, string>;
    };

export type LiveChangeMessage = {
  table: string;
  event: string;
  row?: Record<string, string | null>;
};

export type LiveTopic = { table: string; column?: string; value?: string };

// Whether a change is one a page asked to hear about.
export function changeMatches(topics: LiveTopic[], change: LiveChangeMessage) {
  return topics.some(
    (topic) =>
      topic.table === change.table && (!topic.column || String(change.row?.[topic.column] ?? '') === topic.value),
  );
}
