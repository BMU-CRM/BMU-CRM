'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import formStyles from '@/components/ui/FormFields.module.css';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  billingShort,
  itemBillingLabels,
  itemBillings,
  serviceItemDescription,
  serviceItemName,
  servicePlans,
  type PricedService,
} from '@/lib/catalog/servicePricing';
import { documentTotals, lineAmounts, taxLabels } from '@/lib/finance/documentTotals';
import { formatQuantity, formatRupees } from '@/lib/finance/moneyFormat';
import { standardTaxRates } from '@/lib/validation/financeSchema';
import styles from './DocumentItemsEditor.module.css';

export type ItemDraft = {
  description: string;
  hsnSac: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  // The service (main and sub service) and how it is billed, on quotations and invoices.
  serviceGroup?: string;
  serviceName?: string;
  billing?: string;
};

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
  // Quotations and invoices say which service each item is and how it is billed.
  withServiceDetails?: boolean;
  // One GST rate for the whole document, chosen beside the totals, instead of one per
  // item. Every item is saved with it.
  oneTaxRate?: boolean;
};

const billingChoices = [{ value: '', label: 'Not stated' }, ...itemBillings.map((billing) => ({ value: billing, label: itemBillingLabels[billing] }))];

// Each sub service and plan that has a price, as one choice, then each bundle and plan,
// such as "Bundle › Brand Launch — Starter · ₹67,500".
function priceListOptions(services: PricedService[]) {
  return services.flatMap((service) =>
    servicePlans
      .filter((plan) => service.prices[plan.key] !== null)
      .map((plan) => ({
        value: `${service.id}:${plan.key}`,
        label: `${service.group} › ${service.name} — ${plan.label} · ${formatRupees(service.prices[plan.key] ?? 0)}${service.isBundle ? '' : ` ${billingShort[service.billing]}`}`,
      })),
  );
}

