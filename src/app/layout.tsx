import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'BMU Workspace', template: '%s | BMU Workspace' },
  description: 'Internal company operating platform.',
  robots: { index: false, follow: false },
};

// On a phone the on-screen keyboard makes the page shorter instead of covering it, so a
// message box at the bottom, such as in chat, moves up above the keyboard while typing.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get('theme')?.value;
  const theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : undefined;

  return (
    <html lang="en" data-theme={theme} className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
