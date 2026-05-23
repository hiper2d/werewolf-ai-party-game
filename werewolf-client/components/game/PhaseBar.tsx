'use client';

import React from 'react';
import type { GamePhase } from './CampfireScene';

/* ═══════════ Types ═══════════ */

export type VoteUrgency = 'normal' | 'warning' | 'urgent';

interface PhaseBarProps {
  phase: GamePhase;
  day: number;
  messageCount: number;
  totalCost?: number;
  isProcessing?: boolean;
  voteUrgency?: VoteUrgency;
  onAction?: (action: string) => void;
}

/* ═══════════ Constants ═══════════ */

const PHASE_LABELS: Record<GamePhase, string> = {
  day: 'DAY DISCUSSION',
  night: 'NIGHT · WOLVES HUNT',
  voting: 'VOTING PHASE',
  results: 'RESULTS',
};

const PHASE_LABELS_SHORT: Record<GamePhase, string> = {
  day: 'DAY',
  night: 'NIGHT',
  voting: 'VOTE',
  results: 'RESULT',
};

const PHASE_ICONS: Record<GamePhase, string> = {
  day: '☀',
  night: '☾',
  voting: '▼',
  results: '★',
};

/* ═══════════ Component ═══════════ */

export default function PhaseBar({
  phase,
  day,
  messageCount,
  totalCost,
  isProcessing = false,
  voteUrgency = 'normal',
  onAction,
}: PhaseBarProps) {
  const handleAction = (action: string) => {
    if (onAction) onAction(action);
  };

  return (
    <div
      className="topbar"
      style={{
        background: 'var(--ember-bg-0)',
        borderBottom: '2px solid var(--ember-border)',
        flexWrap: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {/* Day counter */}
      <div className="daycount" style={{ whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--ember-fire-4)' }}>◆</span>{' '}
        DAY {String(day).padStart(2, '0')}
      </div>

      {/* Phase pill */}
      <div className={`phase-pill ${phase}`} style={{ whiteSpace: 'nowrap' }}>
        <span>{PHASE_ICONS[phase]}</span>
        <span className="desktop-only">{PHASE_LABELS[phase]}</span>
        <span className="mobile-only" style={{ display: 'none' }}>{PHASE_LABELS_SHORT[phase]}</span>
      </div>

      {/* Message stats */}
      <div
        className="desktop-only"
        style={{
          fontFamily: 'var(--f-console)',
          color: 'var(--ember-ink-2)',
          fontSize: 14,
          whiteSpace: 'nowrap',
        }}
      >
        {messageCount} MSGS
        {totalCost != null && totalCost > 0 && (
          <> · <span style={{ color: 'var(--ember-fire-4)' }}>${totalCost.toFixed(4)}</span></>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1, minWidth: 0 }} />

      {/* Phase-contextual action buttons */}
      {phase === 'day' && !isProcessing && (
        <>
          <button
            className="pbtn pbtn-ghost pbtn-sm desktop-only"
            onClick={() => handleAction('keep-going')}
          >
            KEEP GOING
          </button>
          <VoteButton urgency={voteUrgency} onClick={() => handleAction('vote')} />
        </>
      )}

      {phase === 'voting' && (
        <button
          className="pbtn pbtn-danger pbtn-sm"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => handleAction('execute')}
        >
          EXECUTE
        </button>
      )}

      {phase === 'night' && (
        <button
          className="pbtn pbtn-primary pbtn-sm"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => handleAction('wake')}
        >
          WAKE ▸
        </button>
      )}

      {phase === 'results' && (
        <button
          className="pbtn pbtn-primary pbtn-sm"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => handleAction('next-day')}
        >
          NEXT DAY ▸
        </button>
      )}
    </div>
  );
}

/* ═══════════ Sub-components ═══════════ */

function VoteButton({ urgency, onClick }: { urgency: VoteUrgency; onClick: () => void }) {
  if (urgency === 'urgent') {
    return (
      <button
        className="pbtn pbtn-danger pbtn-sm"
        style={{
          whiteSpace: 'nowrap',
          animation: 'ember-pulse 1s ease-in-out infinite',
        }}
        onClick={onClick}
      >
        CALL VOTE ⚠
      </button>
    );
  }

  if (urgency === 'warning') {
    return (
      <button
        className="pbtn pbtn-sm"
        style={{
          whiteSpace: 'nowrap',
          background: 'linear-gradient(180deg, var(--ember-fire-5), var(--ember-fire-4))',
          borderColor: 'var(--ember-fire-5)',
          color: '#1a0a00',
        }}
        onClick={onClick}
      >
        CALL VOTE ⚠
      </button>
    );
  }

  return (
    <button
      className="pbtn pbtn-primary pbtn-sm"
      style={{ whiteSpace: 'nowrap' }}
      onClick={onClick}
    >
      CALL VOTE ▸
    </button>
  );
}
