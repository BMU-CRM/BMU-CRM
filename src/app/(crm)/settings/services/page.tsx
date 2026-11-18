import type { Metadata } from 'next';
import { IndustryForm, ServiceBundleForm, ServiceForm, ServiceGroupForm } from '@/components/catalog/CatalogForms';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { requirePagePermission } from '@/server/services/accessService';
import { getCatalog } from '@/server/services/catalogService';

export const metadata: Metadata = { title: 'Services and industries' };

// A bundle's own sub services stay choosable even if hidden or unpriced since.
function withMembers(options: { value: string; label: string }[], members: { id: string; name: string }[]) {
  const missing = members.filter((member) => !options.some((option) => option.value === member.id));
  return [...options, ...missing.map((member) => ({ value: member.id, label: member.name }))];
}

export default async function ServicesSettingsPage() {
  await requirePagePermission(permissionKeys.catalogManage);
  const { groups, industries, bundles } = await getCatalog();
  const groupOptions = groups.map((group) => ({ value: group.id, label: group.name }));
  // Sub services a bundle can hold: those with a price, under their service.
  const bundleServiceOptions = groups.flatMap((group) =>
    group.services
      .filter((service) => service.is_active && [service.starter_price, service.growth_price, service.premium_price].some((price) => price !== null))
      .map((service) => ({ value: service.id, label: `${service.name} (${group.name})` })),
  );

  return (
    <>
      <PageHeader
        title="Services and industries"
        description="What clients choose from when they are added: first the services, then the sub services under them. Each sub service has its billing and Starter, Growth and Premium prices (before GST), which fill in quotation and invoice items. Untick “Can be chosen” to hide an entry; clients who already have it keep it."
      />
      <div className={layout.stack}>
        {groups.map((group) => {
          const shown = group.services.filter((service) => service.is_active);
          const hidden = group.services.length - shown.length;
          return (
          <Panel
            key={group.id}
            title={group.name}
            description={`${shown.length} sub services${hidden ? `, ${hidden} hidden` : ''}`}
            flush
          >
            <ul className={layout.list}>
              <li className={layout.sectionForm}>
                <ServiceGroupForm group={group} />
              </li>
              {[...shown, ...group.services.filter((service) => !service.is_active)].map((service) => (
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
          );
        })}
        <Panel title="Add a service">
          <ServiceGroupForm />
        </Panel>
        <Panel
          title="Bundles"
          description="Sub services sold together. Each plan's price is the sub services' prices for that plan added up, less the saving; a plan is offered only when all of them have a price. On a quotation or invoice a bundle is one item, with its sub services as the description."
          flush
        >
          <ul className={layout.list}>
            {bundles.map((bundle) => (
              <li key={bundle.id} className={layout.sectionForm}>
                <ServiceBundleForm bundle={bundle} serviceOptions={withMembers(bundleServiceOptions, bundle.services)} />
              </li>
            ))}
            <li className={layout.sectionForm}>
              <p className={`${layout.rowTitle} ${layout.muted}`}>Add a bundle</p>
              <ServiceBundleForm serviceOptions={bundleServiceOptions} />
            </li>
          </ul>
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
