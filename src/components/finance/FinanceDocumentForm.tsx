'use client';

import { useActionState, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
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
import { saveInvoiceAction } from '@/server/actions/invoiceActions';
import { saveQuotationAction } from '@/server/actions/quotationActions';
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
};

// One form for quotations and invoices. Bill-to details left empty are filled in from
// the client when it is saved.
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
}: FinanceDocumentFormProps) {
  const save = kind === 'quotation' ? saveQuotationAction : saveInvoiceAction;
  const [result, formAction] = useActionState(save.bind(null, document?.id ?? null), idleResult);
  const errors = result.fieldErrors;

  const [clientId, setClientId] = useState(document?.client_id ?? defaultClientId ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(document?.place_of_supply ?? '');
  const client = clients.find((option) => option.value === clientId);
  const effectivePlace = placeOfSupply || client?.billingState || '';
  const clientProjects = projects.filter((project) => project.clientId === clientId);

  const noun = kind === 'quotation' ? 'quotation' : 'invoice';
  const cancelHref = document ? `/${noun}s/${document.id}` : `/${noun}s`;

  return (
    <KeepValuesForm action={formAction}>
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
              onChange={(event) => setClientId(event.target.value)}
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

        <Panel title="Bill to" description="Leave a field empty to use the client's details.">
          <FormGrid>
            <TextField
              label="Name"
              name="billToName"
              defaultValue={document?.bill_to_name ?? ''}
              placeholder={client?.label}
              error={errors?.billToName}
            />
            <TextField
              label="Client GSTIN"
              name="clientGstin"
              defaultValue={document?.client_gstin ?? ''}
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
              defaultValue={document?.bill_to_address ?? ''}
              placeholder={client?.address ?? undefined}
              error={errors?.billToAddress}
            />
          </div>
        </Panel>

        <Panel title="Items">
          <DocumentItemsEditor
            initialItems={items}
            defaultTaxRate={defaultTaxRate}
            isInterState={isInterStateSupply(companyState, effectivePlace)}
            error={errors?.items}
            services={services}
          />
        </Panel>

        <Panel title="Notes and terms" description="Both are printed on the document the client sees.">
          <TextAreaField label="Notes" name="notes" rows={2} defaultValue={document?.notes ?? ''} error={errors?.notes} />
          <div className={layout.spaced}>
            <TextAreaField
              label="Terms"
              name="terms"
              rows={4}
              defaultValue={document ? (document.terms ?? '') : (defaultTerms ?? '')}
              error={errors?.terms}
            />
          </div>
        </Panel>
      </div>
      <FormActions>
        <SubmitButton label={document ? 'Save changes' : `Save ${noun} as draft`} pendingLabel="Saving…" />
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </FormActions>
    </KeepValuesForm>
  );
}
