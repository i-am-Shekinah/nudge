'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import EventCard, { DetectedEventItem } from '../../components/EventCard';
import EmptyState from '../../components/EmptyState';

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DetectedEventItem[]>([]);
  const [user, setUser] = useState<{ email: string; avatarUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const fetchDashboardData = async () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('nudge_token')
        : null;

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    try {
      // Fetch user profile
      const userRes = await fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      // Fetch pending events
      const eventsRes = await fetch(`${apiUrl}/events?status=PENDING`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
    } catch (err: any) {
      setNotice(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleApprove = async (id: string) => {
    const token = localStorage.getItem('nudge_token');
    // Optimistic UI removal
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('✓ Event approved and queued for Google Calendar sync');
    setTimeout(() => setNotice(null), 3500);

    try {
      await fetch(`${apiUrl}/events/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      fetchDashboardData(); // Revert on failure
    }
  };

  const handleIgnore = async (id: string) => {
    const token = localStorage.getItem('nudge_token');
    // Optimistic UI removal
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('Event dismissed (visible in Dismissed view)');
    setTimeout(() => setNotice(null), 3500);

    try {
      await fetch(`${apiUrl}/events/${id}/ignore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      fetchDashboardData();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        pendingCount={events.length}
        userEmail={user?.email}
        avatarUrl={user?.avatarUrl}
      />

      <main
        style={{
          flex: 1,
          maxWidth: '1000px',
          width: '100%',
          margin: '0 auto',
          padding: '2.5rem 1.5rem 5rem',
        }}
      >
        {/* Banner notification */}
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              style={{ color: '#a5b4fc', fontSize: '1rem', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Page Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginBottom: '0.35rem',
              }}
            >
              Pending Nudges
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Actionable events detected in your recent emails awaiting your approval.
            </p>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              fetchDashboardData();
            }}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Events List */}
        {loading ? (
          <div
            style={{
              padding: '4rem',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            Loading your detected events...
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="✨"
            title="All caught up!"
            description="No pending events awaiting decision. Nudge will automatically scan incoming emails tonight at midnight."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                viewMode="dashboard"
                onApprove={handleApprove}
                onIgnore={handleIgnore}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
