// Stage 2 of HR and Finance: the employee record. Who sees and changes personal details,
// identity and bank details, and employee documents; revealing a number is recorded;
// employment history; and the field encryption itself.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { formatAadhaar, maskAadhaar, maskAccount } from '@/lib/employees/employeeRecordLabels';
import { privateDetailsSchema } from '@/lib/validation/employeeSchema';
import { createTestPeople } from './helpers/testDatabase';

vi.mock('server-only', () => ({}));

const runId = Date.now();
const testKey = Buffer.alloc(32, 7).toString('base64');

describe('the employee record', () => {
  const people = createTestPeople(runId);
  const { admin, ids, clients: as } = people;

  beforeAll(async () => {
    await people.addPerson('founder', 'Founder', 'Management');
    await people.addPerson('hr', 'Human Resource', 'Management', 'founder');
    await people.addPerson('head', 'Design & Development Head', 'Design & Development', 'founder');
    await people.addPerson('designer', 'Employee', 'Design & Development', 'head');
    await people.addPerson('colleague', 'Employee', 'Design & Development', 'head');
    await people.addPerson('finance', 'Finance Head', 'Finance', 'founder');
  });

  async function scopeOf(key: string, permission: string) {
    const { data } = await as[key]!.rpc('get_my_permissions');
    return (data ?? []).find((row) => row.permission_key === permission)?.scope;
  }

  it('gives private details access to HR and the Founder only', async () => {
    expect(await scopeOf('hr', 'employees.private_view')).toBe('organisation');
    expect(await scopeOf('founder', 'employees.private_view')).toBe('organisation');
    for (const key of ['head', 'designer', 'finance']) {
      expect(await scopeOf(key, 'employees.private_view'), key).toBeUndefined();
    }
  });

  describe('identity and bank details', () => {
    beforeAll(async () => {
      const { error } = await as.hr!
        .from('employee_private_details')
        .insert({
          employee_id: ids.designer!,
          aadhaar_encrypted: 'v1:c2VjcmV0',
          aadhaar_last4: '9012',
          pan: 'ABCDE1234F',
          bank_name: 'Test Bank',
          account_number_encrypted: 'v1:YWNjb3VudA==',
          account_last4: '4321',
          ifsc: 'HDFC0001234',
          account_holder: 'Test designer',
        })
        .select('employee_id');
      expect(error).toBeNull();
    });

    it('lets the person read their own, and nobody else but HR', async () => {
      expect((await as.designer!.from('employee_private_details').select('pan').eq('employee_id', ids.designer!)).data).toEqual([{ pan: 'ABCDE1234F' }]);
      expect((await as.hr!.from('employee_private_details').select('pan').eq('employee_id', ids.designer!)).data).toHaveLength(1);
      for (const key of ['head', 'colleague', 'finance']) {
        expect((await as[key]!.from('employee_private_details').select('pan').eq('employee_id', ids.designer!)).data, key).toEqual([]);
      }
    });

    it('lets only HR change them, not the person', async () => {
      const own = await as.designer!.from('employee_private_details').update({ bank_name: 'Changed' }).eq('employee_id', ids.designer!).select('employee_id');
      expect(own.data ?? []).toEqual([]);
      const manager = await as.head!.from('employee_private_details').update({ bank_name: 'Changed' }).eq('employee_id', ids.designer!).select('employee_id');
      expect(manager.data ?? []).toEqual([]);
      const hr = await as.hr!.from('employee_private_details').update({ bank_name: 'New Bank' }).eq('employee_id', ids.designer!).select('employee_id');
      expect(hr.data).toHaveLength(1);
    });

    it('refuses numbers that were not encrypted', async () => {
      const { error } = await as.hr!.from('employee_private_details').update({ aadhaar_encrypted: '123456789012' }).eq('employee_id', ids.designer!);
      expect(error).not.toBeNull();
    });

    it('records each reveal, and refuses anyone without access', async () => {
      expect((await as.designer!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'aadhaar' })).error).toBeNull();
      expect((await as.hr!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'account_number' })).error).toBeNull();
      expect((await as.head!.rpc('record_private_detail_reveal', { p_employee: ids.designer!, p_field: 'aadhaar' })).error?.message).toContain('permission');

      const { data: entries } = await admin
        .from('audit_logs')
        .select('actor_employee_id, details')
        .eq('entity_type', 'employee_private_details')
        .eq('action', 'revealed')
        .eq('entity_id', ids.designer!);
      expect((entries ?? []).map((entry) => entry.actor_employee_id).sort()).toEqual([ids.designer!, ids.hr!].sort());
    });

    it('logs changes by field name, never the values', async () => {
      const { data: entries } = await admin
        .from('audit_logs')
        .select('details')
        .eq('entity_type', 'employee_private_details')
        .eq('entity_id', ids.designer!)
        .in('action', ['created', 'updated']);
      const text = JSON.stringify(entries);
      expect(text).toContain('bank_name');
      expect(text).not.toContain('ABCDE1234F');
      expect(text).not.toContain('v1:');
    });
  });

  describe('personal details', () => {
    it('lets people keep their own contact details, but not their date of birth', async () => {
      const contact = await as.designer!
        .from('employee_personal_details')
        .upsert({ employee_id: ids.designer!, personal_email: 'me@example.com', address: 'Chennai' }, { onConflict: 'employee_id' })
        .select('employee_id');
      expect(contact.error).toBeNull();
      expect(contact.data).toHaveLength(1);

      const birthday = await as.designer!.from('employee_personal_details').update({ date_of_birth: '1995-05-05' }).eq('employee_id', ids.designer!);
      expect(birthday.error?.message).toContain('Ask HR');
    });

    it('lets HR set the date of birth and gender', async () => {
      const { data, error } = await as.hr!
        .from('employee_personal_details')
        .update({ date_of_birth: '1995-05-05', gender: 'female' })
        .eq('employee_id', ids.designer!)
        .select('employee_id');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it('keeps them from colleagues and other departments', async () => {
      expect((await as.hr!.from('employee_personal_details').select('address').eq('employee_id', ids.designer!)).data).toEqual([{ address: 'Chennai' }]);
      for (const key of ['colleague', 'finance']) {
        expect((await as[key]!.from('employee_personal_details').select('address').eq('employee_id', ids.designer!)).data, key).toEqual([]);
        const write = await as[key]!.from('employee_personal_details').update({ address: 'Elsewhere' }).eq('employee_id', ids.designer!).select('employee_id');
        expect(write.data ?? [], key).toEqual([]);
      }
    });

    it('shows upcoming birthdays to HR only', async () => {
      expect((await as.hr!.rpc('get_upcoming_birthdays')).error).toBeNull();
      expect((await as.designer!.rpc('get_upcoming_birthdays')).error?.message).toContain('permission');
    });
  });

  describe('employee documents', () => {
    let documentId = '';

    beforeAll(async () => {
      const { data, error } = await as.hr!
        .from('files')
        .insert({ kind: 'link', name: 'Offer letter', external_url: 'https://example.com/offer', employee_id: ids.designer!, document_type: 'offer_letter' })
        .select('id')
        .single();
      expect(error).toBeNull();
      documentId = data!.id;
    });

    it('shows a document to the person, HR and the Founder only', async () => {
      for (const key of ['designer', 'hr', 'founder']) {
        expect((await as[key]!.from('files').select('id').eq('id', documentId)).data, key).toHaveLength(1);
      }
      for (const key of ['head', 'colleague', 'finance']) {
        expect((await as[key]!.from('files').select('id').eq('id', documentId)).data, key).toEqual([]);
      }
    });

    it('lets people add documents to their own record only', async () => {
      const own = await as.designer!
        .from('files')
        .insert({ kind: 'link', name: 'My resume', external_url: 'https://example.com/cv', employee_id: ids.designer!, document_type: 'resume' })
        .select('id');
      expect(own.error).toBeNull();

      const other = await as.designer!
        .from('files')
        .insert({ kind: 'link', name: 'Not mine', external_url: 'https://example.com/x', employee_id: ids.colleague!, document_type: 'other' });
      expect(other.error?.message).toContain('own record');
    });

    it('needs a document type, and cannot be shared or moved', async () => {
      const untyped = await as.hr!.from('files').insert({ kind: 'link', name: 'Untyped', external_url: 'https://example.com/u', employee_id: ids.designer! });
      expect(untyped.error).not.toBeNull();

      const shared = await as.hr!.from('file_shares').insert({ file_id: documentId, recipient_employee_id: ids.head! });
      expect(shared.error?.message).toContain('cannot be shared');

      const moved = await as.hr!.from('files').update({ employee_id: ids.colleague! }).eq('id', documentId);
      expect(moved.error?.message).toContain('stays with the employee');
    });
  });

  describe('work details and history', () => {
    it('keeps employment type, probation and confirmation with managers', async () => {
      const own = await as.designer!.from('employees').update({ probation_months: 1 }).eq('id', ids.designer!);
      expect(own.error?.message).toContain('permission');

      const fullTime = (await admin.from('employment_types').select('id').eq('name', 'Full-time').single()).data!.id;
      const { data, error } = await as.hr!
        .from('employees')
        .update({ employment_type_id: fullTime, probation_months: 6, joining_date: '2026-01-15', confirmation_date: null })
        .eq('id', ids.designer!)
        .select('probation_end_date');
      expect(error).toBeNull();
      expect(data).toEqual([{ probation_end_date: '2026-07-15' }]);
    });

    it('lists the changes with names, for the person and HR', async () => {
      const { data, error } = await as.designer!.rpc('get_employment_history', { p_employee: ids.designer! });
      expect(error).toBeNull();
      const type = (data ?? []).find((entry) => entry.field === 'employment_type_id');
      expect(type?.new_value).toBe('Full-time');
      expect((data ?? []).some((entry) => entry.field === 'probation_months' && entry.new_value === '6')).toBe(true);

      expect((await as.hr!.rpc('get_employment_history', { p_employee: ids.designer! })).error).toBeNull();
      expect((await as.colleague!.rpc('get_employment_history', { p_employee: ids.designer! })).error?.message).toContain('permission');
    });
  });
});

