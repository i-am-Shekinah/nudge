'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { registerPushSubscription } from '../../lib/push';
import { getToken, clearToken } from '../../lib/auth-token';
import { API_URL, authFetch } from '../../lib/api';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await authFetch('/auth/account', { method: 'DELETE' });
      if (res.ok) {
        await clearToken();
        router.replace('/');
        return;
      }
      setMessage('Could not delete your account. Please try again.');
    } catch {
      setMessage('Could not reach the server. Please try again.');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const legalLinkStyle: React.CSSProperties = {
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: '0.9rem',
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const fetchSettings = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await authFetch('/settings');
      if (res.ok) {
        const data = await res.json();
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        setNotificationTime(data.notificationTime || '07:00');
        if (data.customReminders?.length) {
          setReminders(data.customReminders);
        }
        setHasPush(data.hasPushSubscription);
      }
    } catch (err) {
      setMessage(
        `Error loading settings: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const token = await getToken();

      if (!token) {
        router.replace('/?error=unauthorized');
        return;
      }

      await fetchSettings();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleSaveTiming = async () => {
    try {
      const res = await authFetch('/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, notificationTime }),
      });

      if (res.ok) {
        setMessage('✓ Timezone and notification time updated');
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (err) {
      setMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
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

    await authFetch('/settings/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminders: updated }),
    });

    setMessage('✓ Custom reminder added');
    setTimeout(() => setMessage(null), 2500);
  };

  const handleRemoveReminder = async (minToRemove: number) => {
    const updated = reminders.filter((m) => m !== minToRemove);
    setReminders(updated);

    await authFetch('/settings/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminders: updated }),
    });
  };

  const handleResetReminders = async () => {
    const res = await authFetch('/settings/reminders/reset', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setReminders(data.customReminders || [4320, 1440, 60, 30, 5]);
      setMessage('✓ Restored default reminder presets');
      setTimeout(() => setMessage(null), 2500);
    }
  };

  const handleEnablePush = async () => {
    const token = (await getToken()) || undefined;
    const success = await registerPushSubscription(API_URL, token);
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

      <main className="page-main" style={{ maxWidth: '850px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 className="page-title">Settings & Preferences</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Configure your timezone, notification briefing time, and Google Calendar reminder presets.
          </p>
        </div>

        {message && <div className="notice-banner">{message}</div>}

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading your settings...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Card 1: Timezone & Notification Time */}
            <div className="glass-card card-pad">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Schedule & Timezone
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Determines when your nightly scan runs (midnight local) and when your morning email brief arrives.
              </p>

              <div className="settings-grid">
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
            <div className="glass-card card-pad">
              <div className="card-row-wrap" style={{ marginBottom: '1rem' }}>
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
              <div className="reminder-form">
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
            <div className="glass-card card-pad">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                Web Push Notifications
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                Receive instant browser alerts when important event deadlines or flight bookings are detected.
              </p>

              <div className="card-row-wrap" style={{ alignItems: 'center' }}>
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

            {/* Card 5: Legal */}
            <div className="glass-card card-pad">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                Legal
              </h2>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                <a
                  href="/privacy/"
                  style={legalLinkStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                >
                  Privacy Policy →
                </a>
                <a
                  href="/terms/"
                  style={legalLinkStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                >
                  Terms of Service →
                </a>
              </div>
            </div>

            {/* Card 6: Danger Zone */}
            <div
              style={{
                padding: '1.5rem',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f87171', marginBottom: '0.4rem' }}>
                Delete account
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6, marginBottom: '1rem' }}>
                Permanently removes your Nudge account: profile, detected events,
                sessions and notification subscriptions. Nudge&apos;s access to your
                Google account is revoked. Calendar events you approved stay on
                your calendar. This cannot be undone.
              </p>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    padding: '0.6rem 1.1rem',
                    backgroundColor: 'transparent',
                    color: '#f87171',
                    border: '1px solid #f87171',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Delete my account
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    style={{
                      padding: '0.6rem 1.1rem',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: deleting ? 'wait' : 'pointer',
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      padding: '0.6rem 1.1rem',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid rgba(148, 163, 184, 0.4)',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
