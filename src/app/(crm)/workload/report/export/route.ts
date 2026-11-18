import { permissionKeys } from '@/lib/access/permissionKeys';
import { csvResponse } from '@/lib/csv/csvCell';
import { todayInIndia } from '@/lib/formatDate';
import { chooseWorkloadPeriod, workloadFileName } from '@/lib/workload/workloadPeriod';
import { workloadCsv } from '@/lib/workload/workloadReport';
import { getActionAccess } from '@/server/services/accessService';
import { getWorkloadActivity } from '@/server/services/workloadService';

// The day or week report as a spreadsheet, for the people in your reach.
export async function GET(request: Request) {
  if (!(await getActionAccess(permissionKeys.workloadView))) return new Response('Not found', { status: 404 });
  const params = Object.fromEntries(new URL(request.url).searchParams) as { period?: string; date?: string };
  const period = chooseWorkloadPeriod(params, todayInIndia());
  const { header, rows } = workloadCsv(await getWorkloadActivity(period));
  return csvResponse(header, rows, workloadFileName(period));
}
