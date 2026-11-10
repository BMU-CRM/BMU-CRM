'use client';

import { SunMoon } from 'lucide-react';

function currentTheme() {
  const saved = document.documentElement.dataset.theme;
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button type="button" className={className} onClick={toggleTheme} aria-label="Switch between light and dark theme">
      <SunMoon size={18} aria-hidden="true" />
    </button>
  );
}
