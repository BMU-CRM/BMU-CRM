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
  hr: 'HR settings',
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
  new: 'Add',
  edit: 'Edit',
};

// These segments only group pages, so they have no page of their own to link to.
const groupSegments = new Set(['people', 'settings']);

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      {segments.map((segment, index) => {
        const label = segmentLabels[segment] ?? 'Details';
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
