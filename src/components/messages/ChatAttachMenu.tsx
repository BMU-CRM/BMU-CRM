'use client';

import {
  BarChart3,
  Camera,
  CalendarDays,
  FileText,
  Headphones,
  Image as ImageIcon,
  Link2,
  Plus,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import dialogStyles from '@/components/ui/ConfirmActionButton.module.css';
import { SelectField, TextAreaField, TextField, type SelectOption } from '@/components/ui/FormFields';
import { FormMessage } from '@/components/ui/FormMessage';
import { todayInIndia } from '@/lib/formatDate';
import type { ActionResult } from '@/lib/actionResult';
import {
  scheduleChatEventAction,
  sendLinkMessageAction,
  sendMessageAction,
  sendPollAction,
} from '@/server/actions/messageActions';
import styles from './ChatAttachMenu.module.css';

type ChatAttachMenuProps = {
  conversationId: string;
  people: SelectOption[];
  canShareLinks: boolean;
  canSchedule: boolean;
  // A file picked here waits in the composer until the message is sent.
  onFile: (file: File) => void;
};

type DialogKind = 'link' | 'contact' | 'poll' | 'event' | 'camera';
type ChoiceKey = 'document' | 'media' | 'camera' | 'audio' | 'link' | 'contact' | 'poll' | 'event';

// WhatsApp's choices, in its order. Each colour is set in the CSS by its key.
const choices: { key: ChoiceKey; label: string; icon: ReactNode }[] = [
  { key: 'document', label: 'Document', icon: <FileText size={18} /> },
  { key: 'media', label: 'Photos & videos', icon: <ImageIcon size={18} /> },
  { key: 'camera', label: 'Camera', icon: <Camera size={18} /> },
  { key: 'audio', label: 'Audio', icon: <Headphones size={18} /> },
  { key: 'link', label: 'Drive or other link', icon: <Link2 size={18} /> },
  { key: 'contact', label: 'Contact', icon: <UserRound size={18} /> },
  { key: 'poll', label: 'Poll', icon: <BarChart3 size={18} /> },
  { key: 'event', label: 'Event', icon: <CalendarDays size={18} /> },
];

const pickers = {
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip',
  media: 'image/*,video/*',
  audio: 'audio/*',
} as const;

// A pop-up form for one kind of attachment. Sends, then closes.
function AttachDialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={`${dialogStyles.dialog} ${styles.dialog}`} aria-label={title} onClose={onClose}>
      <div className={styles.dialogHead}>
        <h2 className={dialogStyles.title}>{title}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

function useSend(onDone: () => void) {
  const [result, setResult] = useState<ActionResult>({ status: 'idle' });
  const [isPending, startTransition] = useTransition();
  function send(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.status === 'success') onDone();
    });
  }
  return { result, isPending, send };
}

function LinkForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const { result, isPending, send } = useSend(onDone);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        send(() =>
          sendLinkMessageAction(conversationId, {
            url: String(data.get('url') ?? ''),
            name: String(data.get('name') ?? ''),
            note: String(data.get('note') ?? ''),
          }),
        );
      }}
    >
      <FormMessage result={result} />
      <TextField label="Link" name="url" id="chat-link-url" type="url" placeholder="https://drive.google.com/…" required error={result.fieldErrors?.url} />
      <TextField label="Name (optional)" name="name" id="chat-link-name" placeholder="Proposal draft" error={result.fieldErrors?.name} />
      <TextAreaField label="Message (optional)" name="note" id="chat-link-note" rows={2} error={result.fieldErrors?.note} />
      <p className={styles.hint}>The link is also kept under Files, in Links.</p>
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Sending…' : 'Send link'}
        </Button>
      </div>
    </form>
  );
}

