// Quotations and invoices take one GST rate for the whole document. The rate is then
// shown with the tax in the totals, such as "CGST (9%)", instead of on every item.
import { describe, expect, it } from 'vitest';
import { documentTotals, sharedTaxRate, taxLabels } from '@/lib/finance/documentTotals';

describe('one GST rate for the document', () => {
  it('finds the rate every item shares', () => {
    expect(sharedTaxRate([{ tax_rate: 18 }, { tax_rate: 18 }])).toBe(18);
    expect(sharedTaxRate([{ tax_rate: 18 }, { tax_rate: 5 }])).toBeNull();
    expect(sharedTaxRate([])).toBeNull();
  });

  it('names the tax with its rate', () => {
    expect(taxLabels(18)).toEqual({ cgst: 'CGST (9%)', sgst: 'SGST (9%)', igst: 'IGST (18%)' });
    expect(taxLabels(5)).toEqual({ cgst: 'CGST (2.5%)', sgst: 'SGST (2.5%)', igst: 'IGST (5%)' });
    expect(taxLabels(null)).toEqual({ cgst: 'CGST', sgst: 'SGST', igst: 'IGST' });
  });

  it('charges 18% on the total of two services', () => {
    const totals = documentTotals(
      [
        { quantity: 1, unitPrice: 15000, taxRate: 18 },
        { quantity: 3, unitPrice: 8000, taxRate: 18 },
      ],
      false,
    );
    expect(totals).toMatchObject({ subtotal: 39000, cgst: 3510, sgst: 3510, tax: 7020, total: 46020 });
  });
});
