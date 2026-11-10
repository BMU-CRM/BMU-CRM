import { IdCard } from 'lucide-react';
import type { Metadata } from 'next';
import { DesignationForm } from '@/components/organisation/DesignationForm';
import { OrganisationRowActions } from '@/components/organisation/OrganisationRowActions';
import tableStyles from '@/components/ui/DataTable.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { listDesignations } from '@/server/services/organisationService';
import styles from '../OrganisationPages.module.css';

export const metadata: Metadata = { title: 'Designations' };

export default async function DesignationsPage() {
  await requirePagePermission(permissionKeys.designationsManage);

  const designations = await listDesignations();

  return (
    <>
      <PageHeader title="Designations" description="Job titles and management levels. Access comes from roles, not titles." />
      <div className={styles.stack}>
        <Panel title="Add a designation">
          {/* The key gives a fresh, empty form after each add. */}
          <DesignationForm key={designations.length} />
        </Panel>
        <Panel flush>
          {designations.length === 0 ? (
            <EmptyState icon={IdCard} title="No designations yet" description="Add your first designation above." />
          ) : (
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col" className={tableStyles.numeric}>
                      Management level
                    </th>
                    <th scope="col">
                      <span className={styles.visuallyHidden}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {designations.map((designation) => (
                    <tr key={designation.id}>
                      <td className={tableStyles.primaryText}>{designation.title}</td>
                      <td className={tableStyles.numeric}>{designation.management_level}</td>
                      <td>
                        <OrganisationRowActions
                          kind="designation"
                          id={designation.id}
                          name={designation.title}
                          editHref={`/people/designations/${designation.id}`}
                        />
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
