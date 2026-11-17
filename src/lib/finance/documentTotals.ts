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

// The GST rate when every item has the same one, as on quotations and invoices, where it
// is chosen once for the whole document; null when the rates differ or there are none.
export function sharedTaxRate(lines: { tax_rate: number }[]) {
  const rates = new Set(lines.map((line) => Number(line.tax_rate)));
  return rates.size === 1 ? [...rates][0]! : null;
}

// "CGST (9%)", "SGST (9%)" and "IGST (18%)" for one shared rate; plain names otherwise.
export function taxLabels(rate: number | null) {
  const percent = (value: number) => `${Number(value.toFixed(2))}%`;
  if (rate === null) return { cgst: 'CGST', sgst: 'SGST', igst: 'IGST' };
  return { cgst: `CGST (${percent(rate / 2)})`, sgst: `SGST (${percent(rate / 2)})`, igst: `IGST (${percent(rate)})` };
}

// Adds money without floating-point drift.
export function sumMoney(values: number[]) {
  return values.reduce((total, value) => total + Math.round(value * 100), 0) / 100;
}
