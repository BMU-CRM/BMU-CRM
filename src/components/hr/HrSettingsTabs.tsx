import { PageTabs } from '@/components/ui/PageTabs';
import { permissionKeys, type PermissionMap } from '@/lib/access/permissionKeys';

const tabs = [
  { key: 'general', href: '/settings/hr', label: 'Working hours and leave', permission: permissionKeys.hrManage },
  { key: 'payroll', href: '/settings/hr/payroll', label: 'Payroll', permission: permissionKeys.payrollManage },
  { key: 'recruitment', href: '/settings/hr/recruitment', label: 'Recruitment and letters', permission: permissionKeys.recruitmentManage },
  { key: 'exits', href: '/settings/hr/exits', label: 'Exits', permission: permissionKeys.exitsManage },
] as const;

export type HrSettingsTab = (typeof tabs)[number]['key'];

// HR settings grow a tab per area. Each tab shows only to people who manage that area.
export function HrSettingsTabs({ current, permissions }: { current: HrSettingsTab; permissions: PermissionMap }) {
  const shown = tabs.filter((tab) => permissions[tab.permission] !== undefined);
  if (shown.length < 2) return null;
  return <PageTabs label="HR settings" tabs={shown.map((tab) => ({ href: tab.href, label: tab.label, current: tab.key === current }))} />;
}
