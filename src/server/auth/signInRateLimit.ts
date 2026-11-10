// Slows down password guessing: at most 10 attempts per email in 15 minutes. Kept in
// memory, so it resets when the app restarts, which is enough for one company.

const windowMs = 15 * 60 * 1000;
const maxAttempts = 10;
const attempts = new Map<string, number[]>();

export function isRateLimited(key: string) {
  const now = Date.now();
  const normalised = key.trim().toLowerCase();
  const recent = (attempts.get(normalised) ?? []).filter((time) => now - time < windowMs);
  recent.push(now);
  attempts.set(normalised, recent);

  if (attempts.size > 10_000) {
    for (const [entry, times] of attempts) {
      if (times.every((time) => now - time >= windowMs)) attempts.delete(entry);
    }
  }
  return recent.length > maxAttempts;
}
