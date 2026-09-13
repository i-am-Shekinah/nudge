'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import EventCard, { DetectedEventItem } from '../../../components/EventCard';
import EmptyState from '../../../components/EmptyState';

export default function DismissedPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DetectedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const fetchDismissed = async () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('nudge_token')
        : null;

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/events?status=IGNORED`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err: any) {
      setNotice(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDismissed();
  }, []);

  const handleRestore = async (id: string) => {
    const token = localStorage.getItem('nudge_token');
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('✓ Event restored to your Pending Nudges dashboard');
    setTimeout(() => setNotice(null), 3000);

    try {
      await fetch(`${apiUrl}/events/${id}/undo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      fetchDismissed();
    }
  };

  const handleDelete = async (id: string) => {
    const token = localStorage.getItem('nudge_token');
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('Event permanently deleted');
    setTimeout(() => setNotice(null), 3000);

    try {
      await fetch(`${apiUrl}/events/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      fetchDismissed();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main
        style={{
          flex: 1,
          maxWidth: '1000px',
          width: '100%',
          margin: '0 auto',
          padding: '2.5rem 1.5rem 5rem',
        }}
      >
        {notice && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '0.85rem 1.25rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: '#c7d2fe',
              fontSize: '0.9rem',
            }}
          >
            {notice}
          </div>
        )}

        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '0.35rem',
            }}
          >
            Dismissed Events
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Events you chose not to add to your calendar. You can restore them back to pending at any time.
          </p>
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
