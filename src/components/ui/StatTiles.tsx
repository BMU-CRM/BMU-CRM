import Link from 'next/link';
import styles from './StatTiles.module.css';

export type StatTile = {
  label: string;
  value: number | string;
  href?: string;
};

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <dl className={styles.tiles}>
      {tiles.map((tile) => (
        <div key={tile.label} className={styles.tile}>
          <dt className={styles.label}>
            {tile.href ? (
              <Link href={tile.href} className={styles.link}>
                {tile.label}
              </Link>
            ) : (
              tile.label
            )}
          </dt>
          <dd className={styles.value}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
