'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface NavbarProps {
  pendingCount?: number;
  userEmail?: string;
  avatarUrl?: string | null;
}

export default function Navbar({
  pendingCount = 0,
  userEmail,
  avatarUrl,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await fetch(`${apiUrl}/auth/logout`, { method: 'POST' });
    } catch {}
    localStorage.removeItem('nudge_token');
    document.cookie = 'nudge_token=; path=/; max-age=0';
    router.replace('/');
  };

  const navLinks = [
    { label: 'Pending Nudges', href: '/dashboard', count: pendingCount },
    { label: 'Dismissed', href: '/dashboard/dismissed' },
    { label: 'History', href: '/dashboard/history' },
    { label: 'Settings', href: '/settings' },
  ];

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.85rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link
            href="/dashboard"
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
              }}
            >
              ⚡
            </div>
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              Nudge
            </span>
          </Link>

          <nav style={{ display: 'flex', gap: '0.5rem' }}>
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: '0.5rem 0.9rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                    backgroundColor: isActive
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{link.label}</span>
                  {link.count !== undefined && link.count > 0 && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: '#6366f1',
                        color: '#ffffff',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                      }}
                    >
                      {link.count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="User"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '1px solid var(--border-subtle)',
              }}
            />
          ) : userEmail ? (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#818cf8',
              }}
            >
              {userEmail.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <button
            onClick={handleLogout}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}
