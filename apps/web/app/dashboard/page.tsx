'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import EventCard, { DetectedEventItem } from '../../components/EventCard';
import EmptyState from '../../components/EmptyState';
import { getToken } from '../../lib/auth-token';
import { authFetch } from '../../lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [events, setEvents] = useState<DetectedEventItem[]>([]);
  const [user, setUser] = useState<{ email: string; avatarUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchDashboardData = async () => {
    const token = await getToken();

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    try {
      // Fetch user profile
      const userRes = await authFetch('/auth/me');
      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData);
      }

      // Fetch pending events
      const eventsRes = await authFetch('/events?status=PENDING');
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      setNotice(
        `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleApprove = async (id: string) => {
    // Optimistic UI removal
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('✓ Event approved and queued for Google Calendar sync');
    setTimeout(() => setNotice(null), 3500);

    try {
      await authFetch(`/events/${id}/approve`, { method: 'POST' });
    } catch (err) {
      fetchDashboardData(); // Revert on failure
    }
  };

  const handleIgnore = async (id: string) => {
    // Optimistic UI removal
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setNotice('Event dismissed (visible in Dismissed view)');
    setTimeout(() => setNotice(null), 3500);

    try {
      await authFetch(`/events/${id}/ignore`, { method: 'POST' });
    } catch (err) {
      fetchDashboardData();
    }
  };

  const handleScanNow = async () => {
    setScanning(true);
    setNotice('Scanning your inbox for new events…');
    try {
      const res = await authFetch('/scans/run-now', { method: 'POST' });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setNotice(
          data?.message || 'Could not start the scan. Please try again.',
        );
        setTimeout(() => setNotice(null), 7000);
        setScanning(false);
        return;
      }

      // Poll until the scan reaches a terminal state (bounded to 5 min)
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const latest = await authFetch('/scans/latest');
        if (!latest.ok) continue;
        const { scan } = await latest.json();
        if (scan && (scan.status === 'DONE' || scan.status === 'FAILED')) {
          await fetchDashboardData();
          setNotice(
            scan.status === 'DONE'
              ? `Scan complete — ${scan.eventsDetected} ${scan.eventsDetected === 1 ? 'event' : 'events'} detected.`
              : `This scan hit a problem (${scan.errorMessage || 'unknown'}). No mail is lost — it will retry automatically at midnight.`,
          );
          setTimeout(() => setNotice(null), 8000);
          setScanning(false);
          return;
        }
      }
      setNotice('The scan is taking longer than usual — results will appear here shortly.');
    } catch (err) {
      setNotice(
        `Connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        pendingCount={events.length}
        userEmail={user?.email}
        avatarUrl={user?.avatarUrl}
      />

      <main className="page-main">
        {/* Banner notification */}
        {notice && (
          <div
            className="notice-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
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
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Pending Nudges
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Actionable events detected in your recent emails awaiting your approval.
            </p>
          </div>

          <div className="header-actions">
            <button
              onClick={handleScanNow}
              disabled={scanning}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                backgroundColor: scanning
                  ? 'rgba(99, 102, 241, 0.25)'
                  : 'var(--accent-primary)',
                border: '1px solid var(--border-subtle)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: scanning ? 'default' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbf24" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {scanning ? 'Scanning…' : 'Scan Now'}
            </button>

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
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>
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
            description="No pending events awaiting decision. Hit ⚡ Scan Now to check your inbox, or let Nudge scan automatically at midnight."
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
