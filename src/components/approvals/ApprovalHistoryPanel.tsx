import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatDateTime } from '@/lib/formatDate';
import { approvalDecisionLabels } from '@/lib/validation/reimbursementSchema';
import { getApprovalHistory, type ApprovalItemType } from '@/server/services/reimbursementService';

// Who decided what on an item, and when, oldest first.
export async function ApprovalHistoryPanel({ type, id }: { type: ApprovalItemType; id: string }) {
  const history = await getApprovalHistory(type, id);
  return (
    <Panel title="Approval history" flush>
      {history.length === 0 ? (
        <p className={layout.emptyText}>No decisions yet.</p>
      ) : (
        <ul className={layout.list}>
          {history.map((entry, index) => (
            <li key={`${entry.created_at}-${index}`} className={layout.row}>
              <div className={layout.rowMain}>
                <p>
                  <span className={layout.rowTitle}>{approvalDecisionLabels[entry.decision] ?? entry.decision}</span>{' '}
                  <span className={layout.muted}>
                    by {entry.decided_by_name}, {formatDateTime(entry.created_at)}
                  </span>
                </p>
                {entry.comment && <p className={layout.muted}>{entry.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
