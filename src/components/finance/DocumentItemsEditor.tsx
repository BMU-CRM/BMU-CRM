'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/FormFields.module.css';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { billingShort, serviceItemDescription, servicePlans, type PricedService } from '@/lib/catalog/servicePricing';
import { documentTotals, lineAmounts } from '@/lib/finance/documentTotals';
import { formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import { standardTaxRates } from '@/lib/validation/financeSchema';
import styles from './DocumentItemsEditor.module.css';

export type ItemDraft = { description: string; hsnSac: string; quantity: string; unitPrice: string; taxRate: string };

type Line = ItemDraft & { key: number };

let lastLineKey = 0;
function withKey(item: ItemDraft): Line {
  lastLineKey += 1;
  return { ...item, key: lastLineKey };
}

function toNumber(value: string) {
  const number = Number(value.replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

type DocumentItemsEditorProps = {
  initialItems: ItemDraft[];
  defaultTaxRate: number;
  isInterState: boolean;
  error?: string;
  // The price list. When given, picking a sub service and plan adds it as an item.
  services?: PricedService[];
};

// Each sub service and plan that has a price, as one choice.
function priceListOptions(services: PricedService[]) {
  return services.flatMap((service) =>
    servicePlans
      .filter((plan) => service.prices[plan.key] !== null)
      .map((plan) => ({
        value: `${service.id}:${plan.key}`,
        label: `${service.group} › ${service.name} — ${plan.label} · ${formatRupees(service.prices[plan.key] ?? 0)} ${billingShort[service.billing]}`,
      })),
  );
}

// The items of a quotation or invoice. The figures shown are worked out the same way
// as in the database, which recalculates them when the form is saved.
export function DocumentItemsEditor({ initialItems, defaultTaxRate, isInterState, error, services = [] }: DocumentItemsEditorProps) {
  const blank = (): ItemDraft => ({ description: '', hsnSac: '', quantity: '1', unitPrice: '', taxRate: String(defaultTaxRate) });
  const [lines, setLines] = useState<Line[]>(() => (initialItems.length > 0 ? initialItems : [blank()]).map(withKey));
  const priceOptions = priceListOptions(services);

  // Adds the picked sub service and plan as an item, filling in its description and
  // rate. An empty last item is used instead of adding another.
  function addFromPriceList(choice: string) {
    const [serviceId, planKey] = choice.split(':');
    const service = services.find((option) => option.id === serviceId);
    const plan = servicePlans.find((option) => option.key === planKey)?.key;
    const price = service && plan ? service.prices[plan] : null;
    if (!service || !plan || price === null) return;
    const filled = { description: serviceItemDescription(service, plan), unitPrice: String(price) };
    setLines((current) => {
      const last = current.at(-1);
      if (last && !last.description.trim() && !last.unitPrice.trim()) {
        return current.map((line) => (line.key === last.key ? { ...line, ...filled } : line));
      }
      return current.length >= 100 ? current : [...current, withKey({ ...blank(), ...filled })];
    });
  }

  const rateOptions = [...new Set([...standardTaxRates, defaultTaxRate, ...lines.map((line) => toNumber(line.taxRate))])].sort((a, b) => a - b);
  const figures = lines.map((line) => ({ quantity: toNumber(line.quantity), unitPrice: toNumber(line.unitPrice), taxRate: toNumber(line.taxRate) }));
  const totals = documentTotals(figures, isInterState);

  function update(key: number, field: keyof ItemDraft, value: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  return (
    <div className={styles.editor}>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
      {priceOptions.length > 0 && (
        <div className={styles.priceList}>
          <label htmlFor="price-list" className={formStyles.label}>
            Add from the price list
          </label>
          <SearchableSelect
            id="price-list"
            name="priceListChoice"
            placeholder="Choose a sub service and plan"
            value=""
            options={priceOptions}
            onChange={(event) => addFromPriceList(event.target.value)}
          />
          <p className={formStyles.hint}>Fills in the description and rate, before GST. For a monthly service, set Qty to the number of months.</p>
        </div>
      )}
      <div className={styles.header} aria-hidden="true">
        <span>Description</span>
        <span className={styles.numeric}>Qty</span>
        <span className={styles.numeric}>Rate (₹)</span>
        <span>GST</span>
        <span className={styles.numeric}>Amount</span>
        <span />
      </div>
      {lines.map((line, index) => {
        const id = `item-${index}`;
        const amount = lineAmounts(figures[index] ?? { quantity: 0, unitPrice: 0, taxRate: 0 }).taxable;
        return (
          <div key={line.key} className={styles.row}>
            <label className={styles.cell}>
              <span className={styles.mobileLabel}>Description</span>
              <input
                id={`${id}-description`}
                name="itemDescription"
                className={formStyles.control}
                aria-label={`Item ${index + 1} description`}
                value={line.description}
                maxLength={500}
                required
                onChange={(event) => update(line.key, 'description', event.target.value)}
              />
            </label>
            {/* No HSN/SAC box: a code saved on an older item is kept as it is. */}
            <input type="hidden" name="itemHsnSac" value={line.hsnSac} />
            <label className={styles.cell}>
              <span className={styles.mobileLabel}>Quantity</span>
              <input
                id={`${id}-quantity`}
                name="itemQuantity"
                className={`${formStyles.control} ${styles.numeric}`}
                aria-label={`Item ${index + 1} quantity`}
                inputMode="decimal"
                value={line.quantity}
                required
                onChange={(event) => update(line.key, 'quantity', event.target.value)}
              />
            </label>
            <label className={styles.cell}>
              <span className={styles.mobileLabel}>Rate (₹)</span>
              <input
                id={`${id}-price`}
                name="itemUnitPrice"
                className={`${formStyles.control} ${styles.numeric}`}
                aria-label={`Item ${index + 1} rate in rupees`}
                inputMode="decimal"
                value={line.unitPrice}
                required
                onChange={(event) => update(line.key, 'unitPrice', event.target.value)}
              />
            </label>
            <label className={styles.cell}>
              <span className={styles.mobileLabel}>GST</span>
              <SearchableSelect
                id={`${id}-tax`}
                name="itemTaxRate"
                aria-label={`Item ${index + 1} GST rate`}
                value={String(toNumber(line.taxRate))}
                onChange={(event) => update(line.key, 'taxRate', event.target.value)}
                options={rateOptions.map((rate) => ({ value: String(rate), label: `${formatQuantity(rate)}%` }))}
              />
            </label>
            <div className={styles.cell}>
              <span className={styles.mobileLabel}>Amount</span>
              <span className={styles.amount}>{formatRupees(amount)}</span>
            </div>
            <Button
              variant="ghost"
              disabled={lines.length === 1}
              aria-label={`Remove item ${index + 1}`}
              onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
            >
              Remove
            </Button>
          </div>
        );
      })}
      <div className={styles.actions}>
        <Button onClick={() => setLines((current) => [...current, withKey(blank())])} disabled={lines.length >= 100}>
          Add item
        </Button>
        <dl className={styles.totals} aria-live="polite">
          <dt>Taxable value</dt>
          <dd>{formatRupees(totals.subtotal)}</dd>
          {isInterState ? (
            <>
              <dt>IGST</dt>
              <dd>{formatRupees(totals.igst)}</dd>
            </>
          ) : (
            <>
              <dt>CGST</dt>
              <dd>{formatRupees(totals.cgst)}</dd>
              <dt>SGST</dt>
              <dd>{formatRupees(totals.sgst)}</dd>
            </>
          )}
          <dt className={styles.grandTotal}>Total</dt>
          <dd className={styles.grandTotal}>{formatRupees(totals.total)}</dd>
        </dl>
      </div>
    </div>
  );
}
