import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'Company Workspace', template: '%s | Company Workspace' },
  description: 'Internal company operating platform.',
  robots: { index: false, follow: false },
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
