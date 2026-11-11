import { FileText } from 'lucide-react';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { documentTypeLabels, type EmployeeDocumentType } from '@/lib/employees/employeeRecordLabels';
import { formatFileSize } from '@/lib/files/fileTypes';
import { formatDate } from '@/lib/formatDate';
import { removeEmployeeDocumentAction } from '@/server/actions/employeeActions';
import { EmployeeDocumentUploader } from './EmployeeDocumentUploader';

type EmployeeDocument = {
  id: string;
  name: string;
  size_bytes: number | null;
  document_type: EmployeeDocumentType | null;
  created_at: string;
  owner_id: string | null;
  owner: { full_name: string } | null;
};

type EmployeeDocumentsPanelProps = {
  employeeId: string;
  documents: EmployeeDocument[];
  canAdd: boolean;
  viewerId: string;
};

export function EmployeeDocumentsPanel({ employeeId, documents, canAdd, viewerId }: EmployeeDocumentsPanelProps) {
  return (
    <Panel title="Documents" description="Seen only by this person, whoever added the document, and HR. Documents cannot be shared." flush>
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description={canAdd ? 'Add Aadhaar, PAN, certificates, letters and more below.' : 'Documents HR adds appear here.'} />
      ) : (
        <div className={tableStyles.scroller}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Type</th>
                <th scope="col">Added</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <a href={`/files/${document.id}/download?mode=view`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`} target="_blank" rel="noreferrer">
                      {document.name}
                    </a>
                    <p className={tableStyles.secondaryText}>{formatFileSize(document.size_bytes)}</p>
                  </td>
                  <td>
                    <StatusBadge>{document.document_type ? documentTypeLabels[document.document_type] : 'Other'}</StatusBadge>
                  </td>
                  <td>
                    <p>{formatDate(document.created_at.slice(0, 10))}</p>
                    <p className={tableStyles.secondaryText}>by {document.owner?.full_name ?? 'someone who has left'}</p>
                  </td>
                  <td>
                    <div className={tableStyles.rowActions}>
                      <a href={`/files/${document.id}/download`} className={tableStyles.primaryLink}>
                        Download
                      </a>
                      {document.owner_id === viewerId && (
                        <ConfirmActionButton
                          label="Remove"
                          title={`Remove ${document.name}?`}
                          description="It is archived and no longer shown on this record."
                          confirmLabel="Remove"
                          variant="secondary"
                          action={removeEmployeeDocumentAction.bind(null, employeeId, document.id)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canAdd && <EmployeeDocumentUploader employeeId={employeeId} />}
    </Panel>
  );
}
