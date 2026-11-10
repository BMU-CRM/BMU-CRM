'use client';

import { CloudUpload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { acceptedFileTypes, checkUploadable, fileTypeOf } from '@/lib/files/fileTypes';
import type { FileLinks } from '@/lib/validation/fileSchema';
import {
  abandonUploadAction,
  finishUploadAction,
  startNewVersionAction,
  startUploadAction,
  type UploadTicket,
} from '@/server/actions/fileActions';
import styles from './FileUploader.module.css';

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  state: 'uploading' | 'done' | 'failed';
  message?: string;
};

type FileUploaderProps = {
  links?: FileLinks;
  // When set, uploads become new versions of this file instead of new files.
  versionOfFileId?: string;
  compact?: boolean;
};

// Sends the file straight to Storage with the signed link, reporting progress as it goes.
function sendToStorage(ticket: UploadTicket, file: File, onProgress: (percentage: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', ticket.uploadUrl);
    request.setRequestHeader('Content-Type', fileTypeOf(file.name)?.mime ?? 'application/octet-stream');
    request.setRequestHeader('x-upsert', 'false');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => (request.status < 300 ? resolve() : reject(new Error(request.responseText)));
    request.onerror = () => reject(new Error('Network error'));
    request.send(file);
  });
}

export function FileUploader({ links, versionOfFileId, compact = false }: FileUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  function update(key: string, change: Partial<UploadItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  async function uploadOne(file: File, key: string) {
    const problem = checkUploadable(file);
    if (problem) {
      update(key, { state: 'failed', message: problem });
      return;
    }

    const started = versionOfFileId
      ? await startNewVersionAction(versionOfFileId, { name: file.name, size: file.size })
      : await startUploadAction({ name: file.name, size: file.size, ...links });

    if (started.status === 'error') {
      update(key, { state: 'failed', message: started.message });
      return;
    }

    try {
      await sendToStorage(started.ticket, file, (progress) => update(key, { progress }));
      const finished = await finishUploadAction(started.ticket.versionId);
      if (finished.status === 'error') throw new Error(finished.message);
      update(key, { state: 'done', progress: 100 });
    } catch {
      if (!versionOfFileId) await abandonUploadAction(started.ticket.fileId);
      update(key, { state: 'failed', message: `${file.name}: the upload failed. Please try again.` });
    }
  }

  async function uploadAll(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, versionOfFileId ? 1 : 20);
    if (files.length === 0) return;

    const newItems = files.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      name: file.name,
      progress: 0,
      state: 'uploading' as const,
    }));
    setItems((current) => [...newItems, ...current].slice(0, 20));

    await Promise.all(files.map((file, index) => uploadOne(file, newItems[index]!.key)));
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    void uploadAll(event.dataTransfer.files);
  }

  return (
    <div>
      <label
        className={styles.dropZone}
        data-dragging={isDragging}
        data-compact={compact}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CloudUpload size={compact ? 18 : 22} aria-hidden="true" />
        <span>
          <strong>{versionOfFileId ? 'Upload a new version' : 'Drop files here or choose them'}</strong>
          {!compact && <span className={styles.hint}>Documents, images, audio, video and ZIP files, up to 50 MB each.</span>}
        </span>
        <input
          ref={inputRef}
          type="file"
          className={styles.input}
          accept={acceptedFileTypes}
          multiple={!versionOfFileId}
          onChange={(event) => void uploadAll(event.target.files)}
        />
      </label>

      {items.length > 0 && (
        <ul className={styles.items} aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className={styles.item}>
              <span className={styles.itemName}>{item.name}</span>
              {item.state === 'failed' ? (
                <span className={styles.failed}>{item.message}</span>
              ) : (
                <ProgressBar value={item.progress} label={`Uploading ${item.name}`} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
