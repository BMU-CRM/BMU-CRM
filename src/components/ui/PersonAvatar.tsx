import styles from './PersonAvatar.module.css';

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

type PersonAvatarProps = {
  name: string;
  size?: 'small' | 'medium' | 'large';
};

export function PersonAvatar({ name, size = 'medium' }: PersonAvatarProps) {
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
