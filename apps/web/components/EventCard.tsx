'use client';

import React from 'react';

export interface DetectedEventItem {
  id: string;
  title: string;
  summary: string;
  eventType: string;
  emailSubject: string;
  emailSender: string;
  gmailLink: string;
  startAt: string | null;
  endAt: string | null;
  deadline: string | null;
  timezone: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'IGNORED' | 'EXPIRED' | 'ERROR';
  calendarError?: string | null;
}

interface EventCardProps {
  event: DetectedEventItem;
  viewMode?: 'dashboard' | 'dismissed' | 'history';
  onApprove?: (id: string) => void;
  onIgnore?: (id: string) => void;
  onUndo?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function EventCard({
  event,
  viewMode = 'dashboard',
  onApprove,
  onIgnore,
  onUndo,
  onDelete,
}: EventCardProps) {
  const eventDateStr = event.startAt || event.deadline;
  const formattedDate = eventDateStr
    ? new Date(eventDateStr).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Date not specified';

  const importanceBadge = {
    HIGH: { bg: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', label: 'High Priority' },
    MEDIUM: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', label: 'Medium' },
    LOW: { bg: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', label: 'Low' },
  }[event.importance];

  return (
    <div
      className="glass-card"
      style={{
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top Header: Badge, Date, Importance */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
            }}
          >
            {event.eventType}
          </span>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: importanceBadge.bg,
              color: importanceBadge.color,
              padding: '0.2rem 0.55rem',
              borderRadius: '6px',
            }}
          >
            {importanceBadge.label}
          </span>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#93c5fd', fontWeight: 500 }}>
          📅 {formattedDate}
        </div>
      </div>

      {/* Title */}
      <div>
        <h3
          style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            lineHeight: 1.3,
            color: '#f8fafc',
            marginBottom: '0.35rem',
          }}
        >
          {event.title}
        </h3>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {event.summary}
        </p>
      </div>

      {/* Email Provenance Metadata */}
      <div
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '0.65rem 0.85rem',
          fontSize: '0.8rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            From: <strong style={{ color: '#cbd5e1' }}>{event.emailSender}</strong>
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Subject: {event.emailSubject}
          </span>
        </div>

        <a
          href={event.gmailLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#818cf8',
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          View in Gmail ↗
        </a>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
        {viewMode === 'dashboard' && (
          <>
            <button
              onClick={() => onApprove?.(event.id)}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              ✓ Add to Google Calendar
            </button>
            <button
              onClick={() => onIgnore?.(event.id)}
              style={{
                padding: '0.65rem 1.1rem',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')
              }
            >
              Dismiss
            </button>
          </>
        )}

        {viewMode === 'dismissed' && (
          <>
            <button
              onClick={() => onUndo?.(event.id)}
              style={{
                flex: 1,
                padding: '0.65rem 1rem',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              ↩ Restore to Pending
            </button>
            <button
              onClick={() => onDelete?.(event.id)}
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#f87171',
                borderRadius: '8px',
                fontSize: '0.875rem',
              }}
            >
              Delete
            </button>
          </>
        )}

        {viewMode === 'history' && (
          <button
            onClick={() => onUndo?.(event.id)}
            style={{
              padding: '0.65rem 1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-secondary)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            ↩ Undo Approval (Return to Pending)
          </button>
        )}
      </div>
    </div>
  );
}
