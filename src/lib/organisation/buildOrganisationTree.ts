export type OrganisationPerson = {
  id: string;
  reportingManagerId: string | null;
};

export type OrganisationNode<Person extends OrganisationPerson> = {
  person: Person;
  reports: OrganisationNode<Person>[];
};

// Anyone whose manager is missing from the list becomes a top-level node, so a
// deactivated manager never hides the people below them.
export function buildOrganisationTree<Person extends OrganisationPerson>(
  people: Person[],
): OrganisationNode<Person>[] {
  const nodes = new Map<string, OrganisationNode<Person>>(
    people.map((person) => [person.id, { person, reports: [] }]),
  );
  const roots: OrganisationNode<Person>[] = [];

  for (const node of nodes.values()) {
    const managerId = node.person.reportingManagerId;
    const manager = managerId ? nodes.get(managerId) : undefined;

    if (manager && manager !== node) {
      manager.reports.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
