// Availability, as in Teams. The database works out the status shown to others.
export const presenceStatuses = ['available', 'busy', 'do_not_disturb', 'be_right_back', 'away', 'offline'] as const;

export type PresenceStatus = (typeof presenceStatuses)[number];

// Labels for the menu, where "away" and "offline" are things you choose to appear as.
export const presenceChoiceLabels: Record<PresenceStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  do_not_disturb: 'Do not disturb',
  be_right_back: 'Be right back',
  away: 'Appear away',
  offline: 'Appear offline',
};

// Labels as others see them.
export const presenceLabels: Record<PresenceStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  do_not_disturb: 'Do not disturb',
  be_right_back: 'Be right back',
  away: 'Away',
  offline: 'Offline',
};

export function isPresenceStatus(value: unknown): value is PresenceStatus {
  return typeof value === 'string' && (presenceStatuses as readonly string[]).includes(value);
}
