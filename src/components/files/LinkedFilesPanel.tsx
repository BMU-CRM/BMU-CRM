import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { formatFileSize } from '@/lib/files/fileTypes';
import { formatDateTime } from '@/lib/formatDate';
import type { FileLinks } from '@/lib/validation/fileSchema';
import type { listLinkedFiles } from '@/server/services/fileService';
import { DriveLinkForm } from './FileForms';
import { FileNameCell } from './FileTables';
import { FileUploader } from './FileUploader';
import styles from './LinkedFilesPanel.module.css';

type LinkedFilesPanelProps = {
  title: string;
  files: Awaited<ReturnType<typeof listLinkedFiles>>;
  links: FileLinks;
  canUpload: boolean;
  // Links saved on the record itself, such as a task's reference links. Already checked
  // to be safe https:// addresses.
  referenceLinks?: string[];
  // Shown under the list, such as a button to send the files on.
  footer?: ReactNode;
};

function linkLabel(url: string) {
  const { hostname, pathname } = new URL(url);
  const host = hostname.replace(/^www\./, '');
  return pathname.length > 1 ? `${host}${pathname.length > 40 ? `${pathname.slice(0, 40)}…` : pathname}` : host;
}

// Attachments on a record such as a task, meeting or ticket. Uploading here links the file automatically.
export function LinkedFilesPanel({ title, files, links, canUpload, referenceLinks = [], footer }: LinkedFilesPanelProps) {
  const count = files.length + referenceLinks.length;
  return (
    <Panel title={title} description={`${count} ${count === 1 ? 'file' : 'files'}`} flush>
      {count === 0 ? (
        <p className={layout.emptyText}>No files yet.</p>
      ) : (
        <ul className={layout.list}>
          {files.map((file) => (
            <li key={file.id} className={layout.row}>
              <div className={layout.rowMain}>
                <FileNameCell id={file.id} name={file.name} kind={file.kind} />
                <p className={layout.muted}>
                  {file.owner?.full_name ?? 'Former employee'} · {formatDateTime(file.created_at)}
                  {file.kind === 'upload' ? ` · ${formatFileSize(file.size_bytes)}` : ''}
                </p>
              </div>
            </li>
          ))}
          {referenceLinks.map((url) => (
            <li key={url} className={layout.row}>
              <div className={layout.rowMain}>
                <a href={url} target="_blank" rel="noopener noreferrer" className={`${layout.link} ${styles.reference}`}>
                  <ExternalLink size={16} aria-hidden="true" />
                  {linkLabel(url)}
                </a>
                <p className={layout.muted}>Reference link, added with the task</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {footer && <div className={layout.sectionForm}>{footer}</div>}
      {canUpload && (
        <div className={layout.sectionForm}>
          <FileUploader links={links} compact />
          <details className={styles.linkForm}>
            <summary>Add a Google Drive or other link instead</summary>
            <DriveLinkForm links={links} />
          </details>
        </div>
      )}
    </Panel>
  );
}
