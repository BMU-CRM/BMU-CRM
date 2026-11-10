import { redirect } from 'next/navigation';

// Meetings are browsed on the calendar.
export default function MeetingsPage() {
  redirect('/calendar');
}
