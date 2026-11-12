import type { MetadataRoute } from 'next';

// Lets the site be installed: on a phone's home screen (iPhones need this for push), and
// as the Android app built from it with PWABuilder, which reads these details.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Fixed, so the installed app stays the same app when the start page changes.
    id: '/overview',
    name: 'BMU Workspace',
    short_name: 'BMU Workspace',
    description: 'BMU Marketing’s workspace: tasks, calendar, chat, HR, finance and clients in one place.',
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f6f6f4',
    theme_color: '#1f6f5c',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/images/notification-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      // The logo inside the middle of the square, so Android can shape it as a circle or
      // a rounded square without cutting it off.
      { src: '/images/app-icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
