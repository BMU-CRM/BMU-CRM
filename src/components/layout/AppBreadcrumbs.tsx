'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import styles from './AppBreadcrumbs.module.css';

const segmentLabels: Record<string, string> = {
  overview: 'Overview',
  profile: 'My profile',
  tasks: 'Tasks',
  projects: 'Projects',
  workload: 'Workload',
  clients: 'Clients',
  files: 'Files',
  messages: 'Messages',
  notifications: 'Notifications',
  leave: 'Leave',
  attendance: 'Attendance',
  report: 'Report',
  approvals: 'Approvals',
  hr: 'HR',
  reports: 'Reports',
  calendar: 'Calendar',
  meetings: 'Meetings',
  tickets: 'Support',
  'ticket-categories': 'Ticket categories',
  quotations: 'Quotations',
  services: 'Services & industries',
  invoices: 'Invoices',
  finance: 'Finance',
  people: 'People',
  employees: 'Employees',
  hierarchy: 'Hierarchy',
  departments: 'Departments',
  designations: 'Designations',
  settings: 'Settings',
  roles: 'Roles',
  'audit-log': 'Audit log',
  holidays: 'Holidays',
  utilisation: 'Leave report',
  personal: 'Personal details',
  private: 'ID and bank',
  new: 'Add',
  edit: 'Edit',
};

// The same word means a different page under some parents: under Settings, "hr" and
// "finance" are those areas' settings pages, and under HR, "leave" is everyone's leave.
const labelsUnder: Record<string, Record<string, string>> = {
  settings: { hr: 'HR settings', finance: 'Finance settings' },
  hr: { leave: 'Leave requests' },
};

// These segments only group pages, so they have no page of their own to link to.
const groupSegments = new Set(['people', 'settings', 'personal', 'private']);

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      {segments.map((segment, index) => {
        const parent = segments[index - 1];
        const label = (parent ? labelsUnder[parent]?.[segment] : undefined) ?? segmentLabels[segment] ?? 'Details';
        const isLast = index === segments.length - 1;
        const href = `/${segments.slice(0, index + 1).join('/')}`;

        return (
          <Fragment key={href}>
            {index > 0 && <ChevronRight size={14} aria-hidden="true" className={styles.separator} />}
            {isLast || groupSegments.has(segment) ? (
              <span className={isLast ? styles.current : styles.group} aria-current={isLast ? 'page' : undefined}>
                {label}
              </span>
            ) : (
              <Link href={href} className={styles.link}>
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
