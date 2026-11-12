import type { Metadata } from 'next';
import { FinanceCategoryForm } from '@/components/finance/LedgerForms';
import { FinanceSettingsTabs } from '@/components/finance/FinanceSettingsTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listFinanceCategories } from '@/server/services/ledgerService';

export const metadata: Metadata = { title: 'Income and expense categories' };

export default async function FinanceCategoriesPage() {
  const access = await requirePagePermission(permissionKeys.ledgerManage);
  const categories = await listFinanceCategories();

  return (
    <>
      <PageHeader title="Finance settings" description="Categories for income and expenses. Turning one off hides it from new entries." />
      <FinanceSettingsTabs current="categories" permissions={access.permissions} />
      <div className={layout.columns}>
        {(['expense', 'income'] as const).map((kind) => (
          <Panel key={kind} title={kind === 'expense' ? 'Expense categories' : 'Income categories'} flush>
            <ul className={layout.list}>
              {categories
                .filter((category) => category.kind === kind)
                .map((category) => (
                  <li key={category.id} className={layout.sectionForm}>
                    <FinanceCategoryForm category={category} kind={kind} />
                  </li>
                ))}
              <li className={layout.sectionForm}>
                <p className={`${layout.rowTitle} ${layout.muted}`}>Add a category</p>
                <FinanceCategoryForm kind={kind} />
              </li>
            </ul>
          </Panel>
        ))}
      </div>
    </>
  );
}
