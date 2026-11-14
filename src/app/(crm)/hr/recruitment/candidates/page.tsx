import { Plus, UserSearch } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { CandidateStageBadge, RecruitmentTabs } from '@/components/recruitment/RecruitmentTabs';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatRupees } from '@/lib/finance/moneyFormat';
import { formatDate } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { candidateStageLabels, candidateStages } from '@/lib/validation/recruitmentSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { candidatesPerPage, listCandidates, listOpenings, type CandidateFilters } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Candidates' };

const sorts = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name' },
  { value: 'stage-changed', label: 'Recently moved' },
];

type CandidatesPageProps = {
  searchParams: Promise<{ search?: string; stage?: string; openingId?: string; sort?: string; page?: string }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const params = await searchParams;
  const filters: CandidateFilters = {
    search: params.search,
    stage: candidateStages.find((stage) => stage === params.stage),
    openingId: parseId(params.openingId),
    sort: (sorts.find((sort) => sort.value === params.sort)?.value ?? 'newest') as CandidateFilters['sort'],
    page: parsePage(params.page),
  };
  const [{ candidates, total }, openings] = await Promise.all([listCandidates(filters), listOpenings()]);
  const isFiltered = Boolean(filters.search || filters.stage || filters.openingId);

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, page: String(target) })) if (value) query.set(key, value);
    return `/hr/recruitment/candidates?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Recruitment"
        description={`${total} ${total === 1 ? 'candidate' : 'candidates'}`}
        actions={
          <ButtonLink href="/hr/recruitment/candidates/new" variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add candidate
          </ButtonLink>
        }
      />
      <RecruitmentTabs current="candidates" />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Name, email or position" defaultValue={params.search} />
        <SelectField label="Stage" name="stage" options={candidateStages.map((stage) => ({ value: stage, label: candidateStageLabels[stage] }))} placeholder="Any stage" defaultValue={filters.stage} />
        <SelectField label="Job opening" name="openingId" options={openings.map((opening) => ({ value: opening.id, label: opening.title }))} placeholder="All openings" defaultValue={filters.openingId} />
        <SelectField label="Sort by" name="sort" options={sorts} defaultValue={filters.sort} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/hr/recruitment/candidates" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {candidates.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title={isFiltered ? 'No matching candidates' : 'No candidates yet'}
            description={isFiltered ? 'Try different filters.' : 'Add candidates as applications come in.'}
          />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Position</th>
                    <th scope="col">Stage</th>
                    <th scope="col" className={tableStyles.numeric}>Expected</th>
                    <th scope="col">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id}>
                      <td>
                        <Link href={`/hr/recruitment/candidates/${candidate.id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {candidate.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>{[candidate.email, candidate.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
                      </td>
                      <td>
                        <p>{candidate.position ?? candidate.opening?.title ?? '—'}</p>
                        <p className={tableStyles.secondaryText}>
                          {[candidate.department?.name, candidate.experience_years !== null ? `${candidate.experience_years} yrs` : null].filter(Boolean).join(' · ')}
                        </p>
                      </td>
                      <td>
                        <CandidateStageBadge stage={candidate.stage} />
                      </td>
                      <td className={tableStyles.numeric}>{candidate.expected_salary !== null ? formatRupees(candidate.expected_salary) : '—'}</td>
                      <td>
                        <p>{formatDate(candidate.created_at.slice(0, 10))}</p>
                        {candidate.source && <p className={tableStyles.secondaryText}>{candidate.source}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={filters.page} perPage={candidatesPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