describe('field encryption', () => {
  it('encrypts so the same number never looks the same, and reads it back', async () => {
    const { encryptField, decryptField } = await import('@/server/security/fieldEncryption');
    const first = encryptField('123456789012', testKey);
    const second = encryptField('123456789012', testKey);
    expect(first).toMatch(/^v1:/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('123456789012');
    expect(decryptField(first, testKey)).toBe('123456789012');
  });

  it('notices tampering and a wrong key', async () => {
    const { encryptField, decryptField } = await import('@/server/security/fieldEncryption');
    const sealed = encryptField('987654321', testKey);
    const bytes = Buffer.from(sealed.slice(3), 'base64');
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    expect(() => decryptField(`v1:${bytes.toString('base64')}`, testKey)).toThrow();
    expect(() => decryptField(sealed, Buffer.alloc(32, 9).toString('base64'))).toThrow();
  });

  it('refuses to work without a proper key', async () => {
    const { encryptField, EncryptionNotSetUpError } = await import('@/server/security/fieldEncryption');
    expect(() => encryptField('1', '')).toThrow(EncryptionNotSetUpError);
    expect(() => encryptField('1', Buffer.alloc(16).toString('base64'))).toThrow(EncryptionNotSetUpError);
  });

  it('masks and formats numbers for display', () => {
    expect(maskAadhaar('9012')).toBe('XXXX XXXX 9012');
    expect(maskAccount('4321')).toBe('XXXXXX4321');
    expect(maskAadhaar(null)).toBeNull();
    expect(formatAadhaar('123456789012')).toBe('1234 5678 9012');
  });

  it('checks Aadhaar, PAN, account and IFSC formats', () => {
    const base = { aadhaar: '', pan: '', bankName: '', accountNumber: '', ifsc: '', accountHolder: '', clearAadhaar: false, clearAccountNumber: false };
    expect(privateDetailsSchema.safeParse({ ...base, aadhaar: '1234 5678 9012', pan: 'abcde1234f', ifsc: 'hdfc0001234' }).success).toBe(true);
    expect(privateDetailsSchema.safeParse({ ...base, aadhaar: '12345' }).success).toBe(false);
    expect(privateDetailsSchema.safeParse({ ...base, pan: 'ABC123' }).success).toBe(false);
    expect(privateDetailsSchema.safeParse({ ...base, accountNumber: '12ab' }).success).toBe(false);
    expect(privateDetailsSchema.safeParse({ ...base, ifsc: 'HDFC1001234' }).success).toBe(false);
  });
});
