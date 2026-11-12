import {
  ArrowLeftRight,
  BookOpen,
  Banknote,
  DoorOpen,
  FileSpreadsheet,
  LogOut,
  UserSearch,
  Building2,
  CalendarCheck,
  CalendarCog,
  CalendarHeart,
  CalendarDays,
  ChartColumn,
  Clock,
  FileText,
  FolderOpen,
  HandCoins,
  Landmark,
  PhoneCall,
  PiggyBank,
  Receipt,
  Scale,
  ShoppingCart,
  ChartPie,
  Layers,
  ReceiptIndianRupee,
  Plane,
  Stamp,
  Gauge,
  MessagesSquare,
  Handshake,
  HeartHandshake,
  IdCard,
  Wallet,
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
  // Shown only alongside this permission too, such as HR's own copy of Employees.
  alsoRequires?: PermissionKey;
  // Shown with any one of these instead, for pages that gather several kinds of work.
  anyOf?: PermissionKey[];
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
  // The HR person's own section. Each page also appears elsewhere for other people,
  // but for HR it is grouped here, once.
  {
    title: 'HR',
    items: [
      { label: 'HR dashboard', href: '/hr', icon: HeartHandshake, permission: permissionKeys.hrDashboard },
      { label: 'Employees', href: '/people/employees', icon: Users, permission: permissionKeys.employeesView, alsoRequires: permissionKeys.hrDashboard },
      { label: 'Attendance', href: '/attendance', icon: Clock, permission: permissionKeys.attendanceView, alsoRequires: permissionKeys.hrDashboard },
      {
        label: 'Leave requests',
        href: '/hr/leave',
        icon: Plane,
        permission: permissionKeys.leaveApprove,
        minimumScope: 'organisation',
        alsoRequires: permissionKeys.hrDashboard,
      },
      { label: 'Holidays', href: '/hr/holidays', icon: CalendarHeart, permission: permissionKeys.hrManage, alsoRequires: permissionKeys.hrDashboard },
      { label: 'Payroll', href: '/hr/payroll', icon: Banknote, permission: permissionKeys.payrollManage },
      { label: 'Recruitment', href: '/hr/recruitment', icon: UserSearch, permission: permissionKeys.recruitmentManage },
      { label: 'Exits', href: '/hr/exits', icon: DoorOpen, permission: permissionKeys.exitsManage },
      { label: 'HR reports', href: '/hr/reports', icon: ChartPie, permission: permissionKeys.hrDashboard },
      { label: 'HR settings', href: '/settings/hr', icon: CalendarCog, permission: permissionKeys.hrManage, alsoRequires: permissionKeys.hrDashboard },
    ],
  },
  {
    title: 'CRM',
    items: [{ label: 'Clients', href: '/clients', icon: Handshake, permission: permissionKeys.clientsView }],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Finance dashboard', href: '/finance', icon: Wallet, permission: permissionKeys.financeDashboard },
      { label: 'Quotations', href: '/quotations', icon: FileText, permission: permissionKeys.quotationsView },
      { label: 'Invoices', href: '/invoices', icon: ReceiptIndianRupee, permission: permissionKeys.invoicesView },
      { label: 'Income & expenses', href: '/finance/ledger', icon: BookOpen, permission: permissionKeys.ledgerManage },
      { label: 'Transactions', href: '/finance/transactions', icon: ArrowLeftRight, permission: permissionKeys.ledgerManage },
      { label: 'Bank accounts', href: '/finance/banks', icon: Landmark, permission: permissionKeys.banksManage },
      { label: 'Payment follow-ups', href: '/finance/follow-ups', icon: PhoneCall, permission: permissionKeys.followupsManage },
      { label: 'Purchases', href: '/finance/purchases', icon: ShoppingCart, permission: permissionKeys.purchasesManage },
      { label: 'Salaries & reimbursements', href: '/finance/salaries', icon: HandCoins, permission: permissionKeys.reimbursementsPay },
      { label: 'Profit & loss', href: '/finance/profit-loss', icon: Scale, permission: permissionKeys.ledgerManage },
      { label: 'Department budgets', href: '/finance/budgets', icon: PiggyBank, permission: permissionKeys.budgetsManage },
      { label: 'Payroll approvals', href: '/hr/payroll', icon: Banknote, permission: permissionKeys.payrollApprove },
      { label: 'Settlements', href: '/hr/exits', icon: DoorOpen, permission: permissionKeys.payrollApprove },
      { label: 'Finance reports', href: '/finance/reports', icon: ChartColumn, permission: permissionKeys.financeReports },
      { label: 'Finance settings', href: '/settings/finance', icon: Landmark, permission: permissionKeys.financeManage, alsoRequires: permissionKeys.financeDashboard },
    ],
  },
  {
    title: 'Team',
    items: [
      { label: 'Leave', href: '/leave', icon: Plane, permission: permissionKeys.leaveRequest },
      { label: 'Attendance', href: '/attendance', icon: Clock, permission: permissionKeys.attendanceView },
      { label: 'My payslips', href: '/payslips', icon: FileSpreadsheet, permission: permissionKeys.payslipsView },
      { label: 'Reimbursements', href: '/reimbursements', icon: Receipt, permission: permissionKeys.reimbursementsSubmit },
      { label: 'Resignation', href: '/resignation', icon: LogOut, permission: permissionKeys.resignationSubmit },
      {
        label: 'Approvals',
        href: '/approvals',
        icon: Stamp,
        permission: permissionKeys.leaveApprove,
        anyOf: [permissionKeys.reimbursementsApprove, permissionKeys.payrollApprove, permissionKeys.exitsManage],
      },
      { label: 'Leave requests', href: '/hr/leave', icon: CalendarCheck, permission: permissionKeys.leaveApprove, minimumScope: 'organisation' },
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
      { label: 'Content calendar', href: '/settings/calendar', icon: CalendarDays, permission: permissionKeys.contentCalendarManage },
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

// Every main page in the menu. Pages below them (a task, a new invoice, an edit form)
// show a Back button in the top bar instead of a breadcrumb trail.
export function isMainPage(pathname: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === '/' || ['/profile', '/notifications'].includes(path) || navigationSections.some((section) => section.items.some((item) => item.href === path));
}

function hasReach(scope: PermissionScope | undefined, minimum: PermissionScope | undefined) {
  if (scope === undefined) return false;
  return !minimum || permissionScopes.indexOf(scope) >= permissionScopes.indexOf(minimum);
}

// A page shows once, in the first section that offers it to this person.
export function buildNavigation(permissions: PermissionMap): NavigationSection[] {
  const shown = new Set<string>();
  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const allowed =
          (hasReach(permissions[item.permission], item.minimumScope) &&
            (!item.alsoRequires || permissions[item.alsoRequires] !== undefined)) ||
          (item.anyOf ?? []).some((key) => permissions[key] !== undefined);
        if (!allowed || shown.has(item.href)) return false;
        shown.add(item.href);
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
