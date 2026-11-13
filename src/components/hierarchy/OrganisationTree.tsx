import { AppLink as Link } from '@/components/ui/AppLink';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import type { OrganisationNode, OrganisationPerson } from '@/lib/organisation/buildOrganisationTree';
import styles from './OrganisationTree.module.css';

export type HierarchyPerson = OrganisationPerson & {
  fullName: string;
  designation: string | null;
  department: string | null;
};

function PersonCard({ person, reportCount }: { person: HierarchyPerson; reportCount: number }) {
  return (
    <Link href={`/people/employees/${person.id}`} className={styles.card}>
      <PersonAvatar name={person.fullName} size="small" />
      <span className={styles.cardText}>
        <span className={styles.name}>{person.fullName}</span>
        <span className={styles.meta}>
          {[person.designation, person.department].filter(Boolean).join(' · ') || 'No designation'}
        </span>
      </span>
      {reportCount > 0 && <span className={styles.count}>{reportCount}</span>}
    </Link>
  );
}

function TreeBranch({ nodes }: { nodes: OrganisationNode<HierarchyPerson>[] }) {
  return (
    <ul className={styles.branch}>
      {nodes.map((node) => (
        <li key={node.person.id} className={styles.node}>
          <PersonCard person={node.person} reportCount={node.reports.length} />
          {node.reports.length > 0 && <TreeBranch nodes={node.reports} />}
        </li>
      ))}
    </ul>
  );
}

export function OrganisationTree({ roots }: { roots: OrganisationNode<HierarchyPerson>[] }) {
  return (
    <div className={styles.tree}>
      <TreeBranch nodes={roots} />
    </div>
  );
}
