'use client';

import { useState } from 'react';
import { FileUploader } from '@/components/files/FileUploader';
import { SelectField } from '@/components/ui/FormFields';
import { documentTypeLabels, employeeDocumentTypes, type EmployeeDocumentType } from '@/lib/employees/employeeRecordLabels';
import styles from './EmployeeDocumentUploader.module.css';

const options = employeeDocumentTypes.map((type) => ({ value: type, label: documentTypeLabels[type] }));

// Choose what kind of document it is, then drop the files. They are kept on the
// employee's record and never appear in Files.
export function EmployeeDocumentUploader({ employeeId }: { employeeId: string }) {
  const [documentType, setDocumentType] = useState<EmployeeDocumentType>('other');

  return (
    <div className={styles.uploader}>
      <SelectField
        label="Document type"
        name="documentType"
        id="employee-document-type"
        options={options}
        value={documentType}
        onChange={(event) => setDocumentType(event.target.value as EmployeeDocumentType)}
      />
      <FileUploader key={documentType} links={{ employeeId, documentType }} compact />
    </div>
  );
}
