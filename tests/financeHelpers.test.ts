import { describe, expect, it } from 'vitest';
import { buildDashboard } from '@/lib/access/dashboardWidgetRegistry';
import { buildNavigation } from '@/lib/access/navigationRegistry';
import { documentTotals, isInterStateSupply, lineAmounts, sumMoney } from '@/lib/finance/documentTotals';
import { buildFinanceReport } from '@/lib/finance/financeReport';
import { financialYearLabel, monthsInRange, periodRange } from '@/lib/finance/financialPeriods';
import { balanceDue, isOverdue } from '@/lib/finance/invoiceDue';
import { amountInWords, formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import { parseLineItems } from '@/lib/validation/financeSchema';

describe('amounts', () => {
  it('formats rupees with Indian digit grouping', () => {
    expect(formatRupees(1234567.5)).toBe('₹12,34,567.50');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.5)).toBe('2.5');
  });

  it('writes amounts in words with lakh and crore', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only');
    expect(amountInWords(2885)).toBe('Rupees Two Thousand Eight Hundred Eighty-Five Only');
    expect(amountInWords(1234567.5)).toBe('Rupees Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven and Fifty Paise Only');
    expect(amountInWords(250000000)).toBe('Rupees Twenty-Five Crore Only');
    expect(amountInWords(100.05)).toBe('Rupees One Hundred and Five Paise Only');
  });

  it('works out line and document totals the way the database does', () => {
    expect(lineAmounts({ quantity: 1.33, unitPrice: 100, taxRate: 18 })).toMatchObject({ taxable: 133, tax: 23.94 });

    const lines = [
      { quantity: 2, unitPrice: 1000, taxRate: 18 },
      { quantity: 1, unitPrice: 500, taxRate: 5 },
    ];
    expect(documentTotals(lines, false)).toEqual({ subtotal: 2500, cgst: 192.5, sgst: 192.5, igst: 0, tax: 385, total: 2885 });
    expect(documentTotals(lines, true)).toEqual({ subtotal: 2500, cgst: 0, sgst: 0, igst: 385, tax: 385, total: 2885 });
  });

  it('gives the odd paisa of a split to SGST', () => {
    const totals = documentTotals([{ quantity: 1, unitPrice: 0.15, taxRate: 18 }, { quantity: 1, unitPrice: 0.05, taxRate: 18 }], false);
    expect(totals.tax).toBe(0.04);
    expect(totals.cgst + totals.sgst).toBeCloseTo(totals.tax, 10);
  });

  it('decides inter-state supply only when both states are known', () => {
    expect(isInterStateSupply('Maharashtra', 'Karnataka')).toBe(true);
    expect(isInterStateSupply('Maharashtra', ' maharashtra ')).toBe(false);
    expect(isInterStateSupply(null, 'Karnataka')).toBe(false);
    expect(isInterStateSupply('Maharashtra', '')).toBe(false);
  });

  it('adds money without floating-point drift', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
});