function ContactForm({ conversationId, people, onDone }: { conversationId: string; people: SelectOption[]; onDone: () => void }) {
  const { result, isPending, send } = useSend(onDone);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        send(() => sendMessageAction(conversationId, { body: '', contactEmployeeId: String(data.get('employeeId') ?? '') }));
      }}
    >
      <FormMessage result={result} />
      <SelectField label="Colleague" name="employeeId" id="chat-contact" options={people} placeholder="Choose someone" required />
      <p className={styles.hint}>Shares their name, role, email and phone, with a button to message them.</p>
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Sending…' : 'Share contact'}
        </Button>
      </div>
    </form>
  );
}

function PollForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const { result, isPending, send } = useSend(onDone);
  const [options, setOptions] = useState(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        send(() => sendPollAction(conversationId, { question: String(data.get('question') ?? ''), options, allowsMultiple }));
      }}
    >
      <FormMessage result={result} />
      <TextField label="Question" name="question" id="chat-poll-question" required error={result.fieldErrors?.question} />
      <fieldset className={styles.options}>
        <legend className={styles.legend}>Options</legend>
        {options.map((option, index) => (
          <div key={index} className={styles.optionRow}>
            <input
              className={styles.optionInput}
              value={option}
              placeholder={`Option ${index + 1}`}
              aria-label={`Option ${index + 1}`}
              maxLength={120}
              onChange={(event) => setOptions((current) => current.map((value, at) => (at === index ? event.target.value : value)))}
            />
            {options.length > 2 && (
              <button
                type="button"
                className={styles.close}
                aria-label={`Remove option ${index + 1}`}
                onClick={() => setOptions((current) => current.filter((_, at) => at !== index))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {options.length < 12 && (
          <Button variant="ghost" onClick={() => setOptions((current) => [...current, ''])}>
            <Plus size={14} aria-hidden="true" /> Add option
          </Button>
        )}
        {result.fieldErrors?.options && <p className={styles.error}>{result.fieldErrors.options}</p>}
      </fieldset>
      <label className={styles.check}>
        <input type="checkbox" checked={allowsMultiple} onChange={(event) => setAllowsMultiple(event.target.checked)} />
        Allow more than one answer
      </label>
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Sending…' : 'Send poll'}
        </Button>
      </div>
    </form>
  );
}

function EventForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const { result, isPending, send } = useSend(onDone);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        send(() =>
          scheduleChatEventAction(conversationId, {
            title: String(data.get('title') ?? ''),
            date: String(data.get('date') ?? ''),
            startTime: String(data.get('startTime') ?? ''),
            endTime: String(data.get('endTime') ?? ''),
            meetingLink: String(data.get('meetingLink') ?? ''),
          }),
        );
      }}
    >
      <FormMessage result={result} />
      <TextField label="Event" name="title" id="chat-event-title" placeholder="Design review" required error={result.fieldErrors?.title} />
      <div className={styles.row}>
        <TextField label="Date" name="date" id="chat-event-date" type="date" defaultValue={todayInIndia()} required error={result.fieldErrors?.date} />
        <TextField label="Starts" name="startTime" id="chat-event-start" type="time" defaultValue="10:00" required error={result.fieldErrors?.startTime} />
        <TextField label="Ends" name="endTime" id="chat-event-end" type="time" defaultValue="10:30" required error={result.fieldErrors?.endTime} />
      </div>
      <TextField label="Meeting link (optional)" name="meetingLink" id="chat-event-link" type="url" placeholder="https://meet.google.com/…" error={result.fieldErrors?.meetingLink} />
      <p className={styles.hint}>Everyone in this conversation is invited and notified. It appears in their calendars.</p>
      <div className={dialogStyles.actions}>
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Scheduling…' : 'Schedule event'}
        </Button>
      </div>
    </form>
  );
}

