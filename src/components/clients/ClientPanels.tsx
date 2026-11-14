import { ActionButton } from '@/components/ui/ActionButton';
import { ConfirmActionButton } from '@/components/ui/ConfirmActionButton';
import { SelectField, TextAreaField, TextField } from '@/components/ui/FormFields';
import { InlineActionForm } from '@/components/ui/InlineActionForm';
import { Panel } from '@/components/ui/Panel';
import { SearchablePicker, type PickerOption } from '@/components/ui/SearchablePicker';
import { StatusBadge } from '@/components/ui/StatusBadge';
import layout from '@/components/ui/WorkspaceLayout.module.css';
import { describeAuditEntry } from '@/lib/audit/describeAuditEntry';
import { formatDate, formatDateTime, todayInIndia } from '@/lib/formatDate';
import { clientRecordLabels, type ClientRecordKind } from '@/lib/validation/clientSchema';
import {
  addClientRecordAction,
  addClientServiceAction,
  completeClientRecordAction,
  deleteClientRecordAction,
  deleteClientServiceAction,
} from '@/server/actions/clientActions';
import type { ClientRecord, getClientTimeline, listClientServices } from '@/server/services/clientService';

const recordTones: Record<ClientRecordKind, 'neutral' | 'good' | 'warning' | 'critical'> = {
  note: 'neutral',
  requirement: 'neutral',
  feedback: 'good',
  complaint: 'critical',
  follow_up: 'warning',
};

const recordKindOptions = Object.entries(clientRecordLabels).map(([value, label]) => ({ value, label }));

const ratingOptions = [5, 4, 3, 2, 1].map((rating) => ({ value: String(rating), label: `${rating} of 5` }));

const serviceStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'ended', label: 'Ended' },
];

type RecordsProps = { clientId: string; records: ClientRecord[]; canUpdate: boolean };

export function ClientRecordsPanel({ clientId, records, canUpdate }: RecordsProps) {
  const today = todayInIndia();

  return (
    <Panel title="Requirements, feedback and notes" description={`${records.length} ${records.length === 1 ? 'entry' : 'entries'}`} flush>
      {records.length === 0 ? (
        <p className={layout.emptyText}>Nothing recorded yet.</p>
      ) : (
        <ul className={layout.list}>
          {records.map((record) => {
            const isOpenFollowUp = record.kind === 'follow_up' && !record.completed_at;

            return (
              <li key={record.id} className={layout.row}>
                <div className={layout.rowMain}>
                  <div className={layout.badges}>
                    <StatusBadge tone={recordTones[record.kind]}>{clientRecordLabels[record.kind]}</StatusBadge>
                    {record.rating && <StatusBadge>{record.rating} of 5</StatusBadge>}
                    {record.completed_at && <StatusBadge tone="good">Done</StatusBadge>}
                    {isOpenFollowUp && record.due_date && record.due_date < today && (
                      <StatusBadge tone="critical">Overdue</StatusBadge>
                    )}
                  </div>
                  <p className={layout.rowTitle}>{record.title}</p>
                  {record.body && <p className={layout.text}>{record.body}</p>}
                  <p className={layout.muted}>
                    {record.author?.full_name ?? 'System'} · {formatDateTime(record.created_at)}
                    {record.due_date ? ` · Due ${formatDate(record.due_date)}` : ''}
                  </p>
                </div>
                {canUpdate && (
                  <span className={layout.rowActions}>
                    {isOpenFollowUp && (
                      <ActionButton label="Done" action={completeClientRecordAction.bind(null, clientId, record.id)} />
                    )}
                    <ConfirmActionButton
                      label="Remove"
                      title="Remove this entry?"
                      description="It will be removed from this client. The audit log keeps a record."
                      confirmLabel="Remove"
                      action={deleteClientRecordAction.bind(null, clientId, record.id)}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canUpdate && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addClientRecordAction.bind(null, clientId)} submitLabel="Add">
            <SelectField label="Type" name="kind" options={recordKindOptions} defaultValue="note" />
            <TextField label="Title" name="title" required />
            <TextField label="Follow-up date" name="dueDate" type="date" />
            <SelectField label="Rating" name="rating" options={ratingOptions} placeholder="None" />
            <TextAreaField label="Details" name="body" rows={2} />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}

type ServicesProps = {
  clientId: string;
  services: Awaited<ReturnType<typeof listClientServices>>;
  serviceOptions: PickerOption[];
  canUpdate: boolean;
};

export function ClientServicesPanel({ clientId, services, serviceOptions, canUpdate }: ServicesProps) {
  return (
    <Panel title="Services" flush>
      {services.length === 0 ? (
        <p className={layout.emptyText}>No services yet.</p>
      ) : (
        <ul className={layout.list}>
          {services.map((service) => (
            <li key={service.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p className={layout.rowTitle}>
                  {service.service?.group?.name ? `${service.service.group.name} › ${service.service_name}` : service.service_name}
                </p>
                <p className={layout.muted}>
                  {service.plan ? `${service.plan.charAt(0).toUpperCase()}${service.plan.slice(1)} plan · ` : ''}
                  {service.status === 'active' ? 'Active' : service.status === 'paused' ? 'Paused' : 'Ended'}
                  {service.start_date ? ` · From ${formatDate(service.start_date)}` : ''}
                </p>
              </div>
              {canUpdate && <ActionButton label="Remove" action={deleteClientServiceAction.bind(null, clientId, service.id)} />}
            </li>
          ))}
        </ul>
      )}
      {canUpdate && (
        <div className={layout.sectionForm}>
          <InlineActionForm action={addClientServiceAction.bind(null, clientId)} submitLabel="Add">
            {/* Remounts after each add, so the picker starts empty again. */}
            <SearchablePicker
              key={services.length}
              id="add-service"
              name="serviceId"
              label="Sub service"
              options={serviceOptions}
              placeholder="Type to search, grouped by service"
              required
            />
            <SelectField
              label="Plan"
              name="plan"
              options={[
                { value: 'starter', label: 'Starter' },
                { value: 'growth', label: 'Growth' },
                { value: 'premium', label: 'Premium' },
              ]}
              placeholder="Not chosen"
            />
            <SelectField label="Status" name="status" options={serviceStatusOptions} defaultValue="active" />
            <TextField label="Start date" name="startDate" type="date" />
          </InlineActionForm>
        </div>
      )}
    </Panel>
  );
}

type TimelineProps = { entries: Awaited<ReturnType<typeof getClientTimeline>> };

export function ClientTimelinePanel({ entries }: TimelineProps) {
  return (
    <Panel title="Activity timeline" description="Everything that has happened with this client, newest first." flush>
      {entries.length === 0 ? (
        <p className={layout.emptyText}>No activity yet.</p>
      ) : (
        <ul className={layout.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={layout.row}>
              <div className={layout.rowMain}>
                <p>{describeAuditEntry(entry)}</p>
                <p className={layout.muted}>
                  {entry.actor_name} · {formatDateTime(entry.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
