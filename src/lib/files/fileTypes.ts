// The formats allowed by the brief. The database and the storage bucket enforce the
// same list, so this file only gives faster feedback in the browser.

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | null;

type FileType = { mime: string; preview: PreviewKind; label: string };

const fileTypes: Record<string, FileType> = {
  mp4: { mime: 'video/mp4', preview: 'video', label: 'Video' },
  webm: { mime: 'video/webm', preview: 'video', label: 'Video' },
  m4v: { mime: 'video/x-m4v', preview: 'video', label: 'Video' },
  mov: { mime: 'video/quicktime', preview: null, label: 'Video' },
  avi: { mime: 'video/x-msvideo', preview: null, label: 'Video' },
  mkv: { mime: 'video/x-matroska', preview: null, label: 'Video' },
  mp3: { mime: 'audio/mpeg', preview: 'audio', label: 'Audio' },
  m4a: { mime: 'audio/mp4', preview: 'audio', label: 'Audio' },
  aac: { mime: 'audio/aac', preview: 'audio', label: 'Audio' },
  wav: { mime: 'audio/wav', preview: 'audio', label: 'Audio' },
  pdf: { mime: 'application/pdf', preview: 'pdf', label: 'PDF' },
  doc: { mime: 'application/msword', preview: null, label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', preview: null, label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', preview: null, label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', preview: null, label: 'Excel' },
  ppt: { mime: 'application/vnd.ms-powerpoint', preview: null, label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', preview: null, label: 'PowerPoint' },
  txt: { mime: 'text/plain', preview: 'text', label: 'Text' },
  csv: { mime: 'text/csv', preview: null, label: 'CSV' },
  jpg: { mime: 'image/jpeg', preview: 'image', label: 'Image' },
  jpeg: { mime: 'image/jpeg', preview: 'image', label: 'Image' },
  png: { mime: 'image/png', preview: 'image', label: 'Image' },
  webp: { mime: 'image/webp', preview: 'image', label: 'Image' },
  gif: { mime: 'image/gif', preview: 'image', label: 'Image' },
  zip: { mime: 'application/zip', preview: null, label: 'ZIP' },
};

// Matches the 50 MB limit set on the storage bucket in the files migration.
export const maxFileBytes = 50 * 1024 * 1024;

export const acceptedFileTypes = Object.keys(fileTypes)
  .map((extension) => `.${extension}`)
  .join(',');

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function fileTypeOf(name: string): FileType | null {
  return fileTypes[extensionOf(name)] ?? null;
}

export function previewKindOf(name: string): PreviewKind {
  return fileTypeOf(name)?.preview ?? null;
}

export function checkUploadable(file: { name: string; size: number }): string | null {
  if (!fileTypeOf(file.name)) return `${file.name}: this file type is not allowed.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > maxFileBytes) return `${file.name}: files can be up to 50 MB.`;
  return null;
}

export function formatFileSize(bytes: number | null) {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
