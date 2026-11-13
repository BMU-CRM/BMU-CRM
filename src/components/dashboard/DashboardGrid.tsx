import { Suspense, type ReactNode } from 'react';
import { LoadingPanel } from '@/components/ui/LoadingPanel';
import {
  buildDashboard,
  type DashboardWidget,
  type DashboardWidgetKey,
} from '@/lib/access/dashboardWidgetRegistry';
import type { CurrentAccess } from '@/server/services/accessService';
import { ClientProjectStatsWidget } from './ClientProjectStatsWidget';
import { DepartmentHeadcountWidget } from './DepartmentHeadcountWidget';
import { DocumentSignatureWidget } from './DocumentSignatureWidget';
import { AwaitingQuotationsWidget, FinanceStatsWidget, OverdueInvoicesWidget } from './FinanceWidgets';
import { FollowUpsWidget } from './FollowUpsWidget';
import { AttendanceTodayWidget, LeaveApprovalsWidget, LeaveBalanceWidget } from './HrWidgets';
import { UpcomingMeetingsWidget } from './MeetingWidgets';
import { TicketsToHandleWidget } from './TicketWidgets';
import { MyProfileWidget } from './MyProfileWidget';
import { MyTasksWidget } from './MyTasksWidget';
import { MyWorkloadWidget } from './MyWorkloadWidget';
import { MyTeamWidget } from './MyTeamWidget';
import { OrganisationStatsWidget } from './OrganisationStatsWidget';
import { RecentActivityWidget } from './RecentActivityWidget';
import { TaskStatsWidget } from './TaskStatsWidget';
import { TeamWorkloadWidget } from './TeamWorkloadWidget';
import styles from './DashboardGrid.module.css';

const widgetComponents: Record<DashboardWidgetKey, (access: CurrentAccess) => ReactNode> = {
  organisationStats: (access) => <OrganisationStatsWidget access={access} />,
  clientProjectStats: (access) => <ClientProjectStatsWidget access={access} />,
  taskStats: (access) => <TaskStatsWidget access={access} />,
  myTasks: (access) => <MyTasksWidget access={access} />,
  teamWorkload: () => <TeamWorkloadWidget />,
  followUps: () => <FollowUpsWidget />,
  departmentHeadcount: (access) => <DepartmentHeadcountWidget access={access} />,
  myProfile: (access) => <MyProfileWidget access={access} />,
  myTeam: () => <MyTeamWidget />,
  recentActivity: () => <RecentActivityWidget />,
  attendanceToday: (access) => <AttendanceTodayWidget access={access} />,
  leaveBalance: () => <LeaveBalanceWidget />,
  leaveApprovals: (access) => <LeaveApprovalsWidget access={access} />,
  upcomingMeetings: (access) => <UpcomingMeetingsWidget access={access} />,
  ticketsToHandle: (access) => <TicketsToHandleWidget access={access} />,
  financeStats: () => <FinanceStatsWidget />,
  overdueInvoices: () => <OverdueInvoicesWidget />,
  awaitingQuotations: () => <AwaitingQuotationsWidget />,
  myWorkload: () => <MyWorkloadWidget />,
  documentSignature: (access) => <DocumentSignatureWidget access={access} />,
};

type WidgetStackProps = {
  widgets: DashboardWidget[];
  access: CurrentAccess;
};

function WidgetStack({ widgets, access }: WidgetStackProps) {
  return widgets.map((widget) => (
    <Suspense key={widget.key} fallback={<LoadingPanel height={160} />}>
      {widgetComponents[widget.key](access)}
    </Suspense>
  ));
}

export function DashboardGrid({ access }: { access: CurrentAccess }) {
  const widgets = buildDashboard(access.permissions);
  const full = widgets.filter((widget) => widget.size === 'full');
  const main = widgets.filter((widget) => widget.size === 'main');
  const side = widgets.filter((widget) => widget.size === 'side');

  return (
    <div className={styles.dashboard}>
      <WidgetStack widgets={full} access={access} />
      <div className={styles.columns} data-single={main.length === 0}>
        {main.length > 0 && (
          <div className={styles.column}>
            <WidgetStack widgets={main} access={access} />
          </div>
        )}
        <div className={styles.column}>
          <WidgetStack widgets={side} access={access} />
        </div>
      </div>
    </div>
  );
}