// Takes a photo with the computer's camera. Phones use their own camera app instead.
function CameraCapture({ onPhoto, onUnavailable }: { onPhoto: (file: File) => void; onUnavailable: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Kept in a ref so the camera starts once, not on every redraw.
  const unavailableRef = useRef(onUnavailable);
  useEffect(() => {
    unavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: false })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        if (videoRef.current) videoRef.current.srcObject = granted;
      })
      .catch(() => setProblem('The camera could not be opened. Allow camera access for this site, or choose a photo instead.'));
    if (!navigator.mediaDevices?.getUserMedia) unavailableRef.current();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        onPhoto(new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className={styles.form}>
      {problem ? <FormMessage result={{ status: 'error', message: problem }} /> : null}
      <video ref={videoRef} autoPlay playsInline muted className={styles.camera} />
      <div className={dialogStyles.actions}>
        <Button variant="primary" onClick={capture} disabled={Boolean(problem)}>
          <Camera size={16} aria-hidden="true" /> Take photo
        </Button>
      </div>
    </div>
  );
}

// The "+" button beside the message box, with WhatsApp's choices. Each one works:
// files go through the normal upload, the rest are sent as cards.
export function ChatAttachMenu({ conversationId, people, canShareLinks, canSchedule, onFile }: ChatAttachMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Runs on click only, so reading the hidden inputs here is safe.
  function choose(key: ChoiceKey) {
    setMenuOpen(false);
    if (key === 'document') documentInput.current?.click();
    else if (key === 'media') mediaInput.current?.click();
    else if (key === 'audio') audioInput.current?.click();
    else if (key === 'camera') {
      // Phones and tablets open their camera app straight from a file input.
      const isTouch = window.matchMedia('(hover: none)').matches;
      if (isTouch || !navigator.mediaDevices?.getUserMedia) cameraInput.current?.click();
      else setDialog('camera');
    } else setDialog(key);
  }

  const close = () => setDialog(null);
  const shown = choices.filter((choice) => (choice.key !== 'link' || canShareLinks) && (choice.key !== 'event' || canSchedule));

  const fileChosen = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (file) onFile(file);
    input.value = '';
  };

  return (
    <div ref={menuRef} className={styles.wrapper}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Attach"
        title="Attach"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <Plus size={20} aria-hidden="true" />
      </button>

      {menuOpen && (
        <div className={styles.menu} role="menu" aria-label="Attach">
          {shown.map((choice) => (
            <button key={choice.key} type="button" role="menuitem" className={styles.item} onClick={() => choose(choice.key)}>
              <span className={styles.itemIcon} data-tone={choice.key} aria-hidden="true">
                {choice.icon}
              </span>
              {choice.label}
            </button>
          ))}
        </div>
      )}

      <input ref={documentInput} type="file" accept={pickers.document} className={styles.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => fileChosen(event.target)} />
      <input ref={mediaInput} type="file" accept={pickers.media} className={styles.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => fileChosen(event.target)} />
      <input ref={audioInput} type="file" accept={pickers.audio} className={styles.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => fileChosen(event.target)} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className={styles.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => fileChosen(event.target)} />

      <AttachDialog title="Share a link" open={dialog === 'link'} onClose={close}>
        <LinkForm conversationId={conversationId} onDone={close} />
      </AttachDialog>
      <AttachDialog title="Share a contact" open={dialog === 'contact'} onClose={close}>
        <ContactForm conversationId={conversationId} people={people} onDone={close} />
      </AttachDialog>
      <AttachDialog title="Create a poll" open={dialog === 'poll'} onClose={close}>
        <PollForm conversationId={conversationId} onDone={close} />
      </AttachDialog>
      <AttachDialog title="Schedule an event" open={dialog === 'event'} onClose={close}>
        <EventForm conversationId={conversationId} onDone={close} />
      </AttachDialog>
      <AttachDialog title="Take a photo" open={dialog === 'camera'} onClose={close}>
        <CameraCapture
          onPhoto={(file) => {
            onFile(file);
            close();
          }}
          onUnavailable={() => {
            close();
            cameraInput.current?.click();
          }}
        />
      </AttachDialog>
    </div>
  );
}
