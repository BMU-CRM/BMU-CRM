// The project overview and title written from the services on a quotation or invoice.
import { describe, expect, it } from 'vitest';
import { writeOverview, writeTitle } from '@/lib/finance/documentOverview';

const two = [
  { serviceName: 'Social Media Management (Starter plan)', billing: 'monthly' },
  { serviceName: 'Google Business Profile (Starter plan)', billing: 'monthly' },
];

describe('writing the overview', () => {
  it('reads like the owner\'s sample for two Starter packages', () => {
    expect(writeOverview({ kind: 'quotation', companyName: 'BMU Marketing', clientName: 'VAMIKA', items: two })).toBe(
      'BMU Marketing is pleased to submit this quotation for the monthly marketing of VAMIKA. We propose two Starter packages, ' +
        'built for essential execution to start or test the channel: Social Media Management and Google Business Profile. ' +
        'VAMIKA may take either package, or both together for a complete online presence.',
    );
  });

  it('names each plan when they differ, and suits one-time work', () => {
    const text = writeOverview({
      kind: 'quotation',
      companyName: 'BMU Marketing',
      clientName: 'Acme',
      items: [
        { serviceName: 'Website Design & Development (Growth plan)', billing: 'one_time' },
        { serviceName: 'Complete Branding (Premium plan)', billing: 'one_time' },
      ],
    });
    expect(text).toContain('for the project work of Acme');
    expect(text).toContain('two services: Website Design & Development (Growth) and Complete Branding (Premium).');
  });

  it('words an invoice as what it covers, without offering a choice', () => {
    const text = writeOverview({ kind: 'invoice', companyName: 'BMU Marketing', clientName: 'VAMIKA', items: two.slice(0, 1) });
    expect(text).toBe(
      'BMU Marketing is pleased to present this invoice for the monthly marketing of VAMIKA. It covers a Starter package, ' +
        'built for essential execution to start or test the channel: Social Media Management.',
    );
  });

  it('stays within 400 characters, and is empty without services or a client', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ serviceName: `A rather long sub service name number ${index + 1} (Growth plan)`, billing: 'monthly' }));
    const text = writeOverview({ kind: 'quotation', companyName: 'BMU Marketing', clientName: 'VAMIKA', items: many });
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toContain('more');
    expect(writeOverview({ kind: 'quotation', companyName: 'BMU Marketing', clientName: 'VAMIKA', items: [] })).toBe('');
    expect(writeOverview({ kind: 'quotation', companyName: 'BMU Marketing', clientName: ' ', items: two })).toBe('');
  });

  it('names items typed by hand from their service or the start of their description', () => {
    const text = writeOverview({
      kind: 'quotation',
      companyName: 'BMU Marketing',
      clientName: 'Chiranvi Farm',
      items: [
        { serviceName: '', billing: '', description: 'Logo design: three concepts and two rounds of changes' },
        { serviceName: '', billing: '', serviceGroup: 'Video Production', description: 'Two reels a month' },
      ],
    });
    expect(text).toContain('two services: Logo design and Video Production.');
    expect(writeTitle('quotation', 'Chiranvi Farm', [{ serviceName: '', billing: '', description: 'Brand film. 60 seconds' }])).toBe('Brand film');
  });

  it('makes a title from the services, or from the client', () => {
    expect(writeTitle('quotation', 'VAMIKA', two)).toBe('Social Media Management and Google Business Profile');
    expect(writeTitle('invoice', 'VAMIKA', [{ serviceName: '', billing: '' }])).toBe('Invoice for VAMIKA');
  });
});
