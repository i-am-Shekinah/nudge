import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nudge — Never miss an event in your inbox',
  description: 'AI-powered assistant that finds events in your emails and nudges you to add them to your calendar.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
