import { FolderOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { DriveLinkForm } from '@/components/files/FileForms';
import { FileSectionTabs } from '@/components/files/FileSectionTabs';
import { FileTable, ShareTable } from '@/components/files/FileTables';
import { FileUploader } from '@/components/files/FileUploader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parsePage } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { fileSections, filesPerPage, listFiles } from '@/server/services/fileService';

export const metadata: Metadata = { title: 'Files' };

const emptyMessages = {
  mine: 'Files you upload appear here.',
  received: 'Files people send you appear here.',
  sent: 'Files you send to others appear here.',
  department: 'Files sent to your whole department appear here.',
  client: 'Files linked to clients you can see appear here.',
  project: 'Files linked to your projects appear here.',
  links: 'Google Drive and other links appear here.',
  archived: 'Files you archive appear here.',
};

type FilesPageProps = {
  searchParams: Promise<{ section?: string; search?: string; page?: string }>;
};

export default async function FilesPage({ searchParams }: FilesPageProps) {
  const access = await requirePagePermission(permissionKeys.filesUpload);
  const params = await searchParams;

  const section = fileSections.find((option) => option === params.section) ?? 'mine';
  const page = parsePage(params.page);
  const result = await listFiles(access, { section, search: params.search, page });
  const rows = result.kind === 'files' ? result.files.length : result.shares.length;

  function hrefForPage(target: number) {
    const query = new URLSearchParams({ section, page: String(target) });
    if (params.search) query.set('search', params.search);
    return `/files?${query.toString()}`;
  }

  return (
    <>
      <PageHeader title="Files" description="Upload, send and find files across the company." />
      <div className={layout.stack}>
        {(section === 'mine' || section === 'links') && (
          <div className={layout.columns}>
            {section === 'mine' && (
              <Panel title="Upload">
                <FileUploader />
              </Panel>
            )}
            <Panel title="Add a Drive link" description="Share a Google Drive or other cloud link without uploading the file. It is kept under Links.">
              <DriveLinkForm />
            </Panel>
          </div>
        )}
        <div>
          <FileSectionTabs current={section} />
          <form method="get" className={filterStyles.filters}>
            <input type="hidden" name="section" value={section} />
            <TextField label="Search" name="search" type="search" placeholder="File name" defaultValue={params.search} />
            <div className={filterStyles.actions}>
              <Button type="submit">Search</Button>
              <ButtonLink href={`/files?section=${section}`} variant="ghost">
                Clear
              </ButtonLink>
            </div>
          </form>
          <Panel flush>
            {rows === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title={params.search ? 'No matching files' : 'Nothing here yet'}
                description={params.search ? 'Try a different name.' : emptyMessages[section]}
              />
            ) : (
              <>
                {result.kind === 'files' ? (
                  <FileTable files={result.files} />
                ) : (
                  <ShareTable shares={result.shares} direction={section === 'sent' ? 'sent' : 'received'} />
                )}
                <PaginationBar page={page} perPage={filesPerPage} total={result.total} hrefForPage={hrefForPage} />
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
