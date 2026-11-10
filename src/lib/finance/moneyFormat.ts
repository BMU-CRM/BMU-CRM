const rupeeFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Indian digit grouping, such as ₹12,34,567.00.
export function formatRupees(amount: number) {
  return rupeeFormat.format(amount);
}

// The same, without the rupee sign, for table columns and spreadsheets.
export function formatAmount(amount: number) {
  return plainFormat.format(amount);
}

// Quantities and rates without needless zeros: 2, 2.5, 18.
export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(value: number): string {
  if (value < 20) return ones[value] ?? '';
  const unit = value % 10;
  return `${tens[Math.floor(value / 10)]}${unit ? `-${ones[unit]}` : ''}`;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [hundreds ? `${ones[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

// Whole numbers in the Indian system: thousand, lakh, crore.
function indianWords(value: number): string {
  if (value === 0) return 'Zero';
  const crore = Math.floor(value / 10_000_000);
  const lakh = Math.floor((value % 10_000_000) / 100_000);
  const thousand = Math.floor((value % 100_000) / 1_000);
  const rest = value % 1_000;

  return [
    crore ? `${indianWords(crore)} Crore` : '',
    lakh ? `${belowHundred(lakh)} Lakh` : '',
    thousand ? `${belowHundred(thousand)} Thousand` : '',
    rest ? belowThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// For the "amount in words" line that Indian invoices carry.
export function amountInWords(amount: number) {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;
  const words = `Rupees ${indianWords(rupees)}`;
  return paise ? `${words} and ${belowHundred(paise)} Paise Only` : `${words} Only`;
}
