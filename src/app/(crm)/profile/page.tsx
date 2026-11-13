import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EmployeeDocumentsPanel } from '@/components/employees/EmployeeDocumentsPanel';
import { EmployeePersonalPanel } from '@/components/employees/EmployeePersonalPanel';
import { EmployeePrivatePanel } from '@/components/employees/EmployeePrivatePanel';
import { EmployeeProfileDetails } from '@/components/employees/EmployeeProfileDetails';
import { DocumentSignatureForm } from '@/components/finance/DocumentSignatureForm';
import { MyProfileForm } from '@/components/employees/MyProfileForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { permissionKeys } from '@/lib/access/permissionKeys';
import { todayInIndia } from '@/lib/formatDate';
import { isEncryptionReady } from '@/server/security/fieldEncryption';
import { requireAccess } from '@/server/services/accessService';
import { getEmployee, getPersonalDetails, getPrivateDetails, listEmployeeDocuments } from '@/server/services/employeeService';
import { getFinanceSettings } from '@/server/services/financeService';
import { getSavedSignature } from '@/server/services/signatureService';
import styles from './MyProfilePage.module.css';

export const metadata: Metadata = { title: 'My profile' };

export default async function MyProfilePage() {
  const access = await requireAccess();
  // People who prepare quotations or invoices keep a signature and seal for them.
  const canSign =
    access.permissions[permissionKeys.invoicesManage] !== undefined || access.permissions[permissionKeys.quotationsManage] !== undefined;
  const [employee, personal, privateDetails, documents, signature, settings] = await Promise.all([
    getEmployee(access.employee.id),
    getPersonalDetails(access.employee.id),
    getPrivateDetails(access.employee.id),
    listEmployeeDocuments(access.employee.id),
    canSign ? getSavedSignature(access.employee.id) : Promise.resolve(null),
    canSign ? getFinanceSettings() : Promise.resolve(null),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader title="My profile" />
      <div className={styles.stack}>
        <EmployeeProfileDetails employee={employee} today={todayInIndia()} />
        <Panel title="Update your details" description="Your manager or an administrator updates everything else.">
          <MyProfileForm phone={employee.phone} skills={employee.skills} />
        </Panel>
        {canSign && (
          <section id="signature">
            <Panel
              title="Signature and seal for documents"
              description="Upload them once. When you prepare a quotation, invoice or receipt, you can add them, with your name and title under the signature."
            >
              <DocumentSignatureForm
                name={access.employee.full_name}
                roleName={access.employee.role?.name ?? 'Authorised signatory'}
                companyName={settings?.legal_name ?? 'the company'}
                title={signature?.signatory_title ?? null}
                signatureImage={signature?.signature_image ?? null}
                sealImage={signature?.seal_image ?? null}
              />
            </Panel>
          </section>
        )}
        <EmployeePersonalPanel employeeId={employee.id} details={personal} canEdit />
        <EmployeePrivatePanel
          employeeId={employee.id}
          details={privateDetails}
          canEdit={access.permissions[permissionKeys.employeesPrivateView] !== undefined}
          encryptionReady={isEncryptionReady()}
        />
        <EmployeeDocumentsPanel
          employeeId={employee.id}
          documents={documents}
          canAdd={access.permissions[permissionKeys.filesUpload] !== undefined}
          viewerId={access.employee.id}
        />
      </div>
    </>
  );
}
