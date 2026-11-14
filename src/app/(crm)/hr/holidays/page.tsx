import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { HolidayMonth, HolidayYear, monthTitle } from '@/components/hr/HolidayCalendar';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageTabs } from '@/components/ui/PageTabs';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { formatDate, todayInIndia } from '@/lib/formatDate';
import { holidayKindLabels, holidayKinds } from '@/lib/validation/hrSchema';
import { removeHolidayAction } from '@/server/actions/hrActions';
import { requirePagePermission } from '@/server/services/accessService';
import { getCompanySettings, listHolidaysBetween } from '@/server/services/hrService';

export const metadata: Metadata = { title: 'Holidays' };

function shiftMonth(month: string, by: number) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
}

type HolidaysPageProps = {
  searchParams: Promise<{ view?: string; month?: string; year?: string; kind?: string; search?: string; sort?: string }>;
};

export default async function HolidaysPage({ searchParams }: HolidaysPageProps) {
  await requirePagePermission(permissionKeys.hrManage);
  const params = await searchParams;
  const today = todayInIndia();

  const view = params.view === 'year' ? 'year' : 'month';
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : Number(month.slice(0, 4));
  const kind = holidayKinds.find((item) => item === params.kind);
  const sort = params.sort === 'date-desc' ? 'date-desc' : 'date-asc';

  const [from, to] = view === 'year' ? [`${year}-01-01`, `${year}-12-31`] : [`${month}-01`, monthEnd(month)];
  const [settings, calendarHolidays, listed] = await Promise.all([
    getCompanySettings(),
    listHolidaysBetween(from, to),
    listHolidaysBetween(from, to, { kind, search: params.search }),
  ]);
  const rows = sort === 'date-desc' ? [...listed].reverse() : listed;
  const isFiltered = Boolean(kind || params.search);

  const periodLink = (target: string) => (view === 'year' ? `/hr/holidays?view=year&year=${target}` : `/hr/holidays?month=${target}`);
  const previous = view === 'year' ? String(year - 1) : shiftMonth(month, -1);
  const next = view === 'year' ? String(year + 1) : shiftMonth(month, 1);

  return (
    <>
      <PageHeader
        title="Holidays"
        description="Public and company holidays. They are not counted as working days or leave."
        actions={
          <ButtonLink href={`/hr/holidays/new${view === 'month' ? `?date=${month}-01` : ''}`} variant="primary">
            <Plus size={16} aria-hidden="true" />
            Add holiday
          </ButtonLink>
        }
      />
      <div className={layout.stack}>
        <PageTabs
          label="Calendar view"
          tabs={[
            { href: `/hr/holidays?month=${month}`, label: 'Month', current: view === 'month' },
            { href: `/hr/holidays?view=year&year=${year}`, label: 'Year', current: view === 'year' },
          ]}
        />
        <Panel
          title={view === 'year' ? String(year) : monthTitle(month)}
          action={
            <div className={layout.rowActions}>
              <ButtonLink href={periodLink(previous)} variant="ghost" aria-label={view === 'year' ? 'Previous year' : 'Previous month'}>
                <ChevronLeft size={16} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href={view === 'year' ? `/hr/holidays?view=year&year=${today.slice(0, 4)}` : `/hr/holidays?month=${today.slice(0, 7)}`} variant="ghost">
                Today
              </ButtonLink>
              <ButtonLink href={periodLink(next)} variant="ghost" aria-label={view === 'year' ? 'Next year' : 'Next month'}>
                <ChevronRight size={16} aria-hidden="true" />
              </ButtonLink>
            </div>
          }
          flush
        >
          {view === 'year' ? (
            <HolidayYear year={year} holidays={calendarHolidays} today={today} />
          ) : (
            <HolidayMonth month={month} holidays={calendarHolidays} workingDays={settings.working_days} today={today} canEdit />
          )}
        </Panel>

        <form method="get" className={filterStyles.filters}>
          <input type="hidden" name="view" value={view} />
          {view === 'year' ? <input type="hidden" name="year" value={year} /> : <input type="hidden" name="month" value={month} />}
          <TextField label="Search" name="search" type="search" placeholder="Holiday name" defaultValue={params.search} />
          <SelectField
            label="Type"
            name="kind"
            options={holidayKinds.map((item) => ({ value: item, label: holidayKindLabels[item] }))}
            placeholder="All holidays"
            defaultValue={kind}
          />
          <SelectField
            label="Sort by"
            name="sort"
            options={[
              { value: 'date-asc', label: 'Date, earliest first' },
              { value: 'date-desc', label: 'Date, latest first' },
            ]}
            defaultValue={sort}
          />
          <div className={filterStyles.actions}>
            <Button type="submit">Apply</Button>
            <ButtonLink href={view === 'year' ? `/hr/holidays?view=year&year=${year}` : `/hr/holidays?month=${month}`} variant="ghost">
              Clear
            </ButtonLink>
          </div>
        </form>

        <Panel title={`Holidays in ${view === 'year' ? year : monthTitle(month)}`} description={`${rows.length} ${rows.length === 1 ? 'holiday' : 'holidays'}`} flush>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={isFiltered ? 'No matching holidays' : 'No holidays yet'}
              description={isFiltered ? 'Try different filters.' : 'Add the public and company holidays for this period.'}
            />
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Holiday</th>
                    <th scope="col">Type</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((holiday) => (
                    <tr key={holiday.id}>
                      <td>{formatDate(holiday.holiday_date)}</td>
                      <td>
                        <Link href={`/hr/holidays/${holiday.id}/edit`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {holiday.name}
                        </Link>
                        {holiday.description && <p className={tableStyles.secondaryText}>{holiday.description}</p>}
                      </td>
                      <td>
                        <StatusBadge tone={holiday.kind === 'company' ? 'warning' : 'neutral'}>
                          {holidayKindLabels[holiday.kind as 'public' | 'company']}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className={tableStyles.rowActions}>
                          <ButtonLink href={`/hr/holidays/${holiday.id}/edit`} variant="ghost">
                            Edit
                          </ButtonLink>
                          <ConfirmActionButton
                            label="Remove"
                            title={`Remove ${holiday.name}?`}
                            description="The day becomes a normal working day again. Leave already booked is not recounted."
                            confirmLabel="Remove holiday"
                            action={removeHolidayAction.bind(null, holiday.id)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
