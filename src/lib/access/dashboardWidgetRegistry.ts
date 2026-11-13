import { permissionKeys, type PermissionKey, type PermissionMap } from './permissionKeys';

export type DashboardWidgetKey =
  | 'organisationStats'
  | 'clientProjectStats'
  | 'taskStats'
  | 'myTasks'
  | 'teamWorkload'
  | 'followUps'
  | 'departmentHeadcount'
  | 'myProfile'
  | 'myTeam'
  | 'recentActivity'
  | 'attendanceToday'
  | 'leaveBalance'
  | 'leaveApprovals'
  | 'upcomingMeetings'
  | 'ticketsToHandle'
  | 'financeStats'
  | 'overdueInvoices'
  | 'awaitingQuotations'
  | 'myWorkload'
  | 'documentSignature';

export type DashboardWidget = {
  key: DashboardWidgetKey;
  // Shown to anyone with this permission, or with any one of these.
  permission: PermissionKey | PermissionKey[];
  size: 'full' | 'main' | 'side';
};

// Dashboards are generated from this list, not written per role. A new or edited
// role gets the right dashboard from its permissions alone. Each module adds its
// widgets here when it ships.
const dashboardWidgets: DashboardWidget[] = [
  { key: 'financeStats', permission: permissionKeys.financeReports, size: 'full' },
  { key: 'organisationStats', permission: permissionKeys.organisationStats, size: 'full' },
  // Project figures for anyone who sees projects. Client figures are added inside the
  // widget only for people with the Clients section.
  { key: 'clientProjectStats', permission: permissionKeys.projectsView, size: 'full' },
  { key: 'taskStats', permission: permissionKeys.tasksView, size: 'full' },
  { key: 'attendanceToday', permission: permissionKeys.attendanceView, size: 'side' },
  // Everyone who has tasks sees their own workload. Managers also see their team's.
  { key: 'myWorkload', permission: permissionKeys.tasksView, size: 'side' },
  { key: 'leaveApprovals', permission: permissionKeys.leaveApprove, size: 'main' },
  { key: 'myTasks', permission: permissionKeys.tasksView, size: 'main' },
  { key: 'upcomingMeetings', permission: permissionKeys.meetingsCreate, size: 'main' },
  { key: 'ticketsToHandle', permission: permissionKeys.ticketsManage, size: 'main' },
  { key: 'overdueInvoices', permission: permissionKeys.invoicesView, size: 'main' },
  { key: 'awaitingQuotations', permission: permissionKeys.quotationsView, size: 'side' },
  // Whoever prepares quotations or invoices keeps their signature and seal for them.
  { key: 'documentSignature', permission: [permissionKeys.quotationsManage, permissionKeys.invoicesManage], size: 'side' },
  { key: 'leaveBalance', permission: permissionKeys.leaveRequest, size: 'side' },
  { key: 'teamWorkload', permission: permissionKeys.workloadView, size: 'main' },
  { key: 'departmentHeadcount', permission: permissionKeys.organisationStats, size: 'main' },
  { key: 'myProfile', permission: permissionKeys.dashboardView, size: 'side' },
  { key: 'followUps', permission: permissionKeys.clientsView, size: 'side' },
  { key: 'myTeam', permission: permissionKeys.teamView, size: 'side' },
  { key: 'recentActivity', permission: permissionKeys.auditView, size: 'main' },
];

export function buildDashboard(permissions: PermissionMap): DashboardWidget[] {
  return dashboardWidgets.filter((widget) =>
    (Array.isArray(widget.permission) ? widget.permission : [widget.permission]).some((permission) => permissions[permission] !== undefined),
  );
}
