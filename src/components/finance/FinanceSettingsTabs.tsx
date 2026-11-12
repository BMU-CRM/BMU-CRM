import { PageTabs } from '@/components/ui/PageTabs';
import { permissionKeys, type PermissionMap } from '@/lib/access/permissionKeys';

const tabs = [
  { key: 'general', href: '/settings/finance', label: 'Billing and invoices', permission: permissionKeys.financeManage },
  { key: 'categories', href: '/settings/finance/categories', label: 'Income and expense categories', permission: permissionKeys.ledgerManage },
] as const;

export function FinanceSettingsTabs({ current, permissions }: { current: (typeof tabs)[number]['key']; permissions: PermissionMap }) {
  const shown = tabs.filter((tab) => permissions[tab.permission] !== undefined);
  if (shown.length < 2) return null;
  return <PageTabs label="Finance settings" tabs={shown.map((tab) => ({ href: tab.href, label: tab.label, current: tab.key === current }))} />;
}
