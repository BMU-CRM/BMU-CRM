'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Two behaviours for every list in the app, set up once here rather than page by page:
//
// * Filters apply themselves. In a filter bar (a GET form in the page), choosing an
//   option, a date or a tick applies it at once; typing in a box applies it after a short
//   pause. Applying moves to the filtered address inside the app, so the box keeps focus
//   and what was typed.
// * A table row opens its page when clicked anywhere, not only on its name. The row's
//   page is its first link. Buttons, other links and form fields in the row keep doing
//   their own thing; selecting text does not open anything; Ctrl, Cmd or middle click
//   opens it in a new tab.

const typingPause = 500;
const interactive = 'a, button, input, select, textarea, label, summary, details, dialog, [role="button"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"]';

function filterFormOf(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const form = target.closest('form');
  // Only forms that say method="get" are filter bars. The browser reports "get" for any
  // form without a method, which includes every save form (Drive links, comments, new
  // tasks), so the attribute itself is checked, not form.method.
  if (!form || form.getAttribute('method')?.toLowerCase() !== 'get' || !form.closest('main')) return null;
  return form;
}

function addressFor(form: HTMLFormElement, pathname: string) {
  const query = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string' && value.trim() !== '') query.append(name, value);
  }
  const action = form.getAttribute('action');
  const path = action?.startsWith('/') ? new URL(action, window.location.origin).pathname : pathname;
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

export function ListInteractions() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let typingTimer: number | undefined;

    function apply(form: HTMLFormElement) {
      window.clearTimeout(typingTimer);
      // After React has put the chosen value in place.
      window.setTimeout(() => {
        const target = addressFor(form, window.location.pathname);
        if (target !== window.location.pathname + window.location.search) router.replace(target, { scroll: false });
      }, 30);
    }

    function onChange(event: Event) {
      const form = filterFormOf(event.target);
      if (!form) return;
      const field = event.target as HTMLInputElement;
      // Free-text boxes wait for a pause in typing instead.
      if (field.tagName === 'INPUT' && ['text', 'search', 'number', 'email', 'tel'].includes(field.type) && field.getAttribute('role') !== 'combobox') return;
      apply(form);
    }

    function onInput(event: Event) {
      const form = filterFormOf(event.target);
      const field = event.target as HTMLInputElement;
      if (!form || field.tagName !== 'INPUT' || !['text', 'search', 'number'].includes(field.type) || field.getAttribute('role') === 'combobox') return;
      window.clearTimeout(typingTimer);
      typingTimer = window.setTimeout(() => apply(form), typingPause);
    }

    function onSubmit(event: SubmitEvent) {
      const form = filterFormOf(event.target);
      if (!form) return;
      event.preventDefault();
      apply(form);
    }

    function openRow(event: MouseEvent) {
      if (event.defaultPrevented || (event.button !== 0 && event.button !== 1)) return;
      const target = event.target as Element | null;
      if (!target || !(target instanceof Element) || target.closest(interactive)) return;
      const row = target.closest('main table tbody tr');
      const link = row?.querySelector<HTMLAnchorElement>('a[href]');
      if (!link) return;
      if (window.getSelection()?.toString().trim()) return;
      const href = link.getAttribute('href') as string;
      if (event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey || link.target === '_blank') {
        window.open(link.href, '_blank', 'noopener');
        return;
      }
      router.push(href);
    }

    document.addEventListener('change', onChange);
    document.addEventListener('searchable-change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', openRow);
    document.addEventListener('auxclick', openRow);
    return () => {
      window.clearTimeout(typingTimer);
      document.removeEventListener('change', onChange);
      document.removeEventListener('searchable-change', onChange);
      document.removeEventListener('input', onInput);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('click', openRow);
      document.removeEventListener('auxclick', openRow);
    };
  }, [router, pathname]);

  return null;
}
