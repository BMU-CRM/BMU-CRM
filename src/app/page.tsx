import { redirect } from 'next/navigation';

// The landing page has not been decided yet, so the site opens at sign-in.
export default function HomePage() {
  redirect('/overview');
}
