import { ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import styles from './EmployeeDirectoryFilters.module.css';

type EmployeeDirectoryFiltersProps = {
  departments: SelectOption[];
  roles: SelectOption[];
  values: { search?: string; departmentId?: string; roleId?: string; accountStatus?: string };
};

export function EmployeeDirectoryFilters({ departments, roles, values }: EmployeeDirectoryFiltersProps) {
  return (
    <form method="get" className={styles.filters}>
      <TextField label="Search" name="search" type="search" placeholder="Name, email or ID" defaultValue={values.search} />
      <SelectField label="Department" name="departmentId" options={departments} placeholder="All departments" defaultValue={values.departmentId} />
      <SelectField label="Role" name="roleId" options={roles} placeholder="All roles" defaultValue={values.roleId} />
      <SelectField
        label="Account"
        name="accountStatus"
        placeholder="All accounts"
        defaultValue={values.accountStatus}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />
      <div className={styles.actions}>
        <ButtonLink href="/people/employees" variant="ghost">
          Clear
        </ButtonLink>
      </div>
    </form>
  );
}
