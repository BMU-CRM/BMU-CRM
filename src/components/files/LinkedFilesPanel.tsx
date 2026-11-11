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
};

// Attachments on a record such as a task, meeting or ticket. Uploading here links the file automatically.
export function LinkedFilesPanel({ title, files, links, canUpload }: LinkedFilesPanelProps) {
  return (
    <Panel title={title} description={`${files.length} ${files.length === 1 ? 'file' : 'files'}`} flush>
      {files.length === 0 ? (
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
        </ul>
      )}
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
