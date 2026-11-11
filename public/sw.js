// Service worker for push notifications. It shows each notification and opens the
// app when it is clicked. It does not cache pages, so it never serves stale data.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'New notification' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'New notification', {
      body: data.body || '',
      icon: '/images/notification-icon.png',
      // The small monochrome mark Android shows in the status bar.
      badge: '/images/notification-badge.png',
      tag: data.tag,
      timestamp: Date.now(),
      // Urgent ones stay on screen until dismissed, so they are not missed.
      requireInteraction: data.priority === 'high',
      actions: data.readUrl
        ? [
            { action: 'open', title: 'Open' },
            { action: 'read', title: 'Mark as read' },
          ]
        : [],
      data: { url: data.url || '/notifications', readUrl: data.readUrl || null },
    }),
  );
});

// Only ever reaches pages on this site.
function sameSite(path) {
  const target = new URL(path, self.location.origin);
  return target.origin === self.location.origin ? target : null;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  if (event.action === 'read') {
    const readTarget = data.readUrl ? sameSite(data.readUrl) : null;
    if (readTarget) {
      event.waitUntil(fetch(readTarget.href, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined));
    }
    return;
  }

  const target = sameSite(data.url || '/notifications');
  if (!target) return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) {
        open.navigate(target.href);
        return open.focus();
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
