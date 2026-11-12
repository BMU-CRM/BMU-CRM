import type { Metadata } from 'next';
import { ClaimForm } from '@/components/reimbursements/ReimbursementForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { requirePagePermission } from '@/server/services/accessService';
import { getClaimOptions } from '@/server/services/reimbursementService';

export const metadata: Metadata = { title: 'New claim' };

export default async function NewClaimPage() {
  const access = await requirePagePermission(permissionKeys.reimbursementsSubmit);
  const { categories, files } = await getClaimOptions(access);
  return (
    <>
      <PageHeader title="New claim" description="Your reporting manager and HR are told. Once approved, Finance pays you." />
      <Panel>
        {categories.length === 0 ? (
          <p className={layout.emptyText}>No expense categories are set up yet. Ask Finance to add them in Finance settings.</p>
        ) : (
          <ClaimForm categories={categories} files={files} today={todayInIndia()} />
        )}
      </Panel>
    </>
  );
}
