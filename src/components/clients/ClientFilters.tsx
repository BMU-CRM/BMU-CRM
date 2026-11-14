import { ButtonLink } from '@/components/ui/Button';
import { SelectField, TextField, type SelectOption } from '@/components/ui/FormFields';
import styles from '@/components/ui/ListFilters.module.css';
import { clientStatusLabels } from '@/lib/validation/clientSchema';

const statusOptions = Object.entries(clientStatusLabels).map(([value, label]) => ({ value, label }));

type ClientFiltersProps = {
  managers: SelectOption[];
  industries: SelectOption[];
  services: SelectOption[];
  subServices: SelectOption[];
  values: { search?: string; status?: string; managerId?: string; industryId?: string; serviceGroupId?: string; serviceId?: string };
};

// The lists are in alphabetical order. Typing the first letters on a focused list jumps
// to the match.
export function ClientFilters({ managers, industries, services, subServices, values }: ClientFiltersProps) {
  return (
    <form method="get" className={styles.filters}>
      <TextField label="Search" name="search" type="search" placeholder="Company, contact or ID" defaultValue={values.search} />
      <SelectField label="Status" name="status" options={statusOptions} placeholder="All statuses" defaultValue={values.status} />
      <SelectField label="Industry" name="industryId" options={industries} placeholder="Any industry" defaultValue={values.industryId} />
      <SelectField label="Service" name="serviceGroupId" options={services} placeholder="Any service" defaultValue={values.serviceGroupId} />
      <SelectField label="Sub service" name="serviceId" options={subServices} placeholder="Any sub service" defaultValue={values.serviceId} />
      <SelectField label="Client Manager" name="managerId" options={managers} placeholder="Anyone" defaultValue={values.managerId} />
      <div className={styles.actions}>
        <ButtonLink href="/clients" variant="ghost">
          Clear
        </ButtonLink>
      </div>
    </form>
  );
}
