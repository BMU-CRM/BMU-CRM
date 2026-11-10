import { StatTiles, type StatTile } from '@/components/ui/StatTiles';
import { permissionKeys } from '@/lib/access/permissionKeys';
import type { CurrentAccess } from '@/server/services/accessService';
import { getClientStats } from '@/server/services/clientService';
import { getProjectStats } from '@/server/services/projectService';

// Project figures for everyone who sees projects, with client figures for people who
// have the Clients section.
export async function ClientProjectStatsWidget({ access }: { access: CurrentAccess }) {
  const showClients = access.permissions[permissionKeys.clientsView] !== undefined;
  const [clients, projects] = await Promise.all([showClients ? getClientStats() : Promise.resolve(null), getProjectStats()]);

  const tiles: StatTile[] = [
    ...(clients
      ? [
          { label: 'Active clients', value: clients.active, href: '/clients?status=active' },
          { label: 'Leads', value: clients.leads, href: '/clients?status=lead' },
        ]
      : []),
    { label: 'Projects in progress', value: projects.inProgress, href: '/projects' },
    { label: 'Delayed projects', value: projects.delayed, href: '/projects' },
  ];

  return <StatTiles tiles={tiles} />;
}
