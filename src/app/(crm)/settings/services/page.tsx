import type { Metadata } from 'next';
import { IndustryForm, ServiceForm, ServiceGroupForm } from '@/components/catalog/CatalogForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getCatalog } from '@/server/services/catalogService';

export const metadata: Metadata = { title: 'Services and industries' };

export default async function ServicesSettingsPage() {
  await requirePagePermission(permissionKeys.catalogManage);
  const { groups, industries } = await getCatalog();
  const groupOptions = groups.map((group) => ({ value: group.id, label: group.name }));

  return (
    <>
      <PageHeader
        title="Services and industries"
        description="What clients choose from when they are added: first the services, then the sub services under them. Untick “Can be chosen” to hide an entry; clients who already have it keep it."
      />
      <div className={layout.stack}>
        {groups.map((group) => (
          <Panel key={group.id} title={group.name} description={`${group.services.length} sub services`} flush>
            <ul className={layout.list}>
              <li className={layout.sectionForm}>
                <ServiceGroupForm group={group} />
              </li>
              {group.services.map((service) => (
                <li key={service.id} className={layout.sectionForm}>
                  <ServiceForm service={service} groupId={group.id} groups={groupOptions} />
                </li>
              ))}
              <li className={layout.sectionForm}>
                <p className={`${layout.rowTitle} ${layout.muted}`}>Add a sub service to {group.name}</p>
                <ServiceForm groupId={group.id} groups={groupOptions} />
              </li>
            </ul>
          </Panel>
        ))}
        <Panel title="Add a service">
          <ServiceGroupForm />
        </Panel>
        <Panel title="Industries" description={`${industries.length} industries, in alphabetical order`} flush>
          <ul className={layout.list}>
            {industries.map((industry) => (
              <li key={industry.id} className={layout.sectionForm}>
                <IndustryForm industry={industry} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add an industry</p>
              <IndustryForm />
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
