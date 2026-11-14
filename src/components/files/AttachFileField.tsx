'use client';

import { Paperclip, X } from 'lucide-react';
import { useState } from 'react';
import { SelectField, type SelectOption } from '@/components/ui/FormFields';
import formStyles from '@/components/ui/FormFields.module.css';
import { uploadFromDevice } from '@/lib/files/uploadFromDevice';
import styles from './AttachFileField.module.css';

type AttachFileFieldProps = {
  // The form field holding the chosen file's id, such as "receiptFileId".
  name: string;
  label: string;
  // Files already in Files that can be chosen instead.
  files: SelectOption[];
  hint?: string;
  error?: string;
};

// A supporting document: picked from this device (uploaded straight away into the
// person's Files) or chosen from what is already in Files. The form sends the file's id.
export function AttachFileField({ name, label, files, hint, error }: AttachFileFieldProps) {
  const [uploaded, setUploaded] = useState<{ id: string; name: string } | null>(null);
  const [chosenId, setChosenId] = useState('');
  const [state, setState] = useState<{ busy: boolean; problem: string | null }>({ busy: false, problem: null });

  async function upload(file: File) {
    setState({ busy: true, problem: null });
    try {
      const fileId = await uploadFromDevice(file);
      setUploaded({ id: fileId, name: file.name });
      setChosenId('');
      setState({ busy: false, problem: null });
    } catch (problem) {
      setState({ busy: false, problem: problem instanceof Error ? problem.message : 'The upload failed. Please try again.' });
    }
  }

  return (
    <div className={formStyles.field}>
      <span className={formStyles.label}>{label}</span>
      <input type="hidden" name={name} value={uploaded?.id ?? chosenId} />
      {uploaded ? (
        <p className={styles.attached}>
          <Paperclip size={16} aria-hidden="true" />
          <span className={styles.fileName}>{uploaded.name}</span>
          <button type="button" className={styles.remove} onClick={() => setUploaded(null)} aria-label={`Remove ${uploaded.name}`}>
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      ) : (
        <div className={styles.choices}>
          <label className={styles.device} data-busy={state.busy}>
            <Paperclip size={16} aria-hidden="true" />
            {state.busy ? 'Uploading…' : 'Attach from this device'}
            <input
              type="file"
              className={styles.hiddenInput}
              disabled={state.busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void upload(file);
              }}
            />
          </label>
          {files.length > 0 && (
            <>
              <span className={styles.or}>or</span>
              <div className={styles.fromFiles}>
                <SelectField
                  label={`${label} from Files`}
                  name={`${name}FromFiles`}
                  id={`${name}-files`}
                  options={files}
                  placeholder="Choose from Files"
                  value={chosenId}
                  onChange={(event) => setChosenId(event.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}
      {hint && <p className={formStyles.hint}>{hint}</p>}
      {(state.problem || error) && (
        <p className={formStyles.error} role="alert">
          {state.problem ?? error}
        </p>
      )}
    </div>
  );
}
