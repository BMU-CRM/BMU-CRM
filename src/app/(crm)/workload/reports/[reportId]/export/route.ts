import { csvResponse } from '@/lib/csv/csvCell';
import { parseId } from '@/lib/parseListParams';
import { workloadFileName } from '@/lib/workload/workloadPeriod';
import { workloadCsv } from '@/lib/workload/workloadReport';
import { getActionAccess } from '@/server/services/accessService';
import { getWorkloadReport } from '@/server/services/workloadService';

// A sent report as a spreadsheet, with its figures as they were when sent. The database
// lets only the sender and those who receive workload reports read it.
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  if (!(await getActionAccess())) return new Response('Not found', { status: 404 });
  const reportId = parseId((await params).reportId);
  const report = reportId ? await getWorkloadReport(reportId) : null;
  if (!report) return new Response('Not found', { status: 404 });
  const { header, rows } = workloadCsv(report.rows);
  return csvResponse(header, rows, workloadFileName({ kind: report.kind, from: report.period_from }));
}
