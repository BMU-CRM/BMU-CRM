import { ChartColumn, Plane } from 'lucide-react';
import type { Metadata } from 'next';
import { AppLink as Link } from '@/components/ui/AppLink';
import { notFound } from 'next/navigation';
import { LeaveDecisionButtons } from '@/components/hr/LeaveDecisionButtons';
import { LeaveStatusBadge } from '@/components/hr/LeaveStatusBadge';
import { ButtonLink } from '@/components/ui/Button';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/FormFields';
import filterStyles from '@/components/ui/ListFilters.module.css';
import { PageHeader } from '@/components/ui/PageHeader';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { isCalendarDate } from '@/lib/calendar/calendarRange';
import { formatDate } from '@/lib/formatDate';
import { parseId, parsePage } from '@/lib/parseListParams';
import { leaveListSorts, leaveListStatuses } from '@/lib/validation/hrSchema';
import { requirePagePermission } from '@/server/services/accessService';
import { leaveRequestsPerPage, listLeaveRequests, listLeaveTypes } from '@/server/services/hrService';
import { listDepartments } from '@/server/services/organisationService';

export const metadata: Metadata = { title: 'Leave requests' };

const statusOptions = [
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const sortOptions = [
  { value: 'start-desc', label: 'Latest leave first' },
  { value: 'start-asc', label: 'Earliest leave first' },
  { value: 'requested-desc', label: 'Newest requests first' },
  { value: 'days-desc', label: 'Longest first' },
];

type HrLeavePageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    leaveTypeId?: string;
    departmentId?: string;
    from?: string;
    to?: string;
    sort?: string;
    page?: string;
  }>;
};

// Everyone's leave, for HR: search, filter, and approve or reject from one place.
export default async function HrLeavePage({ searchParams }: HrLeavePageProps) {
  const access = await requirePagePermission(permissionKeys.leaveApprove);
  if (access.permissions[permissionKeys.leaveApprove] !== 'organisation') notFound();

  const params = await searchParams;
  // Waiting requests first by default, as that is what HR acts on.
  const status = params.status === 'all' ? undefined : (leaveListStatuses.find((item) => item === params.status) ?? (params.status === undefined ? 'pending' : undefined));
  const sort = leaveListSorts.find((item) => item === params.sort) ?? (status === 'pending' ? 'start-asc' : 'start-desc');
  const filters = {
    search: params.search,
    status,
    leaveTypeId: parseId(params.leaveTypeId),
    departmentId: parseId(params.departmentId),
    from: isCalendarDate(params.from) ? params.from : undefined,
    to: isCalendarDate(params.to) ? params.to : undefined,
    sort,
    page: parsePage(params.page),
  };

  const [{ requests, total }, leaveTypes, departments] = await Promise.all([listLeaveRequests(filters), listLeaveTypes(), listDepartments()]);
  const canSeeReport = access.permissions[permissionKeys.hrManage] !== undefined;

  function hrefForPage(target: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, status: params.status ?? 'pending', page: String(target) })) {
      if (value) query.set(key, value);
    }
    return `/hr/leave?${query.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Leave requests"
        description={`${total} ${total === 1 ? 'request' : 'requests'}${status === 'pending' ? ' waiting for approval' : ''}`}
        actions={
          canSeeReport && (
            <ButtonLink href="/hr/leave/utilisation">
              <ChartColumn size={16} aria-hidden="true" />
              Leave report
            </ButtonLink>
          )
        }
      />
      <form method="get" className={filterStyles.filters}>
        <TextField label="Search" name="search" type="search" placeholder="Employee name" defaultValue={params.search} />
        <SelectField label="Status" name="status" options={[{ value: 'all', label: 'Any status' }, ...statusOptions]} defaultValue={params.status ?? 'pending'} />
        <SelectField
          label="Leave type"
          name="leaveTypeId"
          options={leaveTypes.map((type) => ({ value: type.id, label: type.name }))}
          placeholder="All types"
          defaultValue={filters.leaveTypeId}
        />
        <SelectField
          label="Department"
          name="departmentId"
          options={departments.map((department) => ({ value: department.id, label: department.name }))}
          placeholder="All departments"
          defaultValue={filters.departmentId}
        />
        <TextField label="From" name="from" type="date" defaultValue={filters.from} />
        <TextField label="To" name="to" type="date" defaultValue={filters.to} />
        <SelectField label="Sort by" name="sort" options={sortOptions} defaultValue={sort} />
        <div className={filterStyles.actions}>
          <ButtonLink href="/hr/leave" variant="ghost">
            Clear
          </ButtonLink>
        </div>
      </form>
      <Panel flush>
        {requests.length === 0 ? (
          <EmptyState
            icon={Plane}
            title={status === 'pending' && !params.search ? 'Nothing waiting' : 'No matching requests'}
            description={status === 'pending' && !params.search ? 'New leave requests appear here.' : 'Try different filters.'}
          />
        ) : (
          <>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Employee</th>
                    <th scope="col">Leave</th>
                    <th scope="col">Status</th>
                    <th scope="col" aria-label="Decision" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>
                        <Link href={`/people/employees/${request.employee_id}`} className={`${tableStyles.primaryText} ${tableStyles.primaryLink}`}>
                          {request.employee?.full_name}
                        </Link>
                        <p className={tableStyles.secondaryText}>{request.employee?.department?.name ?? 'No department'}</p>
                      </td>
                      <td>
                        <p>
                          {request.type?.name} · {request.is_half_day ? 'half day' : `${request.days} ${Number(request.days) === 1 ? 'day' : 'days'}`}
                        </p>
                        <p className={tableStyles.secondaryText}>
                          {formatDate(request.start_date)}
                          {request.end_date !== request.start_date ? ` to ${formatDate(request.end_date)}` : ''} · {request.reason}
                        </p>
                        {request.attachment && (
                          <Link href={`/files/${request.attachment.id}`} className={tableStyles.primaryLink}>
                            {request.attachment.name}
                          </Link>
                        )}
                      </td>
                      <td>
                        <LeaveStatusBadge status={request.status} />
                        {request.decider && request.status !== 'pending' && (
                          <p className={tableStyles.secondaryText}>
                            by {request.decider.full_name}
                            {request.decision_note ? `: “${request.decision_note}”` : ''}
                          </p>
                        )}
                      </td>
                      <td>
                        {request.status === 'pending' && request.employee_id !== access.employee.id && (
                          <div className={tableStyles.rowActions}>
                            <LeaveDecisionButtons requestId={request.id} employeeName={request.employee?.full_name ?? 'this person'} />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={filters.page} perPage={leaveRequestsPerPage} total={total} hrefForPage={hrefForPage} />
          </>
        )}
      </Panel>
    </>
  );
}
