'use client';

import React from 'react';

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const handleGoogleSignIn = () => {
    window.location.href = `${apiUrl}/auth/google`;
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          padding: '1.25rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>⚡</span>
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Nudge
          </span>
        </div>

        <button
          onClick={handleGoogleSignIn}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '9999px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '0.875rem',
            fontWeight: 500,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface)')}
        >
          Sign In
        </button>
      </header>

      {/* Hero Section */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem 1.5rem 6rem',
          maxWidth: '1000px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.9rem',
            borderRadius: '9999px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            fontSize: '0.85rem',
            fontWeight: 500,
            marginBottom: '2rem',
          }}
        >
          <span>✨ Powered by Gemini 2.0 Flash</span>
        </div>

        {/* Main Headline */}
        <h1
          style={{
            fontSize: 'clamp(2.5rem, 5vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '1.5rem',
            background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Never miss an event <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            buried in your emails.
          </span>
        </h1>

        <p
          style={{
            fontSize: '1.15rem',
            color: 'var(--text-secondary)',
            maxWidth: '650px',
            lineHeight: 1.6,
            marginBottom: '2.5rem',
          }}
        >
          Nudge scans your Gmail for invites, flight confirmations, webinars, and deadlines, extracting the details and preparing Google Calendar entries for your one-click approval.
        </p>

        {/* Primary Google Auth CTA */}
        <div style={{ marginBottom: '3.5rem' }}>
          <button
            onClick={handleGoogleSignIn}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.85rem',
              padding: '0.9rem 2rem',
              borderRadius: '12px',
              backgroundColor: '#ffffff',
              color: '#111827',
              fontSize: '1rem',
              fontWeight: 600,
              boxShadow: '0 4px 20px -2px rgba(255, 255, 255, 0.15)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 25px -2px rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 20px -2px rgba(255, 255, 255, 0.15)';
            }}
          >
            {/* Google Icon SVG */}
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              marginTop: '0.85rem',
              display: 'flex',
              gap: '1.25rem',
              justifyContent: 'center',
            }}
          >
            <span>🔒 AES-256 encrypted</span>
            <span>•</span>
            <span>👁️ Read-only Gmail analysis</span>
            <span>•</span>
            <span>⚡ Human approval required</span>
          </div>
        </div>

        {/* Live Preview Card Demonstration */}
        <div
          className="glass-card glow-indigo"
          style={{
            maxWidth: '560px',
            width: '100%',
            padding: '1.5rem',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a5b4fc' }}>
                DETECTED EVENT
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                }}
              >
                98% Confidence
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              From: reservations@united.com
            </span>
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>
            Flight UA 428 — San Francisco (SFO) to New York (JFK)
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            📅 Friday, Sep 26, 2026 • 8:30 AM – 4:45 PM EDT
          </p>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              style={{
                flex: 1,
                padding: '0.65rem',
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              Add to Google Calendar
            </button>
            <button
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
