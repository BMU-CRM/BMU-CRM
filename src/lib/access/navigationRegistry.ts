import {
  Building2,
  CalendarCog,
  CalendarDays,
  ChartColumn,
  Clock,
  FileText,
  FolderOpen,
  Landmark,
  Layers,
  ReceiptIndianRupee,
  Plane,
  Stamp,
  Gauge,
  MessagesSquare,
  Handshake,
  IdCard,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Network,
  ScrollText,
  ShieldCheck,
  SquareKanban,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  permissionKeys,
  permissionScopes,
  type PermissionKey,
  type PermissionMap,
  type PermissionScope,
} from './permissionKeys';

export type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey;
  // For pages that need wider access than simply having the permission.
  minimumScope?: PermissionScope;
};

export type NavigationSection = {
  title: string;
  items: NavigationItem[];
};

// Add each module here when it ships. The sidebar shows only what a user's
// permissions allow, so a new role needs no change to this file.
const navigationSections: NavigationSection[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', href: '/overview', icon: LayoutDashboard, permission: permissionKeys.dashboardView },
      { label: 'Messages', href: '/messages', icon: MessagesSquare, permission: permissionKeys.messagesUse },
      { label: 'Calendar', href: '/calendar', icon: CalendarDays, permission: permissionKeys.meetingsCreate },
      { label: 'Support', href: '/tickets', icon: LifeBuoy, permission: permissionKeys.ticketsCreate },
      { label: 'Tasks', href: '/tasks', icon: ListChecks, permission: permissionKeys.tasksView },
      { label: 'Files', href: '/files', icon: FolderOpen, permission: permissionKeys.filesUpload },
      { label: 'Projects', href: '/projects', icon: SquareKanban, permission: permissionKeys.projectsView },
      { label: 'Workload', href: '/workload', icon: Gauge, permission: permissionKeys.workloadView },
    ],
  },
  {
    title: 'CRM',
    items: [{ label: 'Clients', href: '/clients', icon: Handshake, permission: permissionKeys.clientsView }],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Quotations', href: '/quotations', icon: FileText, permission: permissionKeys.quotationsView },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIndianRupee, permission: permissionKeys.invoicesView },
      { label: 'Reports', href: '/finance', icon: ChartColumn, permission: permissionKeys.financeReports },
    ],
  },
  {
    title: 'Team',
    items: [
      { label: 'Leave', href: '/leave', icon: Plane, permission: permissionKeys.leaveRequest },
      { label: 'Attendance', href: '/attendance', icon: Clock, permission: permissionKeys.attendanceView },
      { label: 'Approvals', href: '/approvals', icon: Stamp, permission: permissionKeys.leaveApprove },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', href: '/people/employees', icon: Users, permission: permissionKeys.employeesView },
      { label: 'Hierarchy', href: '/people/hierarchy', icon: Network, permission: permissionKeys.organisationView },
      { label: 'Departments', href: '/people/departments', icon: Building2, permission: permissionKeys.departmentsManage },
      { label: 'Designations', href: '/people/designations', icon: IdCard, permission: permissionKeys.designationsManage },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Roles', href: '/settings/roles', icon: ShieldCheck, permission: permissionKeys.rolesManage },
      { label: 'HR settings', href: '/settings/hr', icon: CalendarCog, permission: permissionKeys.hrManage },
      { label: 'Finance settings', href: '/settings/finance', icon: Landmark, permission: permissionKeys.financeManage },
      { label: 'Services & industries', href: '/settings/services', icon: Layers, permission: permissionKeys.catalogManage },
      {
        label: 'Ticket categories',
        href: '/settings/ticket-categories',
        icon: Tags,
        permission: permissionKeys.ticketsManage,
        minimumScope: 'organisation',
      },
      { label: 'Audit log', href: '/settings/audit-log', icon: ScrollText, permission: permissionKeys.auditView },
    ],
  },
];

function hasReach(scope: PermissionScope | undefined, minimum: PermissionScope | undefined) {
  if (scope === undefined) return false;
  return !minimum || permissionScopes.indexOf(scope) >= permissionScopes.indexOf(minimum);
}

export function buildNavigation(permissions: PermissionMap): NavigationSection[] {
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasReach(permissions[item.permission], item.minimumScope)),
    }))
    .filter((section) => section.items.length > 0);
}
