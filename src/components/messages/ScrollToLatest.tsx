'use client';

import { useEffect } from 'react';

// How close to the bottom still counts as reading the newest messages.
const nearBottomPixels = 80;

// Keeps the newest message in view, unless the link points at a particular message.
// When the conversation gets shorter, such as when a phone keyboard opens for typing,
// someone reading the newest messages stays at the bottom.
export function ScrollToLatest({ containerId, messageCount }: { containerId: string; messageCount: number }) {
  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const target = window.location.hash ? document.querySelector(window.location.hash) : null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [containerId, messageCount]);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < nearBottomPixels;
    const onScroll = () => {
      atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < nearBottomPixels;
    };
    const onResize = () => {
      if (atBottom) container.scrollTop = container.scrollHeight;
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container);
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', onScroll);
    };
  }, [containerId]);

  return null;
}
