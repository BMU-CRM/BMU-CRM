import { Pencil, Printer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocumentLines } from '@/components/finance/DocumentLines';
import { QuotationStatusBadge } from '@/components/finance/FinanceBadges';
import { FinanceLiveRefresh } from '@/components/finance/FinanceLiveRefresh';
import { ActionButton } from '@/components/ui/ActionButton';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { stateCode } from '@/lib/finance/indianStates';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import {
  changeQuotationStatusAction,
  createInvoiceFromQuotationAction,
  deleteQuotationAction,
} from '@/server/actions/quotationActions';
import { requirePagePermission } from '@/server/services/accessService';
import { hasFinanceReach } from '@/server/services/financeService';
import { getQuotation, listQuotationItems } from '@/server/services/quotationService';

export const metadata: Metadata = { title: 'Quotation' };

type QuotationPageProps = {
  params: Promise<{ quotationId: string }>;
};

export default async function QuotationPage({ params }: QuotationPageProps) {
  const access = await requirePagePermission(permissionKeys.quotationsView);
  const quotationId = parseId((await params).quotationId);
  if (!quotationId) notFound();

  const [quotation, items] = await Promise.all([getQuotation(quotationId), listQuotationItems(quotationId)]);
  if (!quotation) notFound();

  // The buttons offered match guard_quotation_write, which has the final say.
  const canManage = hasFinanceReach(access, permissionKeys.quotationsManage, quotation);
  const canInvoice = hasFinanceReach(access, permissionKeys.invoicesManage, { client: quotation.client });
  const canOpenClient = access.permissions[permissionKeys.clientsView] !== undefined;
  const status = quotation.status;
  const isEditable = canManage && (status === 'draft' || status === 'sent');
  const move = (target: typeof status) => changeQuotationStatusAction.bind(null, quotation.id, target);
  const place = quotation.place_of_supply;

  return (
    <>
      <FinanceLiveRefresh table="quotations" id={quotation.id} />
      <PageHeader
        title={quotation.title}
        description={`${quotation.quotation_number} · ${quotation.client?.company_name ?? 'Unknown client'} · ${formatDate(quotation.issue_date)}`}
        actions={
          <>
            {canManage && status === 'draft' && <ActionButton label="Mark as sent" variant="primary" action={move('sent')} />}
            {canManage && status === 'sent' && (
              <>
                <ActionButton label="Client accepted" variant="primary" action={move('accepted')} />
                <ActionButton label="Client declined" variant="secondary" action={move('declined')} />
                <ActionButton label="Back to draft" action={move('draft')} />
              </>
            )}
            {canManage && status === 'declined' && <ActionButton label="Revise" variant="secondary" action={move('draft')} />}
            {status === 'accepted' && !quotation.invoice_id && (
              <>
                {canInvoice && (
                  <ActionButton
                    label="Create invoice"
                    variant="primary"
                    action={createInvoiceFromQuotationAction.bind(null, quotation.id)}
                  />
                )}
                {canManage && <ActionButton label="Undo acceptance" action={move('sent')} />}
              </>
            )}
            {quotation.invoice && (
              <ButtonLink href={`/invoices/${quotation.invoice.id}`} variant="secondary">
                Open invoice
              </ButtonLink>
            )}
            {isEditable && (
              <ButtonLink href={`/quotations/${quotation.id}/edit`}>
                <Pencil size={16} aria-hidden="true" />
                Edit
              </ButtonLink>
            )}
            <ButtonLink href={`/quotations/${quotation.id}/print`}>
              <Printer size={16} aria-hidden="true" />
              Print
            </ButtonLink>
            {canManage && status === 'draft' && (
              <ConfirmActionButton
                label="Delete"
                title="Delete this draft quotation?"
                description="It will be removed completely. This cannot be undone."
                confirmLabel="Delete quotation"
                action={deleteQuotationAction.bind(null, quotation.id)}
              />
            )}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          <Panel
            title="Items"
            action={
              <div className={layout.badges}>
                <QuotationStatusBadge status={status} validUntil={quotation.valid_until} />
              </div>
            }
            flush
          >
            <DocumentLines lines={items} money={quotation} />
          </Panel>
          {(quotation.notes || quotation.terms) && (
            <Panel title="Notes and terms">
              {quotation.notes && <p className={layout.text}>{quotation.notes}</p>}
              {quotation.terms && <p className={`${layout.text} ${layout.muted} ${quotation.notes ? layout.spaced : ''}`}>{quotation.terms}</p>}
            </Panel>
          )}
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Client</dt>
                <dd>
                  {quotation.client && canOpenClient ? (
                    <Link href={`/clients/${quotation.client.id}`} className={layout.link}>
                      {quotation.client.company_name}
                    </Link>
                  ) : (
                    (quotation.client?.company_name ?? 'Unknown client')
                  )}
                </dd>
              </div>
              {quotation.project && (
                <div>
                  <dt>Project</dt>
                  <dd>
                    <Link href={`/projects/${quotation.project.id}`} className={layout.link}>
                      {quotation.project.name}
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt>Bill to</dt>
                <dd className={layout.text}>
                  {quotation.bill_to_name}
                  {quotation.bill_to_address ? `\n${quotation.bill_to_address}` : ''}
                </dd>
              </div>
              <div>
                <dt>Client GSTIN</dt>
                <dd>{quotation.client_gstin ?? 'Not registered'}</dd>
              </div>
              <div>
                <dt>Place of supply</dt>
                <dd>{place ? `${place}${stateCode(place) ? ` (${stateCode(place)})` : ''}` : 'Not set'}</dd>
              </div>
              <div>
                <dt>Valid until</dt>
                <dd>{formatDate(quotation.valid_until)}</dd>
              </div>
              <div>
                <dt>Prepared by</dt>
                <dd>{quotation.author?.full_name ?? 'Former employee'}</dd>
              </div>
              {quotation.sent_at && (
                <div>
                  <dt>Sent</dt>
                  <dd>{formatDateTime(quotation.sent_at)}</dd>
                </div>
              )}
              {quotation.decided_at && (
                <div>
                  <dt>{status === 'declined' ? 'Declined' : 'Accepted'}</dt>
                  <dd>{formatDateTime(quotation.decided_at)}</dd>
                </div>
              )}
              {quotation.invoice && (
                <div>
                  <dt>Invoice</dt>
                  <dd>
                    <Link href={`/invoices/${quotation.invoice.id}`} className={layout.link}>
                      {quotation.invoice.invoice_number ?? 'Draft invoice'}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