// The items of a quotation or invoice. The figures shown are worked out the same way
// as in the database, which recalculates them when the form is saved.
export function DocumentItemsEditor({
  initialItems,
  defaultTaxRate,
  isInterState,
  error,
  services = [],
  withServiceDetails = false,
  oneTaxRate = false,
}: DocumentItemsEditorProps) {
  // The document's GST: whether it is added, and at what rate. A saved document with no
  // GST on its items starts with it off; a new one follows the default rate.
  const savedRate = initialItems.length > 0 ? toNumber(initialItems[0]!.taxRate) : defaultTaxRate;
  const [gstOn, setGstOn] = useState(savedRate > 0);
  const [documentRate, setDocumentRate] = useState(() => String(savedRate > 0 ? savedRate : defaultTaxRate > 0 ? defaultTaxRate : 18));
  const appliedRate = gstOn ? toNumber(documentRate) : 0;
  const mixedRates = oneTaxRate && new Set(initialItems.map((item) => toNumber(item.taxRate))).size > 1;
  const blank = (): ItemDraft => ({
    description: '',
    hsnSac: '',
    quantity: '1',
    unitPrice: '',
    taxRate: oneTaxRate ? String(appliedRate) : String(defaultTaxRate),
    serviceGroup: '',
    serviceName: '',
    billing: '',
  });
  const [lines, setLines] = useState<Line[]>(() => (initialItems.length > 0 ? initialItems : [blank()]).map(withKey));
  const priceOptions = priceListOptions(services);
  // "Add item" opens the price list under the items; a blank item is one click away.
  const [picking, setPicking] = useState(false);

  function addBlank() {
    setPicking(false);
    setLines((current) => (current.length >= 100 ? current : [...current, withKey(blank())]));
  }

  // Adds the picked sub service and plan as an item, filling in its description and
  // rate. An empty last item is used instead of adding another.
  function addFromPriceList(choice: string) {
    const [serviceId, planKey] = choice.split(':');
    const service = services.find((option) => option.id === serviceId);
    const plan = servicePlans.find((option) => option.key === planKey)?.key;
    const price = service && plan ? service.prices[plan] : null;
    if (!service || !plan || price === null) return;
    const filled = {
      description: serviceItemDescription(service, plan),
      unitPrice: String(price),
      // A bundle is not under a service; it shows as "Bundle" from its billing.
      serviceGroup: service.isBundle ? '' : service.group,
      serviceName: serviceItemName(service, plan),
      billing: service.billing,
    };
    setLines((current) => {
      const last = current.at(-1);
      if (last && !last.description.trim() && !last.unitPrice.trim()) {
        return current.map((line) => (line.key === last.key ? { ...line, ...filled } : line));
      }
      return current.length >= 100 ? current : [...current, withKey({ ...blank(), ...filled })];
    });
  }

  const rateOf = (line: Line) => (oneTaxRate ? appliedRate : toNumber(line.taxRate));
  const rateOptions = [...new Set([...standardTaxRates, defaultTaxRate, toNumber(documentRate), ...lines.map((line) => toNumber(line.taxRate))])]
    .sort((a, b) => a - b)
    .map((rate) => ({ value: String(rate), label: `${formatQuantity(rate)}%` }));
  const figures = lines.map((line) => ({ quantity: toNumber(line.quantity), unitPrice: toNumber(line.unitPrice), taxRate: rateOf(line) }));
  const totals = documentTotals(figures, isInterState);
  const taxNames = taxLabels(oneTaxRate ? appliedRate : null);
  // Without GST the totals are just the items, with no tax lines.
  const showTax = !oneTaxRate || gstOn;

  function update(key: number, field: keyof ItemDraft, value: string) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  }

  return (
    <div className={styles.editor} data-one-rate={oneTaxRate || undefined}>
      {error && (
        <p className={formStyles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.header} aria-hidden="true">
        <span>Description</span>
        <span className={styles.numeric}>Qty</span>
        <span className={styles.numeric}>Rate (₹)</span>
        {!oneTaxRate && <span>GST</span>}
        <span className={styles.numeric}>Amount</span>
        <span />
      </div>
      {lines.map((line, index) => {
        const id = `item-${index}`;
        const amount = lineAmounts(figures[index] ?? { quantity: 0, unitPrice: 0, taxRate: 0 }).taxable;
        return (
          <div key={line.key} className={styles.row}>
            <div className={styles.cell}>
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
              {withServiceDetails && (
                <div className={styles.serviceDetails}>
                  <input
                    id={`${id}-service-group`}
                    className={formStyles.control}
                    aria-label={`Item ${index + 1} service`}
                    placeholder="Service, such as Marketing & Visibility"
                    value={line.serviceGroup ?? ''}
                    maxLength={80}
                    onChange={(event) => update(line.key, 'serviceGroup', event.target.value)}
                  />
                  <input
                    id={`${id}-service-name`}
                    className={formStyles.control}
                    aria-label={`Item ${index + 1} sub service`}
                    placeholder="Sub service, such as SEO"
                    value={line.serviceName ?? ''}
                    maxLength={120}
                    onChange={(event) => update(line.key, 'serviceName', event.target.value)}
                  />
                  <select
                    id={`${id}-billing`}
                    className={formStyles.control}
                    aria-label={`Item ${index + 1} billed`}
                    value={line.billing ?? ''}
                    onChange={(event) => update(line.key, 'billing', event.target.value)}
                  >
                    {billingChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {/* No HSN/SAC box: a code saved on an older item is kept as it is. */}
            <input type="hidden" name="itemHsnSac" value={line.hsnSac} />
            <input type="hidden" name="itemServiceGroup" value={line.serviceGroup ?? ''} />
            <input type="hidden" name="itemServiceName" value={line.serviceName ?? ''} />
            <input type="hidden" name="itemBilling" value={line.billing ?? ''} />
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
            {oneTaxRate ? (
              <input type="hidden" name="itemTaxRate" value={String(rateOf(line))} />
            ) : (
              <label className={styles.cell}>
                <span className={styles.mobileLabel}>GST</span>
                <SearchableSelect
                  id={`${id}-tax`}
                  name="itemTaxRate"
                  aria-label={`Item ${index + 1} GST rate`}
                  value={String(toNumber(line.taxRate))}
                  onChange={(event) => update(line.key, 'taxRate', event.target.value)}
                  options={rateOptions}
                />
              </label>
            )}
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
      {picking && (
        <div className={styles.priceList}>
          {/* Above the dropdown, so its open list never covers them. */}
          <div className={styles.pickerHeader}>
            <label htmlFor="price-list" className={formStyles.label}>
              Add from the price list
            </label>
            <span className={styles.pickerActions}>
              <button type="button" className={formStyles.linkButton} onClick={addBlank}>
                Add a blank item instead
              </button>
              <button type="button" className={formStyles.linkButton} onClick={() => setPicking(false)}>
                Cancel
              </button>
            </span>
          </div>
          <SearchableSelect
            id="price-list"
            name="priceListChoice"
            placeholder="Choose a sub service and plan"
            value=""
            options={priceOptions}
            autoOpen
            onChange={(event) => {
              addFromPriceList(event.target.value);
              setPicking(false);
            }}
          />
          <p className={formStyles.hint}>Fills in the description and rate, before GST. For a monthly service, set Qty to the number of months.</p>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          onClick={() => (priceOptions.length > 0 ? setPicking(true) : addBlank())}
          disabled={lines.length >= 100 || picking}
          aria-expanded={priceOptions.length > 0 ? picking : undefined}
        >
          Add item
        </Button>
        <div className={styles.totalsColumn}>
        {oneTaxRate && (
          <div className={styles.documentRate}>
            {/* On by default; off for a client billed without GST. */}
            <label className={styles.gstSwitch}>
              <input type="checkbox" role="switch" checked={gstOn} onChange={(event) => setGstOn(event.target.checked)} />
              Add GST
            </label>
            {gstOn && (
              <SearchableSelect
                id="document-tax-rate"
                aria-label="GST rate on the total"
                name="documentTaxRate"
                value={String(toNumber(documentRate))}
                onChange={(event) => setDocumentRate(event.target.value)}
                options={rateOptions.filter((option) => option.value !== '0')}
              />
            )}
            {!gstOn && <p className={formStyles.hint}>No GST: the total is the items alone.</p>}
            {mixedRates && <p className={formStyles.hint}>The items had different GST rates. Saving applies this one to all of them.</p>}
          </div>
        )}
        <dl className={styles.totals} aria-live="polite">
          <dt>{showTax ? 'Taxable value' : 'Subtotal'}</dt>
          <dd>{formatRupees(totals.subtotal)}</dd>
          {!showTax ? null : isInterState ? (
            <>
              <dt>{taxNames.igst}</dt>
              <dd>{formatRupees(totals.igst)}</dd>
            </>
          ) : (
            <>
              <dt>{taxNames.cgst}</dt>
              <dd>{formatRupees(totals.cgst)}</dd>
              <dt>{taxNames.sgst}</dt>
              <dd>{formatRupees(totals.sgst)}</dd>
            </>
          )}
          <dt className={styles.grandTotal}>Total</dt>
          <dd className={styles.grandTotal}>{formatRupees(totals.total)}</dd>
        </dl>
        </div>
      </div>
    </div>
  );
}
