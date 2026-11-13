import { ClipboardCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { RecruitmentTabs } from '@/components/recruitment/RecruitmentTabs';
import { ActionButton } from '@/components/ui/ActionButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { cleanSearchTerm } from '@/lib/cleanSearchTerm';
import { formatDate } from '@/lib/formatDate';
import { parsePage } from '@/lib/parseListParams';
import { setOnboardingTaskAction } from '@/server/actions/recruitmentActions';
import { requirePagePermission } from '@/server/services/accessService';
import { listOnboarding } from '@/server/services/recruitmentService';

export const metadata: Metadata = { title: 'Onboarding' };

const perPage = 10;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ show?: string; search?: string; page?: string }> }) {
  await requirePagePermission(permissionKeys.recruitmentManage);
  const params = await searchParams;
  const showAll = params.show === 'all';
  const page = parsePage(params.page);
  const term = params.search ? cleanSearchTerm(params.search).toLowerCase() : '';
  const people = (await listOnboarding({ openOnly: !showAll })).filter((person) => !term || person.name.toLowerCase().includes(term));

  return (
    <>
      <PageHeader title="Recruitment" description="Checklists for new joiners, from the items in HR settings." />
      <RecruitmentTabs current="onboarding" />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Name" defaultValue={params.search} />
        <SelectField label="Show" name="show" options={[{ value: 'all', label: 'Everyone, including finished' }]} placeholder="Still in progress" defaultValue={params.show} />
        <div className={filterStyles.actions}>
          <Button type="submit">Apply</Button>
          <ButtonLink href="/hr/recruitment/onboarding" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      {people.length === 0 ? (
        <Panel>
          <EmptyState icon={ClipboardCheck} title="Nobody is onboarding" description="Converting a candidate to an employee starts their checklist." />
        </Panel>
      ) : (
        <div className={layout.stack}>
          {people.slice((page - 1) * perPage, page * perPage).map((person) => {
            const done = person.tasks.filter((task) => task.done_at).length;
            return (
              <Panel
                key={person.id}
                title={person.name}
                description={person.joiningDate ? `Joins ${formatDate(person.joiningDate)}` : undefined}
                action={
                  <Link href={`/people/employees/${person.id}`} className={layout.link}>
                    Employee record
                  </Link>
                }
                flush
              >
                <div className={layout.sectionForm}>
                  <ProgressBar value={Math.round((done / person.tasks.length) * 100)} label={`${done} of ${person.tasks.length} done`} />
                </div>
                <ul className={layout.list}>
                  {person.tasks.map((task) => (
                    <li key={task.id} className={layout.row}>
                      <span className={layout.rowMain}>
                        {task.item_name} {task.done_at && <StatusBadge tone="good">Done</StatusBadge>}
                      </span>
                      <ActionButton
                        label={task.done_at ? 'Undo' : 'Mark done'}
                        variant={task.done_at ? 'ghost' : 'secondary'}
                        action={setOnboardingTaskAction.bind(null, task.id, !task.done_at)}
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
          <PaginationBar
            page={page}
            perPage={perPage}
            total={people.length}
            hrefForPage={(target) => `/hr/recruitment/onboarding?${new URLSearchParams({ ...(showAll ? { show: 'all' } : {}), page: String(target) })}`}
          />
        </div>
      )}
    </>
  );
}
