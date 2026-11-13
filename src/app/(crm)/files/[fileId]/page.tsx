import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { FileDetailsForm, FileShareForm } from '@/components/files/FileForms';
import { FilePreview } from '@/components/files/FilePreview';
import { ExternalLinkButton } from '@/components/files/FileTables';
import { FileUploader } from '@/components/files/FileUploader';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { TextAreaField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { fileTypeOf, formatFileSize } from '@/lib/files/fileTypes';
import { formatDate, formatDateTime } from '@/lib/formatDate';
import { parseId } from '@/lib/parseListParams';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { addFileCommentAction, deleteFileAction, removeShareAction, setFileArchivedAction } from '@/server/actions/fileActions';
import { requirePagePermission } from '@/server/services/accessService';
import { listEmployeeOptions } from '@/server/services/employeeService';
import { getFile, loadFilePanels } from '@/server/services/fileService';
import { listDepartments } from '@/server/services/organisationService';
import styles from './FilePage.module.css';

export const metadata: Metadata = { title: 'File' };

type FilePageProps = {
  params: Promise<{ fileId: string }>;
};

export default async function FilePage({ params }: FilePageProps) {
  const access = await requirePagePermission(permissionKeys.filesUpload);
  const fileId = parseId((await params).fileId);
  if (!fileId) notFound();

  const file = await getFile(fileId);
  if (!file) notFound();

  const isOwner = file.owner_id === access.employee.id;
  const [panels, employees, departments] = await Promise.all([
    loadFilePanels(file.id, isOwner),
    isOwner ? listEmployeeOptions() : Promise.resolve([]),
    isOwner ? listDepartments() : Promise.resolve([]),
  ]);

  const link = safeExternalUrl(file.external_url);
  const isUpload = file.kind === 'upload';

  return (
    <>
      <PageHeader
        title={file.name}
        description={isUpload ? `${fileTypeOf(file.name)?.label ?? 'File'} · ${formatFileSize(file.size_bytes)} · Version ${file.current_version}` : 'Link'}
        actions={
          <>
            {isUpload && (
              <a href={`/files/${file.id}/download`} className={styles.download}>
                <Download size={16} aria-hidden="true" />
                Download
              </a>
            )}
            {link && <ExternalLinkButton url={link} />}
            {isOwner &&
              (file.is_archived ? (
                <ActionButton label="Restore" variant="secondary" action={setFileArchivedAction.bind(null, file.id, false)} />
              ) : (
                <ConfirmActionButton
                  label="Archive"
                  title="Archive this file?"
                  description="It moves to Archived. People you sent it to keep their access, and you can restore it at any time."
                  confirmLabel="Archive"
                  variant="secondary"
                  action={setFileArchivedAction.bind(null, file.id, true)}
                />
              ))}
            {(isOwner || access.permissions[permissionKeys.filesView] === 'organisation') && (
              <ConfirmActionButton
                label="Delete"
                title={`Delete ${file.name}?`}
                description="It is removed for everyone it was sent to, with every version. This cannot be undone. Archive it instead to keep it out of the way."
                confirmLabel="Delete file"
                variant="danger"
                action={deleteFileAction.bind(null, file.id, '/files')}
              />
            )}
          </>
        }
      />

      <div className={layout.columns}>
        <div className={layout.stack}>
          {isUpload && (
            <Panel title="Preview">
              <FilePreview fileId={file.id} name={file.name} version={file.current_version} />
            </Panel>
          )}
          {isOwner && (
            <Panel title="Send to" description="Choose people or whole departments. They are notified straight away.">
              <FileShareForm
                fileId={file.id}
                employees={employees
                  .filter((person) => person.id !== access.employee.id)
                  .map((person) => ({ value: person.id, label: person.full_name }))}
                departments={departments.map((department) => ({ value: department.id, label: department.name }))}
              />
            </Panel>
          )}
          <Panel title="Comments" description={`${panels.comments.length} ${panels.comments.length === 1 ? 'comment' : 'comments'}`} flush>
            {panels.comments.length > 0 && (
              <ul className={layout.list}>
                {panels.comments.map((comment) => (
                  <li key={comment.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <p>
                        <span className={layout.rowTitle}>{comment.author?.full_name ?? 'Former employee'}</span>{' '}
                        <span className={layout.muted}>{formatDateTime(comment.created_at)}</span>
                      </p>
                      <p className={layout.text}>{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className={layout.sectionForm}>
              <InlineActionForm action={addFileCommentAction.bind(null, file.id)} submitLabel="Post comment">
                <TextAreaField label="Add a comment" name="body" rows={2} required />
              </InlineActionForm>
            </div>
          </Panel>
        </div>

        <div className={layout.stack}>
          <Panel title="Details">
            <dl className={layout.factsStacked}>
              <div>
                <dt>Uploaded by</dt>
                <dd>{file.owner?.full_name ?? 'Former employee'}</dd>
              </div>
              <div>
                <dt>Source department</dt>
                <dd>{file.department?.name ?? 'None'}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{formatDateTime(file.created_at)}</dd>
              </div>
              {file.client && (
                <div>
                  <dt>Client</dt>
                  <dd>{file.client.company_name}</dd>
                </div>
              )}
              {file.project && (
                <div>
                  <dt>Project</dt>
                  <dd>
                    <Link href={`/projects/${file.project.id}`} className={layout.link}>
                      {file.project.name}
                    </Link>
                  </dd>
                </div>
              )}
              {file.task && (
                <div>
                  <dt>Task</dt>
                  <dd>
                    <Link href={`/tasks/${file.task.id}`} className={layout.link}>
                      {file.task.title}
                    </Link>
                  </dd>
                </div>
              )}
              {file.description && !isOwner && (
                <div>
                  <dt>Description</dt>
                  <dd className={layout.text}>{file.description}</dd>
                </div>
              )}
              {file.is_archived && (
                <div>
                  <dd>
                    <StatusBadge>Archived</StatusBadge>
                  </dd>
                </div>
              )}
            </dl>
          </Panel>
          {isOwner && (
            <Panel title="Edit details">
              <FileDetailsForm fileId={file.id} name={file.name} description={file.description} />
            </Panel>
          )}
          {isUpload && (
            <Panel title="Versions" flush>
              <ul className={layout.list}>
                {panels.versions.map((version) => (
                  <li key={version.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <p className={layout.rowTitle}>Version {version.version}</p>
                      <p className={layout.muted}>
                        {version.uploader?.full_name ?? 'Former employee'} · {formatDateTime(version.uploaded_at as string)} ·{' '}
                        {formatFileSize(version.size_bytes)}
                      </p>
                    </div>
                    <a href={`/files/${file.id}/download?version=${version.version}`} className={layout.link}>
                      Download
                    </a>
                  </li>
                ))}
              </ul>
              {isOwner && (
                <div className={layout.sectionForm}>
                  <FileUploader versionOfFileId={file.id} compact />
                </div>
              )}
            </Panel>
          )}
          <Panel title="Shared with" flush>
            {panels.shares.length === 0 ? (
              <p className={layout.emptyText}>Not shared with anyone.</p>
            ) : (
              <ul className={layout.list}>
                {panels.shares.map((share) => (
                  <li key={share.id} className={layout.row}>
                    <div className={layout.rowMain}>
                      <p className={layout.rowTitle}>{share.recipient?.full_name ?? share.recipientDepartment?.name ?? 'Removed'}</p>
                      <p className={layout.muted}>
                        By {share.sender_name ?? 'Former employee'}
                        {share.sender_designation ? `, ${share.sender_designation}` : ''} · {formatDateTime(share.created_at)}
                        {share.expires_at ? ` · Until ${formatDate(share.expires_at)}` : ''}
                      </p>
                    </div>
                    {isOwner && <ActionButton label="Remove" action={removeShareAction.bind(null, file.id, share.id)} />}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {isOwner && (
            <Panel title="Access history" description="Who opened or downloaded this file." flush>
              {panels.accessLog.length === 0 ? (
                <p className={layout.emptyText}>Nobody has opened it yet.</p>
              ) : (
                <ul className={layout.list}>
                  {panels.accessLog.map((entry) => (
                    <li key={entry.id} className={layout.row}>
                      <div className={layout.rowMain}>
                        <p>
                          {entry.employee_name} {entry.action === 'view' ? 'viewed' : 'downloaded'} version {entry.version}
                        </p>
                        <p className={layout.muted}>{formatDateTime(entry.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
