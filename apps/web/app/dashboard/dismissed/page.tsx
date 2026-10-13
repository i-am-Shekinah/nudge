'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import EventCard, { DetectedEventItem } from '../../../components/EventCard';
import EmptyState from '../../../components/EmptyState';
import { getToken } from '../../../lib/auth-token';
import { authFetch } from '../../../lib/api';

export default function DismissedPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DetectedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchDismissed = async () => {
    const token = await getToken();

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    try {
      const res = await authFetch('/events?status=IGNORED');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      setNotice(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDismissed();
  }, []);

  const handleRestore = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('✓ Event restored to your Pending Nudges dashboard');
    setTimeout(() => setNotice(null), 3000);

    try {
      await authFetch(`/events/${id}/undo`, { method: 'POST' });
    } catch {
      fetchDismissed();
    }
  };

  const handleDelete = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('Event permanently deleted');
    setTimeout(() => setNotice(null), 3000);

    try {
      await authFetch(`/events/${id}`, { method: 'DELETE' });
    } catch {
      fetchDismissed();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main className="page-main">
        {notice && <div className="notice-banner">{notice}</div>}

        <div className="page-header">
          <div>
            <h1 className="page-title">Dismissed Events</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Events you chose not to add to your calendar. You can restore them back to pending at any time.
            </p>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              padding: '4rem',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            Loading dismissed events...
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="🗑️"
            title="No dismissed events"
            description="Events you dismiss from your pending queue will be stored safely here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                viewMode="dismissed"
                onUndo={handleRestore}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
