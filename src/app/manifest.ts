import type { MetadataRoute } from 'next';

// Lets the site be installed on a phone's home screen, which iPhones need for push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BMU Workspace',
    short_name: 'BMU Workspace',
    start_url: '/overview',
    display: 'standalone',
    background_color: '#f6f6f4',
    theme_color: '#1f6f5c',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/images/notification-icon.png', sizes: '192x192', type: 'image/png' },
    ],
  };
}
