// A client's services are chosen in two steps: the services (such as Web & AI), then
// the sub services under them (such as Website Design). Bundles (such as Brand Launch)
// can be chosen as well, or instead. The form and the server both use this check, so
// they always agree.

export type SubServiceChoice = { id: string; serviceId: string };

// In the client page's "Add" picker, a bundle's value is "bundle:<id>".
export const bundleChoicePrefix = 'bundle:';

export function checkServiceSelection(
  serviceIds: string[],
  subServices: SubServiceChoice[],
  serviceNames: Record<string, string>,
  bundleCount = 0,
): { field: 'serviceGroupIds' | 'serviceIds'; message: string } | null {
  if (serviceIds.length === 0) {
    if (subServices.length > 0) return { field: 'serviceIds', message: 'Choose sub services only from the services you chose.' };
    return bundleCount > 0 ? null : { field: 'serviceGroupIds', message: 'Choose at least one service or bundle.' };
  }

  const chosen = new Set(serviceIds);
  if (subServices.some((sub) => !chosen.has(sub.serviceId))) {
    return { field: 'serviceIds', message: 'Choose sub services only from the services you chose.' };
  }

  const covered = new Set(subServices.map((sub) => sub.serviceId));
  const missing = serviceIds.filter((id) => !covered.has(id)).map((id) => serviceNames[id] ?? 'a service');
  if (missing.length > 0) {
    return { field: 'serviceIds', message: `Choose at least one sub service for ${listInWords(missing)}.` };
  }
  return null;
}

// "A", "A and B", "A, B and C".
export function listInWords(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
