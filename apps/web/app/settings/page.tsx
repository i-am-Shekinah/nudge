'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { registerPushSubscription } from '../../lib/push';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Africa/Lagos',
  'Africa/Johannesburg',
];

export default function SettingsPage() {
  const router = useRouter();
  const [timezone, setTimezone] = useState('UTC');
  const [notificationTime, setNotificationTime] = useState('07:00');
  const [reminders, setReminders] = useState<number[]>([4320, 1440, 60, 30, 5]);
  const [newMinutes, setNewMinutes] = useState('');
  const [hasPush, setHasPush] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('nudge_token')
        : null;

    if (!token) {
      router.replace('/?error=unauthorized');
      return;
    }

    const fetchSettings = async () => {
      try {
        const res = await fetch(`${apiUrl}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
          setNotificationTime(data.notificationTime || '07:00');
          if (data.customReminders?.length) {
            setReminders(data.customReminders);
          }
          setHasPush(data.hasPushSubscription);
        }
      } catch (err: any) {
        setMessage(`Error loading settings: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [apiUrl, router]);

  const handleSaveTiming = async () => {
    const token = localStorage.getItem('nudge_token');
    try {
      const res = await fetch(`${apiUrl}/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timezone, notificationTime }),
      });

      if (res.ok) {
        setMessage('✓ Timezone and notification time updated');
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err: any) {
      setMessage(`Save failed: ${err.message}`);
    }
  };

  const handleAddReminder = async () => {
    const mins = parseInt(newMinutes, 10);
    if (isNaN(mins) || mins <= 0 || reminders.includes(mins)) {
      return;
    }

    const updated = [...reminders, mins].sort((a, b) => b - a);
    setReminders(updated);
    setNewMinutes('');

    const token = localStorage.getItem('nudge_token');
    await fetch(`${apiUrl}/settings/reminders`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reminders: updated }),
    });

    setMessage('✓ Custom reminder added');
    setTimeout(() => setMessage(null), 2500);
  };

  const handleRemoveReminder = async (minToRemove: number) => {
    const updated = reminders.filter((m) => m !== minToRemove);
    setReminders(updated);

    const token = localStorage.getItem('nudge_token');
    await fetch(`${apiUrl}/settings/reminders`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reminders: updated }),
    });
  };

  const handleResetReminders = async () => {
    const token = localStorage.getItem('nudge_token');
    const res = await fetch(`${apiUrl}/settings/reminders/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setReminders(data.customReminders || [4320, 1440, 60, 30, 5]);
      setMessage('✓ Restored default reminder presets');
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const handleEnablePush = async () => {
    const token = localStorage.getItem('nudge_token') || undefined;
    const success = await registerPushSubscription(apiUrl, token);
    if (success) {
      setHasPush(true);
      setMessage('✓ Web Push notifications enabled');
    } else {
      setMessage('Push permission was not granted or is not supported by your browser');
    }
    setTimeout(() => setMessage(null), 4000);
  };

  const formatMinutes = (minutes: number) => {
    if (minutes >= 1440) {
      const days = Math.floor(minutes / 1440);
      return `${days} day${days > 1 ? 's' : ''} before`;
    }
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours} hour${hours > 1 ? 's' : ''} before`;
    }
    return `${minutes} min${minutes > 1 ? 's' : ''} before`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      <main
        style={{
          flex: 1,
          maxWidth: '850px',
          width: '100%',
          margin: '0 auto',
          padding: '2.5rem 1.5rem 5rem',
        }}
      >
        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              marginBottom: '0.35rem',
            }}
          >
            Settings & Preferences
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Configure your timezone, notification briefing time, and Google Calendar reminder presets.
          </p>
        </div>

        {message && (
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
            {message}
          </div>
        )}

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading your settings...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Card 1: Timezone & Notification Time */}
            <div className="glass-card" style={{ padding: '1.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Schedule & Timezone
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Determines when your nightly scan runs (midnight local) and when your morning email brief arrives.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: '#cbd5e1' }}>
                    Your Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                    }}
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz} style={{ backgroundColor: '#111827' }}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: '#cbd5e1' }}>
                    Morning Briefing Time
                  </label>
                  <input
                    type="time"
                    value={notificationTime}
                    onChange={(e) => setNotificationTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleSaveTiming}
                style={{
                  padding: '0.65rem 1.25rem',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                Save Schedule
              </button>
            </div>

            {/* Card 2: Google Calendar Reminders */}
            <div className="glass-card" style={{ padding: '1.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                    Google Calendar Reminders
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    These popup reminder intervals are injected into each event approved by you.
                  </p>
                </div>
                <button
                  onClick={handleResetReminders}
                  style={{
                    fontSize: '0.8rem',
                    color: '#818cf8',
                    textDecoration: 'underline',
                    padding: '0.3rem 0.5rem',
                  }}
                >
                  Restore Defaults (3d, 1d, 1h, 30m, 5m)
                </button>
              </div>

              {/* Chips list */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {reminders.map((mins) => (
                  <div
                    key={mins}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: '#c7d2fe',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                    }}
                  >
                    <span>🔔 {formatMinutes(mins)}</span>
                    <button
                      onClick={() => handleRemoveReminder(mins)}
                      style={{
                        color: '#94a3b8',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: '0 0.2rem',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add custom reminder form */}
              <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '350px' }}>
                <input
                  type="number"
                  placeholder="Minutes before (e.g. 15)"
                  value={newMinutes}
                  onChange={(e) => setNewMinutes(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.6rem 0.85rem',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  onClick={handleAddReminder}
                  style={{
                    padding: '0.6rem 1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}
                >
                  Add Reminder
                </button>
              </div>
            </div>

            {/* Card 3: Browser Push Notifications */}
            <div className="glass-card" style={{ padding: '1.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Web Push Notifications
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Receive instant browser alerts when important event deadlines or flight bookings are detected.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: hasPush ? '#34d399' : '#94a3b8',
                    }}
                  />
                  <span style={{ fontSize: '0.9rem', color: hasPush ? '#34d399' : 'var(--text-muted)' }}>
                    {hasPush ? 'Active on this device' : 'Not yet enabled'}
                  </span>
                </div>

                {!hasPush && (
                  <button
                    onClick={handleEnablePush}
                    style={{
                      padding: '0.6rem 1.1rem',
                      backgroundColor: 'var(--accent-primary)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                    }}
                  >
                    Enable Push Notifications
                  </button>
                )}
              </div>
            </div>

            {/* Card 4: Auto-Deletion Policy Disclosure */}
            <div
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#a5b4fc', marginBottom: '0.4rem' }}>
                🛡️ Privacy & Auto-Deletion Policy
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6 }}>
                Nudge strictly analyzes email headers and short snippets to detect calendar events—we never store your raw email bodies. To keep your database uncluttered and protect your privacy, actionable events are retained for exactly 7 days after the event date, after which they are automatically purged.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
