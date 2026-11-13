import NextLink from 'next/link';
import type { ComponentProps } from 'react';

// The app's links. Next.js would otherwise fetch every link on screen in advance, and a
// page such as the task list holds about a hundred links. On the live site each of those
// fetches is a request Vercel counts. So links load when clicked, not in advance. A link
// that should still load ahead can pass prefetch={true}.
export function AppLink({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
