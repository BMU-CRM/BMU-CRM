'use client';

import { useState } from 'react';
import { SearchablePicker, type PickerOption } from '@/components/ui/SearchablePicker';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { listInWords } from '@/lib/clients/serviceSelection';

export type SubServicePickerOption = PickerOption & { groupId: string };

type ClientServicesFieldsProps = {
  services: PickerOption[];
  subServices: SubServicePickerOption[];
  defaultSubServiceIds: string[];
  serviceError?: string;
  subServiceError?: string;
};

// Step 1 chooses the services (such as Web & AI). Step 2 then offers only their sub
// services (such as Website Design). Removing a service removes its sub services.
export function ClientServicesFields({ services, subServices, defaultSubServiceIds, serviceError, subServiceError }: ClientServicesFieldsProps) {
  const groupOf = (subId: string) => subServices.find((sub) => sub.value === subId)?.groupId;
  const [chosenServices, setChosenServices] = useState<string[]>(() => [
    ...new Set(defaultSubServiceIds.flatMap((id) => groupOf(id) ?? [])),
  ]);
  const [chosenSubs, setChosenSubs] = useState<string[]>(defaultSubServiceIds.filter((id) => groupOf(id)));

  const available = subServices.filter((sub) => chosenServices.includes(sub.groupId));
  const stillNeeded = services.filter(
    (service) => chosenServices.includes(service.value) && !chosenSubs.some((id) => groupOf(id) === service.value),
  );

  // After a failed save, the messages follow what is chosen now, so an error that has
  // been put right disappears and the one still open names the services concerned.
  const neededNames = listInWords(stillNeeded.map((service) => service.label));
  const serviceErrorNow = chosenServices.length === 0 ? serviceError : undefined;
  const subServiceErrorNow = subServiceError
    ? stillNeeded.length
      ? `Choose at least one sub service for ${neededNames}.`
      : chosenSubs.length === 0
        ? subServiceError
        : undefined
    : undefined;

  function changeServices(next: string[]) {
    setChosenServices(next);
    setChosenSubs((current) => current.filter((id) => next.includes(groupOf(id) ?? '')));
  }

  return (
    <div className={layout.stack}>
      <SearchablePicker
        id="serviceGroupIds"
        name="serviceGroupIds"
        label="Services"
        options={services}
        multiple
        required
        value={chosenServices}
        onChange={changeServices}
        placeholder="Type to search, for example Web or Marketing"
        hint="Step 1. Choose every service the client needs."
        error={serviceErrorNow}
      />
      <SearchablePicker
        id="serviceIds"
        name="serviceIds"
        label="Sub services"
        options={available}
        multiple
        required
        value={chosenSubs}
        onChange={setChosenSubs}
        placeholder={chosenServices.length ? 'Type to search, for example SEO or Website' : 'Choose services first'}
        emptyMessage="Choose services first. Their sub services appear here."
        hint={
          stillNeeded.length
            ? `Step 2. Still to choose: a sub service for ${neededNames}.`
            : 'Step 2. Choose at least one sub service for each service.'
        }
        error={subServiceErrorNow}
      />
    </div>
  );
}
