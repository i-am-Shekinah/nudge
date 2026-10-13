import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nudge — Never miss an event in your inbox',
    short_name: 'Nudge',
    description:
      'AI-powered assistant that finds events in your emails and nudges you to add them to your calendar.',
    id: '/',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#090d16',
    theme_color: '#090d16',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Review events',
        url: '/dashboard',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Settings',
        url: '/settings',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
