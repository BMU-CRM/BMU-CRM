// The default quotation terms carry the quotation's own "Valid until" date.
import { describe, expect, it } from 'vitest';
import { formatLongDate, validUntilDate, withValidUntil, writtenValidUntil } from '@/lib/finance/quotationTerms';

const terms = `1. This quotation is valid until 10 November 2026.
2. Influencer fees are quoted as a range; the final amount depends on the profiles the client approves.
5. Taxes extra as applicable.`;

describe('quotation terms', () => {
  it('writes dates in full', () => {
    expect(formatLongDate('2026-12-14')).toBe('14 December 2026');
    expect(formatLongDate('not a date')).toBeNull();
  });

  it('uses the chosen date, or the quotation date plus the usual days', () => {
    expect(validUntilDate('2027-01-05', '2026-11-14', 30)).toBe('2027-01-05');
    expect(validUntilDate('', '2026-11-14', 30)).toBe('2026-12-14');
  });

  it('replaces only the date in the first term', () => {
    const filled = withValidUntil(terms, '2026-12-14');
    expect(filled.split('\n')[0]).toBe('1. This quotation is valid until 14 December 2026.');
    expect(filled.split('\n').slice(1)).toEqual(terms.split('\n').slice(1));
    expect(writtenValidUntil(filled)).toBe('14 December 2026');
  });

  it('leaves terms without that line alone', () => {
    expect(withValidUntil('Payment within 15 days.', '2026-12-14')).toBe('Payment within 15 days.');
  });
});
