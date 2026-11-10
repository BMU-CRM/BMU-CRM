import { StatTiles } from '@/components/ui/StatTiles';
import type { CurrentAccess } from '@/server/services/accessService';
import { getOrganisationStats } from '@/server/services/dashboardService';

export async function OrganisationStatsWidget({ access }: { access: CurrentAccess }) {
  const stats = await getOrganisationStats(access);

  return (
    <StatTiles
      tiles={[
        { label: stats.isOrganisationWide ? 'Active employees' : 'Active in your department', value: stats.activeEmployees },
        { label: 'Total records', value: stats.totalEmployees },
        { label: 'Pending invitations', value: stats.pendingInvitations },
        ...(stats.isOrganisationWide ? [{ label: 'Departments', value: stats.activeDepartments }] : []),
      ]}
    />
  );
}
