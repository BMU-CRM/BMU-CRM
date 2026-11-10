import { ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { describeAuditEntry } from '@/lib/audit/describeAuditEntry';
import { formatDateTime } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { auditLogsPerPage, listAuditLogs } from '@/server/services/auditService';

export const metadata: Metadata = { title: 'Audit log' };

type AuditLogPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  await requirePagePermission(permissionKeys.auditView);

  const page = parsePage((await searchParams).page);
  const { logs, total } = await listAuditLogs({ page });

  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of who changed what. Entries cannot be edited or deleted." />
      <Panel flush>
        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries yet" description="Changes appear here as they happen." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className={tableStyles.secondaryText}>{formatDateTime(log.created_at)}</td>
                      <td>{log.actor_name}</td>
                      <td>{describeAuditEntry(log)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              perPage={auditLogsPerPage}
              total={total}
              hrefForPage={(target) => `/settings/audit-log?page=${target}`}
            />
          </>
        )}
      </Panel>
    </>
  );
}
