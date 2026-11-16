'use client';

import { useEffect, useRef } from 'react';

// The printed page: A4 with 14 mm and 16 mm top and bottom margins leaves 267 mm.
const pageHeightMm = 267;
// Room kept spare, so rounding in the print engine never pushes a block over.
const spareMm = 10;

export type PrintLayout = 'payment-first' | 'payment-next' | 'flow';

// Works out where the printed pages break, from the sheet as it is laid out on screen
// (the sheet is A4 wide with the printed margins, so text wraps the same way):
// - If the payment details fit on page 1, they stay there and the terms start page 2.
// - If not, the payment details move to page 2, with the terms after them.
// The page renders with a guess from the number of items, and this corrects it.
export function PrintLayoutFit({ initial }: { initial: PrintLayout }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sheet = marker.current?.closest('article');
    if (!sheet || initial === 'flow') return;

    function decide() {
      if (!sheet) return;
      const first = sheet.querySelector<HTMLElement>('[data-part="first-page"]');
      const payment = sheet.querySelector<HTMLElement>('[data-part="payment"]');
      if (!first) return;
      // Only when the sheet really is page-wide: a phone shows it narrower.
      const millimetre = sheet.getBoundingClientRect().width / 210;
      if (millimetre < 3) return;

      const top = first.getBoundingClientRect().top;
      const end = (payment ?? first).getBoundingClientRect().bottom;
      const fits = (end - top) / millimetre <= pageHeightMm - spareMm;
      sheet.dataset.layout = fits ? 'payment-first' : 'payment-next';
    }

    decide();
    void document.fonts?.ready.then(decide);
    window.addEventListener('beforeprint', decide);
    return () => window.removeEventListener('beforeprint', decide);
  }, [initial]);

  return <span ref={marker} hidden />;
}
