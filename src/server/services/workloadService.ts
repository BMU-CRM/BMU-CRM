import 'server-only';
import { todayInIndia } from '@/lib/formatDate';
import { createDatabaseClient } from '@/server/database/databaseClient';
import { calculateWorkload, type WorkloadRow } from '@/lib/tasks/calculateWorkload';
import type { WorkloadPeriod } from '@/lib/workload/workloadPeriod';
import { toWorkloadActivity } from '@/lib/workload/workloadReport';

export async function getWorkloads() {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_workload_rows');
  if (error) throw error;

  return calculateWorkload(data as WorkloadRow[], todayInIndia());
}

// What each person in reach did in a day or a week, and where their work stood at its end.
export async function getWorkloadActivity(period: Pick<WorkloadPeriod, 'from' | 'to'>) {
  const database = await createDatabaseClient();
  const { data, error } = await database.rpc('get_workload_activity', { p_from: period.from, p_to: period.to });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(toWorkloadActivity);
}

// Reports sent: all of them for those who receive them, else the ones you sent.
export async function listWorkloadReports() {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('workload_reports')
    .select('id, period, period_from, period_to, title, note, sent_by_name, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

export async function getWorkloadReport(reportId: string) {
  const database = await createDatabaseClient();
  const { data, error } = await database
    .from('workload_reports')
    .select('id, period, period_from, period_to, title, note, figures, sent_by_name, created_at')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const figures = Array.isArray(data.figures) ? (data.figures as Record<string, unknown>[]) : [];
  return { ...data, kind: data.period === 'week' ? ('week' as const) : ('day' as const), rows: figures.map(toWorkloadActivity) };
}

// The signed-in person's own workload, for their dashboard. Anyone can see their own.
export async function getMyWorkload() {
  const database = await createDatabaseClient();

  const { data, error } = await database.rpc('get_my_workload_rows');
  if (error) throw error;

  return calculateWorkload(data as WorkloadRow[], todayInIndia())[0] ?? null;
}
