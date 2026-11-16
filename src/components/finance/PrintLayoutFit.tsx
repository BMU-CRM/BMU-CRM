'use client';

import { useEffect, useRef } from 'react';

// The printed page: A4 with 14 mm and 16 mm top and bottom margins leaves 267 mm.
const pageHeightMm = 267;
// Room kept spare, so rounding in the print engine never pushes a block over.
const spareMm = 10;

export type PrintLayout = 'payment-first' | 'payment-next' | 'flow';

// Keeps the payment details on page 1 when a document has one or two items, as the
// owner asked: the sheet is A4 wide with the printed margins, so text wraps as on paper,
// and if page 1 is nearly full the spacing is tightened (data-compact) until they fit.
// Only if they still could not fit (very long descriptions) do they move to page 2,
// rather than leave a page almost empty. Three or more items are not changed: their
// payment details always start the next page.
export function PrintLayoutFit({ initial }: { initial: PrintLayout }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sheet = marker.current?.closest('article');
    if (!sheet || initial !== 'payment-first') return;

    function heightMm(millimetre: number) {
      const first = sheet!.querySelector<HTMLElement>('[data-part="first-page"]');
      const payment = sheet!.querySelector<HTMLElement>('[data-part="payment"]');
      if (!first) return 0;
      return ((payment ?? first).getBoundingClientRect().bottom - first.getBoundingClientRect().top) / millimetre;
    }

    function decide() {
      if (!sheet) return;
      // Only when the sheet really is page-wide: a phone shows it narrower.
      const millimetre = sheet.getBoundingClientRect().width / 210;
      if (millimetre < 3) return;

      const room = pageHeightMm - spareMm;
      sheet.dataset.layout = 'payment-first';
      delete sheet.dataset.compact;
      if (heightMm(millimetre) <= room) return;
      sheet.dataset.compact = 'true';
      if (heightMm(millimetre) <= room) return;
      delete sheet.dataset.compact;
      sheet.dataset.layout = 'payment-next';
    }

    decide();
    void document.fonts?.ready.then(decide);
    window.addEventListener('beforeprint', decide);
    return () => window.removeEventListener('beforeprint', decide);
  }, [initial]);

  return <span ref={marker} hidden />;
}
