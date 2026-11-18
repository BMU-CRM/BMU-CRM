'use client';

import { useEffect, useRef } from 'react';

// The printed page: A4 with 14 mm and 16 mm top and bottom margins leaves 267 mm.
const pageHeightMm = 267;
// Room kept spare, so rounding in the print engine never pushes a block over.
const spareMm = 10;

export type PrintLayout = 'payment-first' | 'payment-next' | 'flow';

// Fits each document onto two pages, as the owner asked. The sheet is A4 wide with the
// printed margins, so text wraps as on paper and the heights measured here are those
// printed.
// - Page 1. With one or two items the payment details stay on page 1; if it is nearly
//   full the spacing is tightened (data-compact), and only if they still cannot fit do
//   they move to page 2. With three or four items, page 1 is tightened if the items and
//   totals would not otherwise fit.
// - Page 2: the items after the fourth, the totals, payment details, terms, closing
//   line, signatures and contact details. If they would run onto a third page, their
//   spacing is tightened (data-compact-next).
export function PrintLayoutFit({ initial }: { initial: PrintLayout }) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const sheet = marker.current?.closest('article');
    if (!sheet) return;
    const part = (name: string) => sheet.querySelector<HTMLElement>(`[data-part="${name}"]`);

    // From the top of `from` to the bottom of `to`, in millimetres.
    function spanMm(from: HTMLElement | null, to: HTMLElement | null, millimetre: number) {
      if (!from || !to) return 0;
      return (to.getBoundingClientRect().bottom - from.getBoundingClientRect().top) / millimetre;
    }

    // Where page 2 starts, and how much the repeated table heading adds there.
    function pageTwoStart(layout: string, millimetre: number): { start: HTMLElement | null; extraMm: number } {
      const closing = part('closing');
      const breaksBeforeClosing = closing?.dataset.hasTerms === 'true';
      if (layout === 'flow') {
        const heading = sheet!.querySelector('thead');
        return { start: part('page-two-items'), extraMm: heading ? heading.getBoundingClientRect().height / millimetre : 0 };
      }
      if (layout === 'payment-next') return { start: part('payment') ?? (breaksBeforeClosing ? closing : null), extraMm: 0 };
      return { start: breaksBeforeClosing ? closing : null, extraMm: 0 };
    }

    function decide() {
      if (!sheet) return;
      // Measured on screen, where the sheet is laid out as on paper. Once the browser is
      // already printing (some fire "beforeprint" then, at another width), the decision
      // made on screen stands.
      if (window.matchMedia('print').matches) return;
      // The printed text is 186 mm wide (A4 less the side margins). Only when the sheet
      // really is page-wide: a phone shows it narrower.
      const style = getComputedStyle(sheet);
      const millimetre = (sheet.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) / 186;
      if (millimetre < 3) return;
      const room = pageHeightMm - spareMm;

      sheet.dataset.layout = initial;
      delete sheet.dataset.compact;
      delete sheet.dataset.compactNext;

      // Page 1.
      const first = part('first-page');
      if (initial === 'payment-first') {
        if (spanMm(first, part('payment') ?? first, millimetre) > room) {
          sheet.dataset.compact = 'true';
          if (spanMm(first, part('payment') ?? first, millimetre) > room) {
            delete sheet.dataset.compact;
            sheet.dataset.layout = 'payment-next';
          }
        }
      } else if (initial === 'payment-next' && spanMm(first, first, millimetre) > room) {
        sheet.dataset.compact = 'true';
      }

      // Page 2.
      const { start, extraMm } = pageTwoStart(sheet.dataset.layout, millimetre);
      if (start && spanMm(start, part('closing'), millimetre) + extraMm > room) sheet.dataset.compactNext = 'true';
    }

    decide();
    void document.fonts?.ready.then(decide);
    window.addEventListener('beforeprint', decide);
    return () => window.removeEventListener('beforeprint', decide);
  }, [initial]);

  return <span ref={marker} hidden />;
}
