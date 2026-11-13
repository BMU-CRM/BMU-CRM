'use client';

import { CalendarDays, Download, ExternalLink, FileText, Link2, Mail, MessageSquare, Phone, Video } from 'lucide-react';
import { AppLink as Link } from '@/components/ui/AppLink';
import { useActionState, useState, useTransition } from 'react';
import { PresenceDot } from '@/components/presence/PresenceDot';
import { PersonAvatar } from '@/components/ui/PersonAvatar';
import { FormMessage } from '@/components/ui/FormMessage';
import { idleResult, type ActionResult } from '@/lib/actionResult';
import { formatFileSize, previewKindOf } from '@/lib/files/fileTypes';
import { safeExternalUrl } from '@/lib/safeExternalUrl';
import { startDirectConversationAction, votePollAction } from '@/server/actions/messageActions';
import type { MessageItem, PollVote } from '@/server/services/messageService';
import styles from './MessageCards.module.css';

const eventDay = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const eventClock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' });

// A file or link sent in the chat. Photos, videos and audio play in place.
export function MessageAttachment({ file }: { file: NonNullable<MessageItem['file']> }) {
  if (file.status !== 'ready') return null;

  if (file.kind === 'link') {
    const url = safeExternalUrl(file.external_url);
    const host = url ? new URL(url).hostname.replace(/^www\./, '') : null;
    return (
      <a href={url ?? `/files/${file.id}`} target={url ? '_blank' : undefined} rel="noopener noreferrer" className={styles.attachment}>
        <Link2 size={18} aria-hidden="true" className={styles.attachmentIcon} />
        <span className={styles.attachmentText}>
          <span className={styles.attachmentName}>{file.name}</span>
          {host && <span className={styles.muted}>{host}</span>}
        </span>
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    );
  }

  const source = `/files/${file.id}/download?mode=view`;
  const kind = previewKindOf(file.name);

  return (
    <div className={styles.media}>
      {kind === 'image' && (
        <a href={`/files/${file.id}`} className={styles.imageLink}>
          {/* Served through the access-checked download route, so next/image cannot fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt={file.name} loading="lazy" className={styles.image} />
        </a>
      )}
      {kind === 'video' && <video src={source} controls preload="metadata" className={styles.video} />}
      {kind === 'audio' && <audio src={source} controls preload="metadata" className={styles.audio} />}
      <Link href={`/files/${file.id}`} className={styles.attachment}>
        <FileText size={18} aria-hidden="true" className={styles.attachmentIcon} />
        <span className={styles.attachmentText}>
          <span className={styles.attachmentName}>{file.name}</span>
          <span className={styles.muted}>{formatFileSize(file.size_bytes)}</span>
        </span>
        <Download size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

// A colleague's details, shared in the chat.
export function ContactCard({ contact }: { contact: NonNullable<MessageItem['contact']> }) {
  const [result, formAction, isPending] = useActionState(startDirectConversationAction, idleResult);

  return (
    <div className={styles.card}>
      <div className={styles.contactHead}>
        <span className={styles.avatar}>
          <PersonAvatar name={contact.full_name} size="small" />
          <PresenceDot employeeId={contact.id} variant="overlay" />
        </span>
        <span className={styles.attachmentText}>
          <span className={styles.attachmentName}>{contact.full_name}</span>
          <span className={styles.muted}>
            {[contact.designation?.title, contact.department?.name].filter(Boolean).join(' · ') || 'Colleague'}
          </span>
        </span>
      </div>
      <div className={styles.cardActions}>
        <form action={formAction}>
          <input type="hidden" name="employeeId" value={contact.id} />
          <button type="submit" className={styles.cardButton} disabled={isPending}>
            <MessageSquare size={14} aria-hidden="true" /> Message
          </button>
        </form>
        <a href={`mailto:${contact.work_email}`} className={styles.cardButton}>
          <Mail size={14} aria-hidden="true" /> Email
        </a>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className={styles.cardButton}>
            <Phone size={14} aria-hidden="true" /> Call
          </a>
        )}
      </div>
      <FormMessage result={result} />
    </div>
  );
}

// A meeting scheduled from the chat. Answering happens on the meeting page.
export function EventCard({ meeting, isOver }: { meeting: MessageItem['meeting']; isOver: boolean }) {
  if (!meeting) {
    return (
      <div className={styles.card}>
        <p className={styles.muted}>An event you are not invited to.</p>
      </div>
    );
  }

  const starts = new Date(meeting.starts_at);
  const ends = new Date(meeting.ends_at);
  const link = safeExternalUrl(meeting.meeting_link);

  return (
    <div className={styles.card} data-done={isOver}>
      <div className={styles.contactHead}>
        <span className={styles.eventIcon}>
          <CalendarDays size={18} aria-hidden="true" />
        </span>
        <span className={styles.attachmentText}>
          <span className={styles.attachmentName}>{meeting.title}</span>
          <span className={styles.muted}>
            {eventDay.format(starts)} · {eventClock.format(starts)} to {eventClock.format(ends)}
            {meeting.status === 'cancelled' ? ' · Cancelled' : isOver ? ' · Ended' : ''}
          </span>
        </span>
      </div>
      <div className={styles.cardActions}>
        <Link href={`/meetings/${meeting.id}`} className={styles.cardButton}>
          Open and reply
        </Link>
        {link && meeting.status === 'scheduled' && !isOver && (
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.cardButton}>
            <Video size={14} aria-hidden="true" /> Join
          </a>
        )}
      </div>
    </div>
  );
}

type PollCardProps = {
  conversationId: string;
  message: Pick<MessageItem, 'id' | 'poll_question' | 'poll_options' | 'poll_allows_multiple'>;
  votes: PollVote[];
  myEmployeeId: string;
  canVote: boolean;
};

// A poll. Tapping an option votes; tapping your choice again takes the vote back.
export function PollCard({ conversationId, message, votes, myEmployeeId, canVote }: PollCardProps) {
  const options = message.poll_options ?? [];
  const mine = votes.filter((vote) => vote.employee_id === myEmployeeId).map((vote) => vote.option_index);
  const [chosen, setChosen] = useState<number[] | null>(null);
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  const current = chosen ?? mine;
  const voters = new Set(votes.map((vote) => vote.employee_id)).size;

  function toggle(index: number) {
    const next = message.poll_allows_multiple
      ? current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index]
      : current.includes(index)
        ? []
        : [index];
    setChosen(next);
    startTransition(async () => {
      const outcome = await votePollAction(conversationId, message.id, next);
      setResult(outcome.status === 'error' ? outcome : { status: 'idle' });
      if (outcome.status === 'error') setChosen(null);
    });
  }

  return (
    <div className={styles.card}>
      <p className={styles.pollQuestion}>{message.poll_question}</p>
      <p className={styles.muted}>{message.poll_allows_multiple ? 'Choose one or more' : 'Choose one'}</p>
      <ul className={styles.pollOptions}>
        {options.map((option, index) => {
          const people = votes.filter((vote) => vote.option_index === index);
          // Your own choice shows straight away, before the server confirms it.
          const count = people.length - (mine.includes(index) ? 1 : 0) + (current.includes(index) ? 1 : 0);
          const share = voters === 0 ? 0 : Math.round((count / Math.max(voters, 1)) * 100);
          return (
            <li key={option}>
              <button
                type="button"
                className={styles.pollOption}
                aria-pressed={current.includes(index)}
                disabled={!canVote || isPending}
                onClick={() => toggle(index)}
                title={people.map((vote) => vote.voter?.full_name ?? 'Someone').join(', ') || 'No votes yet'}
              >
                <span className={styles.pollMark} data-multiple={message.poll_allows_multiple} aria-hidden="true" />
                <span className={styles.pollLabel}>{option}</span>
                <span className={styles.pollCount}>{count}</span>
                <span className={styles.pollBar} style={{ width: `${Math.min(share, 100)}%` }} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.muted}>
        {voters === 0 ? 'No votes yet' : `${voters} ${voters === 1 ? 'person has' : 'people have'} voted`}
      </p>
      {result.status === 'error' && <FormMessage result={result} />}
    </div>
  );
}
