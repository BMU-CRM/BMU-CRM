// A client's services are chosen in two steps: the services (such as Web & AI), then
// the sub services under them (such as Website Design). The form and the server both
// use this check, so they always agree.

export type SubServiceChoice = { id: string; serviceId: string };

export function checkServiceSelection(
  serviceIds: string[],
  subServices: SubServiceChoice[],
  serviceNames: Record<string, string>,
): { field: 'serviceGroupIds' | 'serviceIds'; message: string } | null {
  if (serviceIds.length === 0) return { field: 'serviceGroupIds', message: 'Choose at least one service.' };

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
