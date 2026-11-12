import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { CandidateBoard } from '@/components/recruitment/CandidateBoard';
import { RecruitmentTabs } from '@/components/recruitment/RecruitmentTabs';
import { Button, ButtonLink } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTiles } from '@/components/ui/StatTiles';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { parseId } from '@/lib/parseListParams';
import { requirePagePermission } from '@/server/services/accessService';
import { listBoardCandidates, listOpenings } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Recruitment' };

export default async function RecruitmentBoardPage({ searchParams }: { searchParams: Promise<{ openingId?: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const openingId = parseId((await searchParams).openingId);
  const [candidates, openings] = await Promise.all([listBoardCandidates(openingId), listOpenings()]);
  const active = candidates.filter((candidate) => candidate.stage !== 'joined' && candidate.stage !== 'rejected');

  return (
    <>
      <PageHeader
        title="Recruitment"
        description="Candidates by stage. Joined and rejected candidates stay on the board for 60 days."
        actions={
          <ButtonLink href={`/hr/recruitment/candidates/new${openingId ? `?openingId=${openingId}` : ''}`} variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add candidate
          </ButtonLink>
        }
      />
      <RecruitmentTabs current="board" />
      <div className={layout.stack}>
        <StatTiles
          tiles={[
            { label: 'Open positions', value: openings.filter((opening) => opening.status === 'open').reduce((sum, opening) => sum + opening.positions, 0), href: '/hr/recruitment/openings' },
            { label: 'Candidates in progress', value: active.length },
            { label: 'Interviews to hold', value: candidates.filter((candidate) => candidate.stage === 'interview_scheduled').length, href: '/hr/recruitment/interviews' },
            { label: 'Offers out', value: candidates.filter((candidate) => candidate.stage === 'offer_released').length },
          ]}
        />
        <form method="get" className={filterStyles.filters}>
          <SelectField
            label="Job opening"
            name="openingId"
            options={openings.map((opening) => ({ value: opening.id, label: opening.title }))}
            placeholder="All openings"
            defaultValue={openingId}
          />
          <div className={filterStyles.actions}>
            <Button type="submit">Show</Button>
            <ButtonLink href="/hr/recruitment" variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>
        <CandidateBoard candidates={candidates} />
      </div>
    </>
  );
}
