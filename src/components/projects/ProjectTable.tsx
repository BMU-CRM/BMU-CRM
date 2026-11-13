import { AppLink as Link } from '@/components/ui/AppLink';
import styles from '@/components/ui/DataTable.module.css';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatDate } from '@/lib/formatDate';
import type { ProjectListItem } from '@/server/services/projectService';
import { ProjectHealthBadge, ProjectStatusBadge } from './ProjectBadges';

export function ProjectTable({ projects }: { projects: ProjectListItem[] }) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Manager</th>
            <th scope="col">Status</th>
            <th scope="col">Health</th>
            <th scope="col">Due</th>
            <th scope="col">Progress</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id}>
              <td>
                <Link href={`/projects/${project.id}`} className={`${styles.primaryText} ${styles.primaryLink}`}>
                  {project.name}
                </Link>
                <p className={styles.secondaryText}>
                  {[project.project_code, project.clientName ?? 'Internal'].join(' · ')}
                </p>
              </td>
              <td>{project.manager?.full_name ?? '—'}</td>
              <td>
                <ProjectStatusBadge status={project.status} />
              </td>
              <td>
                <ProjectHealthBadge health={project.health} />
              </td>
              <td>{project.due_date ? formatDate(project.due_date) : '—'}</td>
              <td>
                <ProgressBar value={project.progress} label={`${project.name} progress`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
