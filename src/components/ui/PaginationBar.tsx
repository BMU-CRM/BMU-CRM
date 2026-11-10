import { ButtonLink } from './Button';
import styles from './DataTable.module.css';

type PaginationBarProps = {
  page: number;
  perPage: number;
  total: number;
  hrefForPage: (page: number) => string;
};

export function PaginationBar({ page, perPage, total, hrefForPage }: PaginationBarProps) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  if (lastPage === 1) return null;

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span>
        Page {page} of {lastPage}
      </span>
      <div className={styles.paginationLinks}>
        {page > 1 && <ButtonLink href={hrefForPage(page - 1)}>Previous</ButtonLink>}
        {page < lastPage && <ButtonLink href={hrefForPage(page + 1)}>Next</ButtonLink>}
      </div>
    </nav>
  );
}
