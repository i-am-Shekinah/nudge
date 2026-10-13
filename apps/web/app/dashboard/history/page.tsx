'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import EventCard, { DetectedEventItem } from '../../../components/EventCard';
import EmptyState from '../../../components/EmptyState';
import { getToken } from '../../../lib/auth-token';
import { authFetch } from '../../../lib/api';

export default function HistoryPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DetectedEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchHistory = async () => {
    const token = await getToken();

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    try {
      const res = await authFetch('/events?status=HISTORY');
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
    fetchHistory();
  }, []);

  const handleUndoApproval = async (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('✓ Approval undone: event has been returned to your Pending Nudges');
    setTimeout(() => setNotice(null), 3500);

    try {
      await authFetch(`/events/${id}/undo`, { method: 'POST' });
    } catch {
      fetchHistory();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main className="page-main">
        {notice && <div className="notice-banner">{notice}</div>}

        <div className="page-header">
          <div>
            <h1 className="page-title">Event History</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              All approved, active, and completed calendar events. You can undo an approval to return it to pending.
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
            Loading history...
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No event history yet"
            description="Events you approve from your pending queue will appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                viewMode="history"
                onUndo={handleUndoApproval}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
