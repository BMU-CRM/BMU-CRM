'use client';

import { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { ButtonLink } from '@/components/ui/Button';
import formStyles from '@/components/ui/FormFields.module.css';
import {
  FormActions,
  FormGrid,
  SelectField,
  TextAreaField,
  TextField,
  type SelectOption,
} from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { KeepValuesForm } from '@/components/ui/KeepValuesForm';
import { Panel } from '@/components/ui/Panel';
import { SubmitButton } from '@/components/ui/SubmitButton';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { idleResult } from '@/lib/actionResult';
import type { PricedService } from '@/lib/catalog/servicePricing';
import { isInterStateSupply } from '@/lib/finance/documentTotals';
import { stateOptionsWith } from '@/lib/finance/indianStates';
import { formatLongDate, validUntilDate, withValidUntil, writtenValidUntil } from '@/lib/finance/quotationTerms';
import { autosaveInvoiceAction, saveInvoiceAction } from '@/server/actions/invoiceActions';
import { autosaveQuotationAction, saveQuotationAction } from '@/server/actions/quotationActions';
import type { ClientServiceItem } from '@/server/services/catalogService';
import type { SigningChoice } from '@/server/services/signatureService';
import { DocumentItemsEditor, type ItemDraft } from './DocumentItemsEditor';

export type ClientChoice = SelectOption & { billingState: string | null; address: string | null; gstin: string | null };
export type ProjectChoice = SelectOption & { clientId: string | null };

export type FinanceDocumentDraft = {
  id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  issue_date: string;
  end_date: string;
  bill_to_name: string | null;
  bill_to_address: string | null;
  client_gstin: string | null;
  place_of_supply: string | null;
  notes: string | null;
  terms: string | null;
};

type FinanceDocumentFormProps = {
  kind: 'quotation' | 'invoice';
  document?: FinanceDocumentDraft;
  items?: ItemDraft[];
  defaultClientId?: string;
  clients: ClientChoice[];
  projects: ProjectChoice[];
  companyState: string | null;
  defaultTaxRate: number;
  endDays: number;
  defaultTerms: string | null;
  today: string;
  services: PricedService[];
  signing: SigningChoice;
  // On a new document: the services each client takes, added as items when it is chosen.
  clientServiceItems?: Record<string, ClientServiceItem[]>;
};

// Sign with your own signature, keep whoever signed it, or leave it to sign by hand.
// The seal printed is the signer's.
function SigningFields({ signing }: { signing: SigningChoice }) {
  const { currentSigner, myId, hasSignature, hasSeal } = signing;
  const signedByMe = currentSigner?.id === myId;
  const options: SelectOption[] = [];
  if (currentSigner) options.push({ value: 'keep', label: signedByMe ? 'Sign with my signature' : `Keep ${currentSigner.name}’s signature` });
  if (hasSignature && !signedByMe) options.push({ value: 'mine', label: 'Sign with my signature' });
  options.push({ value: 'none', label: 'No signature (sign by hand after printing)' });
  const initial = currentSigner ? 'keep' : hasSignature ? 'mine' : 'none';
  const [choice, setChoice] = useState(initial);

  return (
    <>
      <FormGrid>
        <SelectField label="Signature" name="signature" options={options} value={choice} onChange={(event) => setChoice(event.target.value)} />
      </FormGrid>
      {choice !== 'none' && (
        <label className={layout.spaced}>
          <input type="checkbox" name="showSeal" defaultChecked={signing.showSeal ?? hasSeal} /> Add the company seal under the signature
        </label>
      )}
      {!hasSignature && (
        <p className={formStyles.hint}>
          To sign with your own signature, first upload it and the company seal in <Link href="/profile#signature">My profile</Link>.
        </p>
      )}
    </>
  );
}

function itemFromClientService(item: ClientServiceItem, taxRate: number): ItemDraft {
  return {
    description: item.description,
    hsnSac: '',
    quantity: '1',
    unitPrice: item.unitPrice,
    taxRate: String(taxRate),
    serviceGroup: item.serviceGroup,
    serviceName: item.serviceName,
    billing: item.billing,
  };
}

type AutosaveState = { state: 'idle' | 'saving' | 'saved' | 'problem'; message?: string };

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

// One form for quotations and invoices.
// - Choosing the client fills in its name, address and GSTIN, and, on a new document,
//   adds the services the client takes as items (until the items are changed by hand).
// - The draft saves itself a few seconds after each change, once the required fields
//   are filled, and when the page is left. A new one then opens as an edit, so a reload
//   carries on with the same draft.
export function FinanceDocumentForm({
  kind,
  document,
  items = [],
  defaultClientId,
  clients,
  projects,
  companyState,
  defaultTaxRate,
  endDays,
  defaultTerms,
  today,
  services,
  signing,
  clientServiceItems = {},
}: FinanceDocumentFormProps) {
  const save = kind === 'quotation' ? saveQuotationAction : saveInvoiceAction;
  const autosave = kind === 'quotation' ? autosaveQuotationAction : autosaveInvoiceAction;
  const [result, formAction] = useActionState(save.bind(null, document?.id ?? null), idleResult);
  const errors = result.fieldErrors;
  const noun = kind === 'quotation' ? 'quotation' : 'invoice';

  const [clientId, setClientId] = useState(document?.client_id ?? defaultClientId ?? '');

  // The client's name, address and GSTIN, until they are changed by hand.
  const detailsOf = (id: string) => {
    const chosen = clients.find((option) => option.value === id);
    return { name: chosen?.label ?? '', address: chosen?.address ?? '', gstin: chosen?.gstin ?? '' };
  };
  const [billTo, setBillTo] = useState(() =>
    document
      ? { name: document.bill_to_name ?? '', address: document.bill_to_address ?? '', gstin: document.client_gstin ?? '' }
      : detailsOf(defaultClientId ?? ''),
  );
  const billToEdited = useRef(false);
  const editBillTo = (field: 'name' | 'address' | 'gstin') => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    billToEdited.current = true;
    const value = event.target.value;
    setBillTo((current) => ({ ...current, [field]: value }));
  };

  // The items: on a new document, the client's services until the items are changed.
  const servicesOf = (id: string) => (clientServiceItems[id] ?? []).map((item) => itemFromClientService(item, defaultTaxRate));
  const [itemsSeed, setItemsSeed] = useState(() => ({
    key: 0,
    items: items.length > 0 || document ? items : servicesOf(defaultClientId ?? ''),
  }));
  const itemsEdited = useRef(false);

  function chooseClient(id: string) {
    setClientId(id);
    if (!billToEdited.current) setBillTo(detailsOf(id));
    if (!document && !itemsEdited.current) setItemsSeed((current) => ({ key: current.key + 1, items: servicesOf(id) }));
  }

  // Autosave.
  const [documentId, setDocumentId] = useState(document?.id ?? '');
  const [autosaved, setAutosaved] = useState<AutosaveState>({ state: 'idle' });
  const anchor = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const saving = useRef(false);
  const submitted = useRef(false);
  const autosaveLater = useRef<() => void>(() => undefined);

  const runAutosave = useCallback(async () => {
    clearTimeout(timer.current);
    const form = anchor.current?.form;
    if (!form || !dirty.current || submitted.current) return;
    if (saving.current) {
      timer.current = setTimeout(() => autosaveLater.current(), 2000);
      return;
    }
    // Waits until the client, what it is for and each item are filled in.
    if (!form.checkValidity()) return;
    dirty.current = false;
    saving.current = true;
    setAutosaved({ state: 'saving' });
    try {
      const outcome = await autosave(document?.id ?? null, new FormData(form));
      if ('id' in outcome) {
        setDocumentId(outcome.id);
        if (!document) window.history.replaceState(window.history.state, '', `/${noun}s/${outcome.id}/edit`);
        setAutosaved({ state: 'saved', message: `Draft saved at ${timeFormat.format(new Date())}` });
      } else {
        setAutosaved({ state: 'problem', message: `Not saved yet: ${outcome.message ?? 'check the form.'}` });
      }
    } catch {
      dirty.current = true;
      setAutosaved({ state: 'problem', message: 'Could not save just now. Your changes are still here.' });
    } finally {
      saving.current = false;
    }
  }, [autosave, document, noun]);

  // Quotation terms: "valid until <date>" follows the Valid until date while that line
  // still shows the date it was given automatically.
  const initialValidUntil = validUntilDate(document?.end_date, document?.issue_date ?? today, endDays);
  const shownValidUntil = useRef(initialValidUntil);
  const initialTerms = document
    ? (document.terms ?? '')
    : kind === 'quotation'
      ? withValidUntil(defaultTerms ?? '', initialValidUntil)
      : (defaultTerms ?? '');

  function followValidUntil(form: HTMLFormElement) {
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    const terms = field('terms');
    if (!terms) return;
    const next = validUntilDate(field('endDate')?.value, field('issueDate')?.value || today, endDays);
    const previous = shownValidUntil.current;
    if (!next || next === previous) return;
    if (previous && writtenValidUntil(terms.value) === formatLongDate(previous)) terms.value = withValidUntil(terms.value, next);
    shownValidUntil.current = next;
  }

  function changed(event: React.FormEvent<HTMLFormElement>) {
    if (submitted.current) return;
    const name = (event.target as HTMLInputElement).name;
    if (kind === 'quotation' && (name === 'issueDate' || name === 'endDate')) followValidUntil(event.currentTarget);
    if ((event.target as HTMLElement).closest('[data-items]')) itemsEdited.current = true;
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => autosaveLater.current(), 4000);
  }

  useEffect(() => {
    autosaveLater.current = () => void runAutosave();
  }, [runAutosave]);

  // Leaving the page (another tab, the app in the background) saves straight away.
  useEffect(() => {
    const leaving = () => {
      if (window.document.visibilityState === 'hidden') void runAutosave();
    };
    window.document.addEventListener('visibilitychange', leaving);
    return () => {
      window.document.removeEventListener('visibilitychange', leaving);
      clearTimeout(timer.current);
    };
  }, [runAutosave]);
  const [placeOfSupply, setPlaceOfSupply] = useState(document?.place_of_supply ?? '');
  const client = clients.find((option) => option.value === clientId);
  const effectivePlace = placeOfSupply || client?.billingState || '';
  const clientProjects = projects.filter((project) => project.clientId === clientId);

  const cancelHref = documentId ? `/${noun}s/${documentId}` : `/${noun}s`;

  return (
    <KeepValuesForm
      action={formAction}
      onInput={changed}
      onChange={changed}
      onSubmit={() => {
        submitted.current = true;
        clearTimeout(timer.current);
      }}
    >
      <input ref={anchor} type="hidden" name="documentId" value={documentId} />
      <div className={layout.stack}>
        <FormMessage result={result} />
        <Panel title="Details">
          <FormGrid>
            <SelectField
              label="Client"
              name="clientId"
              options={clients}
              placeholder="Choose a client"
              value={clientId}
              onChange={(event) => chooseClient(event.target.value)}
              required
              error={errors?.clientId}
            />
            <SelectField
              key={clientId}
              label="Project"
              name="projectId"
              options={clientProjects}
              placeholder={clientProjects.length ? 'None' : 'No projects for this client'}
              defaultValue={document?.client_id === clientId ? (document?.project_id ?? '') : ''}
              error={errors?.projectId}
            />
            <TextField
              label="What it is for"
              name="title"
              defaultValue={document?.title}
              placeholder="For example: Website redesign, phase 1"
              required
              error={errors?.title}
            />
            <TextField
              label={kind === 'quotation' ? 'Quotation date' : 'Invoice date'}
              name="issueDate"
              type="date"
              defaultValue={document?.issue_date ?? today}
              max={kind === 'invoice' ? today : undefined}
              required
              error={errors?.issueDate}
            />
            <TextField
              label={kind === 'quotation' ? 'Valid until' : 'Due date'}
              name="endDate"
              type="date"
              defaultValue={document?.end_date ?? ''}
              hint={`Leave empty for ${endDays} ${endDays === 1 ? 'day' : 'days'} after the date.`}
              error={errors?.endDate}
            />
          </FormGrid>
        </Panel>

        <Panel title="Bill to" description="Filled in from the client. Change them here for this document only.">
          <FormGrid>
            <TextField
              label="Name"
              name="billToName"
              value={billTo.name}
              onChange={editBillTo('name')}
              placeholder={client?.label}
              error={errors?.billToName}
            />
            <TextField
              label="Client GSTIN"
              name="clientGstin"
              value={billTo.gstin}
              onChange={editBillTo('gstin')}
              placeholder={client?.gstin ?? '15 characters, if registered'}
              maxLength={15}
              error={errors?.clientGstin}
            />
            <SelectField
              label="Place of supply"
              name="placeOfSupply"
              options={stateOptionsWith(placeOfSupply)}
              placeholder={client?.billingState ? `Client's state (${client.billingState})` : 'Not set'}
              value={placeOfSupply}
              onChange={(event) => setPlaceOfSupply(event.target.value)}
              hint={
                companyState
                  ? `Within ${companyState} is charged CGST and SGST. Anywhere else is charged IGST.`
                  : 'Set your company state in Finance settings to charge IGST outside it.'
              }
              error={errors?.placeOfSupply}
            />
          </FormGrid>
          <div className={layout.spaced}>
            <TextAreaField
              label="Address"
              name="billToAddress"
              rows={2}
              value={billTo.address}
              onChange={editBillTo('address')}
              placeholder={client ? 'No address saved for this client' : undefined}
              error={errors?.billToAddress}
            />
          </div>
        </Panel>

        <Panel
          title="Items"
          description={!document && clientId && (clientServiceItems[clientId]?.length ?? 0) > 0 ? 'The client’s services are added for you. Check the rates and quantities.' : undefined}
        >
          <div data-items>
            <DocumentItemsEditor
              key={itemsSeed.key}
              initialItems={itemsSeed.items}
            defaultTaxRate={defaultTaxRate}
            isInterState={isInterStateSupply(companyState, effectivePlace)}
            error={errors?.items}
            services={services}
            withServiceDetails
          />
          </div>
        </Panel>

        <Panel title="Signature and seal" description="Printed at the bottom, with your name and title under the signature.">
          <SigningFields signing={signing} />
        </Panel>

        <Panel title="Notes and terms" description="Both are printed on the document the client sees.">
          <TextAreaField label="Notes" name="notes" rows={2} defaultValue={document?.notes ?? ''} error={errors?.notes} />
          <div className={layout.spaced}>
            <TextAreaField
              label="Terms"
              name="terms"
              rows={4}
              defaultValue={initialTerms}
              error={errors?.terms}
            />
          </div>
        </Panel>
      </div>
      <FormActions>
        <SubmitButton label={document ? 'Save changes' : `Save ${noun} as draft`} pendingLabel="Saving…" />
        <ButtonLink href={cancelHref} variant="ghost">
          {documentId ? 'Close' : 'Cancel'}
        </ButtonLink>
        <span className={formStyles.hint} role="status" aria-live="polite" data-autosave={autosaved.state}>
          {autosaved.state === 'saving' ? 'Saving draft…' : (autosaved.message ?? 'Saves as a draft automatically while you work.')}
        </span>
      </FormActions>
    </KeepValuesForm>
  );
}
