'use client';

import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon = '🎉',
  title,
  description,
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      className="glass-card"
      style={{
        padding: '3.5rem 2rem',
        textAlign: 'center',
        maxWidth: '520px',
        margin: '2rem auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.75rem',
          marginBottom: '0.5rem',
        }}
      >
        {icon}
      </div>

      <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
        {title}
      </h3>

      <p
        style={{
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          maxWidth: '380px',
        }}
      >
        {description}
      </p>

      {actionText && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: '1rem',
            padding: '0.65rem 1.25rem',
            backgroundColor: 'var(--accent-primary)',
            color: '#ffffff',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
