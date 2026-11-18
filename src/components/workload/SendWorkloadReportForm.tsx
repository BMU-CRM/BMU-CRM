'use client';

import { TextAreaField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { sendWorkloadReportAction } from '@/server/actions/workloadActions';

// Sends the day or week on screen. The figures are kept as they are at that moment.
export function SendWorkloadReportForm({ period, date }: { period: 'day' | 'week'; date: string }) {
  return (
    <InlineActionForm action={sendWorkloadReportAction} submitLabel="Send report">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="date" value={date} />
      <TextAreaField label="Note (optional)" name="note" rows={2} maxLength={1000} placeholder="Anything to point out" />
    </InlineActionForm>
  );
}
