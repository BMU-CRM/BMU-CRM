// Signatures and seals on quotations and invoices, and the service details on their
// items, tested as real signed-in users.
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestPeople } from './helpers/testDatabase';

const runId = Date.now();
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

describe('document signatures and service details', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;
  let clientId = '';

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('manager', 'Client Manager', 'Management', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'founder');
    const { data: client } = await admin
      .from('clients')
      .insert({ company_name: `Signature client ${runId}`, client_manager_id: ids.manager! })
      .select('id')
      .single();
    clientId = client!.id;
  });

  const item = {
    description: 'Technical fixes and content',
    quantity: 3,
    unit_price: 15000,
    tax_rate: 18,
    service_group: 'Marketing & Visibility',
    service_name: 'SEO (Starter plan)',
    billing: 'monthly',
  };

  it('lets people who prepare documents save their signature and seal, and nobody else', async () => {
    const saved = await as.manager!
      .from('document_signatures')
      .insert({ employee_id: ids.manager!, signature_image: image, seal_image: image, signatory_title: 'Client Manager' })
      .select('employee_id');
    expect(saved.data).toHaveLength(1);

    const designer = await as.designer!.from('document_signatures').insert({ employee_id: ids.designer!, signature_image: image }).select('employee_id');
    expect(designer.error).not.toBeNull();
    const forSomeoneElse = await as.founder!.from('document_signatures').insert({ employee_id: ids.manager!, signature_image: image }).select('employee_id');
    expect(forSomeoneElse.error).not.toBeNull();

    // Only images are accepted.
    const notImage = await as.founder!.from('document_signatures').insert({ employee_id: ids.founder!, signature_image: 'javascript:alert(1)' });
    expect(notImage.error).not.toBeNull();

    // The log says what changed, without the image.
    const { data: log } = await admin.from('audit_logs').select('details').eq('entity_type', 'document_signatures').eq('entity_id', ids.manager!);
    expect(JSON.stringify(log)).toContain('signature uploaded');
    expect(JSON.stringify(log)).not.toContain('base64');
  });

  it('keeps signatures from people who cannot see documents', async () => {
    expect((await as.designer!.from('document_signatures').select('employee_id').eq('employee_id', ids.manager!)).data).toEqual([]);
    expect((await as.founder!.from('document_signatures').select('employee_id').eq('employee_id', ids.manager!)).data).toHaveLength(1);
  });

  it('signs an invoice as the person saving it, with the service details on its items', async () => {
    const { data: invoiceId, error } = await as.manager!.rpc('save_invoice', {
      p_invoice: null as unknown as string,
      p_values: { client_id: clientId, title: 'SEO retainer', signature: 'mine', show_seal: true },
      p_items: [item],
    });
    expect(error).toBeNull();
    const { data: invoice } = await admin.from('invoices').select('signed_by, show_seal').eq('id', invoiceId as string).single();
    expect(invoice).toEqual({ signed_by: ids.manager!, show_seal: true });
    const { data: items } = await admin.from('invoice_items').select('service_group, service_name, billing').eq('invoice_id', invoiceId as string);
    expect(items).toEqual([{ service_group: 'Marketing & Visibility', service_name: 'SEO (Starter plan)', billing: 'monthly' }]);

    // Someone else editing it keeps the signature, unless they sign it themselves.
    const kept = await as.founder!.rpc('save_invoice', {
      p_invoice: invoiceId as string,
      p_values: { client_id: clientId, title: 'SEO retainer, 3 months', signature: 'keep' },
      p_items: [item],
    });
    expect(kept.error).toBeNull();
    expect((await admin.from('invoices').select('signed_by, show_seal').eq('id', invoiceId as string).single()).data).toEqual({
      signed_by: ids.manager!,
      show_seal: true,
    });

    // The founder has no signature yet.
    const mine = await as.founder!.rpc('save_invoice', {
      p_invoice: invoiceId as string,
      p_values: { client_id: clientId, title: 'SEO retainer, 3 months', signature: 'mine' },
      p_items: [item],
    });
    expect(mine.error?.message).toContain('Upload your signature');

    const removed = await as.founder!.rpc('save_invoice', {
      p_invoice: invoiceId as string,
      p_values: { client_id: clientId, title: 'SEO retainer, 3 months', signature: 'none', show_seal: true },
      p_items: [item],
    });
    expect(removed.error).toBeNull();
    expect((await admin.from('invoices').select('signed_by, show_seal').eq('id', invoiceId as string).single()).data).toEqual({
      signed_by: null,
      show_seal: false,
    });
  });

  it('refuses putting someone else\'s signature on a document directly', async () => {
    const { data: invoiceId } = await as.founder!.rpc('save_invoice', {
      p_invoice: null as unknown as string,
      p_values: { client_id: clientId, title: 'Direct sign' },
      p_items: [item],
    });
    const forged = await as.founder!.from('invoices').update({ signed_by: ids.manager! }).eq('id', invoiceId as string).select('id');
    expect(forged.error?.message).toContain('own signature');
  });

  it('refuses a made-up billing on an item', async () => {
    const { error } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'Bad billing' },
      p_items: [{ ...item, billing: 'weekly' }],
    });
    expect(error).not.toBeNull();
  });

  it('keeps the service details when a quotation becomes an invoice', async () => {
    const { data: quotationId, error } = await as.manager!.rpc('save_quotation', {
      p_quotation: null as unknown as string,
      p_values: { client_id: clientId, title: 'Website', signature: 'mine' },
      p_items: [{ ...item, service_group: 'Web & AI', service_name: 'Website Design & Development (Growth plan)', billing: 'one_time', quantity: 1 }],
    });
    expect(error).toBeNull();
    expect((await admin.from('quotations').select('signed_by').eq('id', quotationId as string).single()).data?.signed_by).toBe(ids.manager!);

    await as.manager!.from('quotations').update({ status: 'final' }).eq('id', quotationId as string).select('id');
    await as.manager!.from('quotations').update({ status: 'sent' }).eq('id', quotationId as string).select('id');
    await as.manager!.from('quotations').update({ status: 'accepted' }).eq('id', quotationId as string).select('id');
    const { data: invoiceId, error: convertError } = await as.manager!.rpc('create_invoice_from_quotation', { p_quotation: quotationId as string });
    expect(convertError).toBeNull();
    const { data: items } = await admin.from('invoice_items').select('service_name, billing').eq('invoice_id', invoiceId as string);
    expect(items).toEqual([{ service_name: 'Website Design & Development (Growth plan)', billing: 'one_time' }]);
  });

  it('prints the company details and service descriptions', async () => {
    const { data: settings } = await admin.from('finance_settings').select('legal_name, website, email').single();
    expect(settings?.website).toBe('https://www.bmumarketing.in/');
    const { data: seo } = await admin.from('services').select('description').eq('name', 'SEO').single();
    expect(seo?.description).toContain('rank');
  });
});
