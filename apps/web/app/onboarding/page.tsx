'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ScanState {
  status: 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED';
  emailsScanned: number;
  eventsDetected: number;
  errorMessage?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [scanState, setScanState] = useState<ScanState>({
    status: 'IDLE',
    emailsScanned: 0,
    eventsDetected: 0,
  });
  const [logs, setLogs] = useState<string[]>([
    'Secure connection to Gmail established.',
    'Requesting 7-day email metadata window...',
  ]);

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

    let isSubscribed = true;

    // 1. Trigger backfill
    const triggerBackfill = async () => {
      try {
        setLogs((prev) => [...prev, 'Initiating background backfill scan...']);
        const res = await fetch(`${apiUrl}/gmail/backfill`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.alreadyDone) {
            setLogs((prev) => [
              ...prev,
              'Backfill already completed. Redirecting to dashboard...',
            ]);
            setTimeout(() => router.replace('/dashboard'), 1500);
            return;
          }
        }
        setScanState((prev) => ({ ...prev, status: 'RUNNING' }));
      } catch (err: any) {
        setLogs((prev) => [...prev, `Scan trigger notice: ${err.message}`]);
      }
    };

    triggerBackfill();

    // 2. Poll progress every 2.5s
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;

      try {
        const res = await fetch(`${apiUrl}/scans/latest`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const scan = data.scan;
          if (scan) {
            setScanState({
              status: scan.status,
              emailsScanned: scan.emailsScanned || 0,
              eventsDetected: scan.eventsDetected || 0,
              errorMessage: scan.errorMessage,
            });

            if (scan.status === 'RUNNING') {
              setLogs((prev) => {
                const updateMsg = `Scanned ${scan.emailsScanned} candidate emails...`;
                return prev.includes(updateMsg) ? prev : [...prev, updateMsg];
              });
            } else if (scan.status === 'DONE') {
              setLogs((prev) => [
                ...prev,
                `Scan complete! Found ${scan.eventsDetected} actionable events.`,
                'Ready to review. Redirecting...',
              ]);
              clearInterval(pollInterval);
              setTimeout(() => {
                router.replace('/dashboard');
              }, 2000);
            } else if (scan.status === 'FAILED') {
              setLogs((prev) => [
                ...prev,
                `Scan encountered an issue: ${scan.errorMessage || 'Unknown error'}`,
              ]);
              clearInterval(pollInterval);
            }
          }
        }
      } catch (err) {
        // network polling error, retry on next tick
      }
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    };
  }, [apiUrl, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        className="glass-card glow-indigo"
        style={{
          maxWidth: '600px',
          width: '100%',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Animated radar/spinner */}
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1.5rem',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: '#6366f1',
              animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite',
            }}
          />
          <span style={{ fontSize: '1.75rem' }}>✨</span>
        </div>

        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: '0.5rem',
          }}
        >
          {scanState.status === 'DONE'
            ? 'Inbox Scan Complete!'
            : 'Analyzing your past 7 days...'}
        </h1>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.95rem',
            lineHeight: 1.5,
            marginBottom: '2rem',
          }}
        >
          Nudge is looking through your emails to discover webinars, interviews, flight bookings, and deadlines.
        </p>

        {/* Real-time stats metric counter */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.25rem 1rem',
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#818cf8',
                lineHeight: 1,
                marginBottom: '0.4rem',
              }}
            >
              {scanState.emailsScanned}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Emails Scanned
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '1.25rem 1rem',
            }}
          >
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: '#34d399',
                lineHeight: 1,
                marginBottom: '0.4rem',
              }}
            >
              {scanState.eventsDetected}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Events Detected
            </div>
          </div>
        </div>

        {/* Live Terminal Log Stream */}
        <div
          style={{
            backgroundColor: '#070a11',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            padding: '1rem',
            textAlign: 'left',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            color: '#94a3b8',
            maxHeight: '140px',
            overflowY: 'auto',
            marginBottom: '1.5rem',
            lineHeight: 1.6,
          }}
        >
          {logs.map((log, index) => (
            <div key={index} style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ color: '#6366f1' }}>›</span>
              <span>{log}</span>
            </div>
          ))}
        </div>

        {/* Manual continue button fallback */}
        <button
          onClick={() => router.replace('/dashboard')}
          style={{
            width: '100%',
            padding: '0.85rem',
            borderRadius: '10px',
            backgroundColor:
              scanState.status === 'DONE'
                ? 'var(--accent-primary)'
                : 'rgba(255, 255, 255, 0.05)',
            color: scanState.status === 'DONE' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {scanState.status === 'DONE'
            ? 'Go to My Dashboard →'
            : 'Skip to Dashboard'}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
