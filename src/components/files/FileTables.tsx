import { ExternalLink, FileText, Link2 } from 'lucide-react';
import Link from 'next/link';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import styles from '@/components/ui/DataTable.module.css';
import { deleteFileAction } from '@/server/actions/fileActions';
import { fileTypeOf, formatFileSize } from '@/lib/files/fileTypes';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import type { FileListItem, ShareListItem } from '@/server/services/fileService';
import tableStyles from './FileTables.module.css';

function typeLabel(file: { kind: string; name: string }) {
  return file.kind === 'link' ? 'Link' : (fileTypeOf(file.name)?.label ?? 'File');
}

export function FileNameCell({ id, name, kind }: { id: string; name: string; kind: string }) {
  const Icon = kind === 'link' ? Link2 : FileText;

  return (
    <span className={tableStyles.name}>
      <Icon size={16} aria-hidden="true" className={tableStyles.icon} />
      <Link href={`/files/${id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
        {name}
      </Link>
    </span>
  );
}

// Owners can delete their own files; people who see every file can delete any. The
// database checks again, and keeps receipts and bills on money records.
export function FileTable({ files, myEmployeeId, canDeleteAny = false }: { files: FileListItem[]; myEmployeeId?: string; canDeleteAny?: boolean }) {
  const showActions = canDeleteAny || files.some((file) => file.owner_id === myEmployeeId);
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Owner</th>
            <th scope="col">Related to</th>
            <th scope="col">Type</th>
            <th scope="col" className={styles.numeric}>
              Size
            </th>
            <th scope="col">Added</th>
            {showActions && <th scope="col" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td>
                <FileNameCell id={file.id} name={file.name} kind={file.kind} />
              </td>
              <td>
                {file.owner?.full_name ?? '—'}
                {file.department && <p className={styles.secondaryText}>{file.department.name}</p>}
              </td>
              <td className={styles.secondaryText}>{file.task?.title ?? file.project?.name ?? '—'}</td>
              <td>{typeLabel(file)}</td>
              <td className={styles.numeric}>{file.kind === 'link' ? '—' : formatFileSize(file.size_bytes)}</td>
              <td>{formatDate(file.created_at)}</td>
              {showActions && (
                <td>
                  {(canDeleteAny || file.owner_id === myEmployeeId) && (
                    <div className={styles.rowActions}>
                      <ConfirmActionButton
                        label="Delete"
                        title={`Delete ${file.name}?`}
                        description={
                          file.kind === 'link'
                            ? 'The link is removed for everyone it was sent to. This cannot be undone.'
                            : 'The file and every version of it are removed for everyone it was sent to. This cannot be undone. Archive it instead to keep it out of the way.'
                        }
                        confirmLabel="Delete file"
                        variant="danger"
                        action={deleteFileAction.bind(null, file.id, undefined)}
                      />
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ShareTable({ shares, direction }: { shares: ShareListItem[]; direction: 'received' | 'sent' }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">{direction === 'received' ? 'From' : 'Sent to'}</th>
            <th scope="col">Note</th>
            <th scope="col">{direction === 'received' ? 'Received' : 'Sent'}</th>
            <th scope="col">Access until</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((share) => (
            <tr key={share.id}>
              <td>
                <FileNameCell id={share.file.id} name={share.file.name} kind={share.file.kind} />
              </td>
              <td>
                {direction === 'received' ? (
                  <>
                    {share.sender_name ?? 'Former employee'}
                    <p className={styles.secondaryText}>
                      {[share.sender_designation, share.sender_department].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </>
                ) : (
                  (share.recipient?.full_name ?? share.recipientDepartment?.name ?? '—')
                )}
              </td>
              <td className={styles.secondaryText}>{share.note ?? '—'}</td>
              <td>{formatDateTime(share.created_at)}</td>
              <td>{share.expires_at ? formatDate(share.expires_at) : 'No limit'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExternalLinkButton({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={tableStyles.external}>
      <ExternalLink size={16} aria-hidden="true" />
      Open link
    </a>
  );
}
