'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setToken } from '../../../lib/auth-token';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // The API now sends the token in the URL fragment (never reaches server
    // logs); the query fallback keeps in-flight logins working during rollout.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hashParams.get('token') ?? searchParams.get('token');
    const isNewUser =
      hashParams.get('isNewUser') ?? searchParams.get('isNewUser');

    if (token) {
      void (async () => {
        await setToken(token);

        // Redirect to onboarding for new users, or directly to dashboard
        if (isNewUser === 'true') {
          router.replace('/onboarding');
        } else {
          router.replace('/dashboard');
        }
      })();
    } else {
      // Missing token, redirect back to landing
      router.replace('/?error=auth_failed');
    }
  }, [router, searchParams]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          border: '3px solid rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366f1',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '1.5rem',
        }}
      />
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Authenticating with Google...
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
        Securing your session and connecting your inbox.
      </p>

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

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        >
          Loading...
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
