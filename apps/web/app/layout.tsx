import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration';
import { MobileAuthListener } from '../components/MobileAuthListener';

export const metadata: Metadata = {
  title: 'Nudge — Never miss an event in your inbox',
  description: 'AI-powered assistant that finds events in your emails and nudges you to add them to your calendar.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nudge',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#090d16',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegistration />
        <MobileAuthListener />
      </body>
    </html>
  );
}
