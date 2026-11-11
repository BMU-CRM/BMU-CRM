import Image from 'next/image';
import styles from './BrandLogo.module.css';

// The BMU logo, in the version that suits the current theme: dark letters on light
// pages, light letters on dark pages. Both are in the page; the theme decides which shows.
const logos = {
  mark: {
    light: { src: '/images/brand/bmu-mark-light.webp', width: 240, height: 71 },
    dark: { src: '/images/brand/bmu-mark-dark.webp', width: 240, height: 61 },
  },
  full: {
    light: { src: '/images/brand/bmu-logo-light.webp', width: 480, height: 212 },
    dark: { src: '/images/brand/bmu-logo-dark.webp', width: 359, height: 139 },
  },
} as const;

export function BrandLogo({ variant = 'mark', className }: { variant?: keyof typeof logos; className?: string }) {
  const { light, dark } = logos[variant];
  return (
    <span className={`${styles.logo} ${className ?? ''}`} data-variant={variant}>
      <Image src={light.src} width={light.width} height={light.height} alt="BMU Marketing" className={styles.onLight} priority />
      <Image src={dark.src} width={dark.width} height={dark.height} alt="BMU Marketing" className={styles.onDark} priority />
    </span>
  );
}