describe('financial periods', () => {
  it('runs the financial year from April to March', () => {
    expect(financialYearLabel('2026-11-09')).toBe('2026-27');
    expect(financialYearLabel('2027-03-31')).toBe('2026-27');
    expect(financialYearLabel('2027-04-01')).toBe('2027-28');
    expect(periodRange('this-year', '2027-02-10')).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(periodRange('last-year', '2026-11-09')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });

  it('works out months and quarters across a year end', () => {
    expect(periodRange('last-month', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodRange('this-month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('this-quarter', '2026-11-09')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodRange('last-quarter', '2027-02-01')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(monthsInRange({ from: '2026-11-20', to: '2027-02-03' })).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});

describe('invoice dues', () => {
  it('counts only unpaid issued invoices as overdue', () => {
    expect(isOverdue({ status: 'issued', due_date: '2026-11-01' }, '2026-11-09')).toBe(true);
    expect(isOverdue({ status: 'paid', due_date: '2026-11-01' }, '2026-11-09')).toBe(false);
    expect(isOverdue({ status: 'partially_paid', due_date: '2026-11-09' }, '2026-11-09')).toBe(false);
    expect(balanceDue({ status: 'partially_paid', total: 2885, amount_paid: 1000.1 })).toBe(1884.9);
    expect(balanceDue({ status: 'cancelled', total: 2885, amount_paid: 0 })).toBe(0);
  });
});

describe('buildFinanceReport', () => {
  const invoice = (id: string, issueDate: string, total: number, client = 'a') => ({
    id,
    invoice_number: id,
    issue_date: issueDate,
    client_id: client,
    client_name: `Client ${client}`,
    subtotal: total / 1.18,
    cgst_total: 0,
    sgst_total: 0,
    igst_total: 0,
    tax_total: total - total / 1.18,
    total,
  });

  const report = buildFinanceReport({
    range: { from: '2026-10-01', to: '2026-11-30' },
    today: '2026-11-09',
    invoices: [invoice('1', '2026-10-05', 1180), invoice('2', '2026-11-02', 2360, 'b'), invoice('3', '2026-09-30', 590)],
    openInvoices: [
      { id: '2', invoice_number: '2', due_date: '2026-11-17', client_id: 'b', client_name: 'Client b', total: 2360, amount_paid: 360 },
      { id: '3', invoice_number: '3', due_date: '2026-10-15', client_id: 'a', client_name: 'Client a', total: 590, amount_paid: 0 },
    ],
    payments: [
      { amount: 1180, payment_date: '2026-10-20', client_id: 'a', client_name: 'Client a' },
      { amount: 360, payment_date: '2026-11-05', client_id: 'b', client_name: 'Client b' },
      { amount: 99, payment_date: '2026-12-01', client_id: 'b', client_name: 'Client b' },
    ],
  });

  it('totals the period and what is owed today', () => {
    expect(report.summary).toMatchObject({
      invoiced: 3540,
      invoiceCount: 2,
      collected: 1540,
      outstanding: 2590,
      overdue: 590,
      overdueCount: 1,
    });
  });

  it('breaks the period down by month', () => {
    expect(report.months.map((month) => [month.month, month.invoiceCount, month.invoiced, month.collected])).toEqual([
      ['2026-10', 1, 1180, 1180],
      ['2026-11', 1, 2360, 360],
    ]);
  });

  it('ages unpaid money by days late', () => {
    expect(report.ageing.find((bucket) => bucket.key === 'current')).toMatchObject({ count: 1, amount: 2000 });
    expect(report.ageing.find((bucket) => bucket.key === '1-30')).toMatchObject({ count: 1, amount: 590 });
  });

  it('ranks clients by amount invoiced', () => {
    expect(report.clients.map((client) => [client.name, client.invoiced, client.outstanding])).toEqual([
      ['Client b', 2360, 2000],
      ['Client a', 1180, 590],
    ]);
  });
});

describe('parseLineItems', () => {
  function form(rows: string[][]) {
    const data = new FormData();
    for (const [description = '', code = '', quantity = '', price = '', rate = ''] of rows) {
      data.append('itemDescription', description);
      data.append('itemHsnSac', code);
      data.append('itemQuantity', quantity);
      data.append('itemUnitPrice', price);
      data.append('itemTaxRate', rate);
    }
    return data;
  }

  it('reads items, accepting Indian commas and skipping empty rows', () => {
    const result = parseLineItems(form([['Design', '998314', '2', '1,50,000.50', '18'], ['', '', '1', '', '18']]));
    expect(result).toEqual({
      ok: true,
      items: [{ description: 'Design', hsnSac: '998314', quantity: 2, unitPrice: 150000.5, taxRate: 18, serviceGroup: '', serviceName: '', billing: '' }],
    });
  });

  it('reads the service and how an item is billed, and refuses a made-up billing', () => {
    const data = form([['SEO work', '', '3', '15000', '18']]);
    data.append('itemServiceGroup', 'Marketing & Visibility');
    data.append('itemServiceName', 'SEO (Starter plan)');
    data.append('itemBilling', 'monthly');
    const result = parseLineItems(data);
    expect(result.ok && result.items[0]).toMatchObject({ serviceGroup: 'Marketing & Visibility', serviceName: 'SEO (Starter plan)', billing: 'monthly' });

    const wrong = form([['SEO work', '', '3', '15000', '18']]);
    wrong.append('itemBilling', 'weekly');
    expect(parseLineItems(wrong).ok).toBe(false);
  });

  it('names the item with a problem', () => {
    expect(parseLineItems(form([['Design', '', '1', '100', '18'], ['Hosting', '', '0', '100', '18']]))).toEqual({
      ok: false,
      message: 'Item 2: Enter a quantity above zero.',
    });
    expect(parseLineItems(form([['Design', '', '1', '10.505', '18']]))).toMatchObject({ ok: false });
    expect(parseLineItems(form([['Design', '12', '1', '10', '18']]))).toMatchObject({ ok: false });
    expect(parseLineItems(form([]))).toEqual({ ok: false, message: 'Add at least one item.' });
  });
});

describe('finance access', () => {
  const finance = {
    'dashboard.view': 'own',
    'quotations.view': 'organisation',
    'invoices.view': 'organisation',
    'finance.reports': 'organisation',
    'finance.manage': 'organisation',
  } as const;

  it('shows the finance pages and revenue widgets from permissions alone', () => {
    const labels = buildNavigation(finance).flatMap((section) => section.items.map((item) => item.label));
    expect(labels).toEqual(['Overview', 'Quotations', 'Invoices', 'Finance reports', 'Finance settings']);
    expect(buildDashboard(finance).map((widget) => widget.key)).toEqual(['financeStats', 'overdueInvoices', 'awaitingQuotations', 'myProfile']);
  });
});
