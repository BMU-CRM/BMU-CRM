import { previewKindOf } from '@/lib/files/fileTypes';
import styles from './FilePreview.module.css';

// The browser fetches through the download route, which checks access and logs the
// view before handing over a short-lived link.
export function FilePreview({ fileId, name, version }: { fileId: string; name: string; version: number }) {
  const kind = previewKindOf(name);
  const source = `/files/${fileId}/download?mode=view&version=${version}`;

  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link cannot go through the image optimiser.
    return <img src={source} alt={name} className={styles.image} />;
  }
  if (kind === 'video') {
    return <video src={source} controls preload="metadata" className={styles.media} />;
  }
  if (kind === 'audio') {
    return <audio src={source} controls preload="metadata" className={styles.audio} />;
  }
  if (kind === 'pdf' || kind === 'text') {
    return <iframe src={source} title={name} className={styles.frame} />;
  }
  return <p className={styles.none}>This type of file cannot be previewed. Download it to open it.</p>;
}
