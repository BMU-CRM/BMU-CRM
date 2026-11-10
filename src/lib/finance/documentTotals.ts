// Works out quotation and invoice amounts the same way the database does, so the
// form can show them while the user types. The database's figures are the ones kept.
// Everything is counted in paise, which avoids rounding drift in decimal fractions.

export type LineFigures = { quantity: number; unitPrice: number; taxRate: number };

const toHundredths = (value: number) => Math.round(value * 100);

export function lineAmounts({ quantity, unitPrice, taxRate }: LineFigures) {
  const taxablePaise = Math.round((toHundredths(quantity) * toHundredths(unitPrice)) / 100);
  const taxPaise = Math.round((taxablePaise * toHundredths(taxRate)) / 10_000);
  return { taxable: taxablePaise / 100, tax: taxPaise / 100, taxablePaise, taxPaise };
}

export function documentTotals(lines: LineFigures[], isInterState: boolean) {
  let taxablePaise = 0;
  let taxPaise = 0;
  for (const line of lines) {
    const amounts = lineAmounts(line);
    taxablePaise += amounts.taxablePaise;
    taxPaise += amounts.taxPaise;
  }

  const cgstPaise = isInterState ? 0 : Math.round(taxPaise / 2);
  const sgstPaise = isInterState ? 0 : taxPaise - cgstPaise;

  return {
    subtotal: taxablePaise / 100,
    cgst: cgstPaise / 100,
    sgst: sgstPaise / 100,
    igst: isInterState ? taxPaise / 100 : 0,
    tax: taxPaise / 100,
    total: (taxablePaise + taxPaise) / 100,
  };
}

// Mirrors apply_gst_split: a sale is inter-state when both states are known and differ.
export function isInterStateSupply(companyState: string | null | undefined, placeOfSupply: string | null | undefined) {
  const company = (companyState ?? '').trim().toLowerCase();
  const place = (placeOfSupply ?? '').trim().toLowerCase();
  return company !== '' && place !== '' && company !== place;
}

// Adds money without floating-point drift.
export function sumMoney(values: number[]) {
  return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}
