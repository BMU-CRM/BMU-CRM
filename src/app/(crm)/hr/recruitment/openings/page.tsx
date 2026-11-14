import { Briefcase, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { RecruitmentTabs } from '@/components/recruitment/RecruitmentTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { parsePage } from '@/lib/parseListParams';
import { openingStatusLabels } from '@/lib/validation/recruitmentSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { listOpenings } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Job openings' };

const perPage = 25;

export default async function OpeningsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; sort?: string; page?: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const params = await searchParams;
  const status = Object.keys(openingStatusLabels).find((key) => key === params.status);
  const page = parsePage(params.page);
  const term = params.search ? cleanSearchTerm(params.search).toLowerCase() : '';
  const all = (await listOpenings({ status })).filter((opening) => !term || opening.title.toLowerCase().includes(term));
  const rows = params.sort === 'candidates' ? [...all].sort((a, b) => b.candidates - a.candidates) : all;

  return (
    <>
      <PageHeader
        title="Recruitment"
        description="Roles you are hiring for."
        actions={
          <ButtonLink href="/hr/recruitment/openings/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add opening
          </ButtonLink>
        }
      />
      <RecruitmentTabs current="openings" />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Job title" defaultValue={params.search} />
        <SelectField label="Status" name="status" options={Object.entries(openingStatusLabels).map(([value, label]) => ({ value, label }))} placeholder="Any status" defaultValue={status} />
        <SelectField
          label="Sort by"
          name="sort"
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'candidates', label: 'Most candidates' },
          ]}
          defaultValue={params.sort ?? 'newest'}
        />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/hr/recruitment/openings" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {rows.length === 0 ? (
          <EmptyState icon={Briefcase} title={term || status ? 'No matching openings' : 'No job openings yet'} description="Add a role you are hiring for." />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Opening</th>
                    <th scope="col">Status</th>
                    <th scope="col" className={tableStyles.numeric}>Positions</th>
                    <th scope="col" className={tableStyles.numeric}>Candidates</th>
                    <th scope="col" className={tableStyles.numeric}>Joined</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((page - 1) * perPage, page * perPage).map((opening) => (
                    <tr key={opening.id}>
                      <td>
                        <Link href={`/hr/recruitment/candidates?openingId=${opening.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {opening.title}
                        </Link>
                        <p className={tableStyles.secondaryText}>
                          {[opening.department?.name, opening.employment_type?.name, opening.location].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td>
                        <StatusBadge tone={opening.status === 'open' ? 'good' : opening.status === 'on_hold' ? 'warning' : 'neutral'}>
                          {openingStatusLabels[opening.status]}
                        </StatusBadge>
                      </td>
                      <td className={tableStyles.numeric}>{opening.positions}</td>
                      <td className={tableStyles.numeric}>{opening.candidates}</td>
                      <td className={tableStyles.numeric}>{opening.joined}</td>
                      <td>
                        <div className={tableStyles.rowActions}>
                          <ButtonLink href={`/hr/recruitment/openings/${opening.id}/edit`} variant="ghost">
                            Edit
                          </ButtonLink>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              perPage={perPage}
              total={rows.length}
              hrefForPage={(target) => `/hr/recruitment/openings?${new URLSearchParams({ ...(params.search ? { search: params.search } : {}), ...(status ? { status } : {}), page: String(target) })}`}
            />
          </>
        )}
      </Panel>
    </>
  );
}
