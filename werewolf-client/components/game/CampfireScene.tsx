'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import CharacterSprite, { type CharacterState } from '@/components/sprites/CharacterSprite';
import CampfireSprite from '@/components/sprites/CampfireSprite';
import { getColor } from '@/utils/ember-colors';

/* ═══════════ Types ═══════════ */

export interface CampfirePlayer {
  id: string;
  name: string;
  colorIdx: number;
  spriteSeed: number;
  role?: string;
  isAlive: boolean;
  isYou?: boolean;
  isGM?: boolean;
  model?: string;
  cost?: number;
}

export interface QueueItem {
  pid: string;
  status: 'queued' | 'current' | 'done';
}

export type GamePhase = 'day' | 'night' | 'voting' | 'results';

interface CampfireSceneProps {
  players: CampfirePlayer[];
  phase: GamePhase;
  speakingId?: string | null;
  deadIds: string[];
  votes?: Record<string, number>;
  speakerTrail?: string[];
  queue?: QueueItem[];
  msgCounts?: Record<string, number>;
  thinkingSecs?: number;
  revealDead?: boolean;
  selectedId?: string | null;
  onPlayerTap?: (player: CampfirePlayer) => void;
  mobileStrip?: boolean;
}

/* ═══════════ Component ═══════════ */

export default function CampfireScene({
  players,
  phase,
  speakingId,
  deadIds,
  votes,
  speakerTrail = [],
  queue = [],
  msgCounts = {},
  thinkingSecs = 0,
  revealDead = true,
  selectedId,
  onPlayerTap,
  mobileStrip = false,
}: CampfireSceneProps) {
  const alive = useMemo(() => players.filter(p => !p.isGM), [players]);
  const N = alive.length;
  const sceneRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{ p: CampfirePlayer; x: number; y: number } | null>(null);

  // Rotation state (in "seats", fractional)
  const [rot, setRot] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, startRot: 0 });

  // Auto-rotate to speaker
  useEffect(() => {
    if (dragging || !speakingId) return;
    const idx = alive.findIndex(p => p.id === speakingId);
    if (idx < 0) return;
    setRot(-idx);
  }, [speakingId, alive, dragging]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true);
    dragRef.current = { x: e.clientX, startRot: rot };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [rot]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.x;
    const w = sceneRef.current?.clientWidth || 400;
    const delta = (dx / (w * 1.5)) * N;
    setRot(dragRef.current.startRot + delta);
  }, [dragging, N]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // Elliptical positions
  const positions = useMemo(() => alive.map((_, i) => {
    const angle = ((i + rot) / N) * Math.PI * 2 - Math.PI / 2;
    const rx = 42;
    const ry = mobileStrip ? 22 : 24;
    const cx = 50;
    const cy = mobileStrip ? 56 : 62;
    return {
      left: cx + Math.cos(angle) * rx,
      top: cy + Math.sin(angle) * ry,
      z: Math.sin(angle),
      angle,
    };
  }), [N, rot, mobileStrip, alive]);

  // Next-speakers map from queue
  const nextSpeakers = useMemo(() => {
    const upcoming = queue.filter(q => q.status === 'queued').slice(0, 3);
    const map: Record<string, number> = {};
    upcoming.forEach((q, i) => { map[q.pid] = i + 1; });
    return map;
  }, [queue]);

  // Trail glow intensity
  const trailAlpha = useCallback((pid: string) => {
    const idx = speakerTrail.indexOf(pid);
    if (idx < 0) return 0;
    return [1.0, 0.55, 0.25][idx] || 0;
  }, [speakerTrail]);

  return (
    <div
      ref={sceneRef}
      className={`scene ${phase} ${mobileStrip ? 'mobile-strip' : ''}`}
      style={{
        position: 'relative',
        height: '100%',
        minHeight: mobileStrip ? 0 : 280,
        overflow: 'hidden',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Sky layers */}
      <div className="stars" />
      <div
        className="moon"
        style={mobileStrip ? { width: 32, height: 32, top: '8%', right: '6%' } : undefined}
      />
      <div
        className="sun"
        style={mobileStrip ? { width: 32, height: 32, top: '8%', right: '6%' } : undefined}
      />
      <div className="treeline" />
      <div className="ground" />

      {/* Rotation hint */}
      {!dragging && (
        <div
          style={{
            position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--f-pixel)', fontSize: mobileStrip ? 6 : 8,
            color: 'var(--ember-ink-3)', letterSpacing: 1,
            pointerEvents: 'none', opacity: 0.6,
          }}
        >
          ◂ DRAG TO ROTATE ▸
        </div>
      )}

      {/* Seat logs */}
      {positions.map((p, i) => {
        const scale = 0.85 + 0.3 * (p.z + 1) / 2;
        return (
          <div
            key={`log-${i}`}
            className="log"
            style={{
              left: `calc(${p.left}% - ${24 * scale}px)`,
              top: `calc(${p.top}% + ${24 * scale}px)`,
              transform: `scale(${scale})`,
            }}
          />
        );
      })}

      {/* Campfire center */}
      <div
        className="campfire"
        style={mobileStrip ? { width: 52, height: 52, top: '58%' } : undefined}
      >
        <div className="glow" />
        <div style={{ position: 'absolute', left: '50%', bottom: 0, transform: 'translateX(-50%)' }}>
          <CampfireSprite scale={mobileStrip ? 2.5 : 4} phase={phase} />
        </div>
        {phase !== 'night' && (
          <div className="sparks">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="spark"
                style={{
                  '--dx': `${(i % 3 - 1) * 20}px`,
                  animationDelay: `${i * 0.3}s`,
                  animationDuration: `${1.8 + (i % 3) * 0.4}s`,
                } as React.CSSProperties}
              />
            ))}
          </div>
        )}
      </div>

      {/* Characters */}
      {alive.map((player, i) => {
        const pos = positions[i];
        const baseScale = 0.82 + 0.35 * (pos.z + 1) / 2;
        const scale = mobileStrip ? baseScale * 0.7 : baseScale;
        const isDead = deadIds.includes(player.id);
        const isSpeaking = speakingId === player.id && !isDead;
        const isSelected = selectedId === player.id;
        const state: CharacterState = isDead ? 'dead' : (isSpeaking ? 'speaking' : 'idle');
        const color = getColor(player.colorIdx);
        const spriteScale = mobileStrip ? 1.9 : 2.6;
        const nextNum = nextSpeakers[player.id];
        const msgCount = msgCounts[player.id] || 0;
        const trailA = trailAlpha(player.id);
        const reveal = (isDead && revealDead) ? (player.role as 'werewolf' | 'doctor' | 'detective' | 'maniac' | null) ?? null : null;

        return (
          <div
            key={player.id}
            className={`seat ${isSpeaking ? 'speaking' : ''} ${isDead ? 'dead' : ''} ${player.isYou ? 'you' : ''}`}
            data-c={player.colorIdx}
            style={{
              left: `calc(${pos.left}% - 28px)`,
              top: `calc(${pos.top}% - 40px)`,
              transform: `scale(${scale})`,
              filter: [
                isSelected ? `drop-shadow(0 0 8px ${color})` : '',
                trailA > 0 && !isSpeaking ? `drop-shadow(0 0 ${6 * trailA}px rgba(255,183,71,${0.5 * trailA}))` : '',
              ].filter(Boolean).join(' ') || undefined,
              zIndex: isSpeaking ? 20 : (player.isYou ? 10 : Math.floor(pos.z * 5) + 5),
              transition: dragging ? 'none' : 'left 350ms ease-out, top 350ms ease-out, transform 350ms ease-out',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (onPlayerTap) onPlayerTap(player);
            }}
            onMouseEnter={(e) => {
              if (!mobileStrip) {
                setHoverInfo({ p: player, x: e.clientX, y: e.clientY });
              }
            }}
            onMouseLeave={() => setHoverInfo(null)}
          >
            {/* Message activity dots */}
            {!isDead && msgCount > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: mobileStrip ? -10 : -14,
                  left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 2,
                  pointerEvents: 'none',
                }}
              >
                {Array.from({ length: Math.min(msgCount, 5) }).map((_, k) => (
                  <div key={k} style={{ width: 3, height: 3, background: color, boxShadow: `0 0 3px ${color}` }} />
                ))}
                {msgCount > 5 && (
                  <div style={{ fontFamily: 'var(--f-pixel)', fontSize: 6, color, marginLeft: 2 }}>
                    +{msgCount - 5}
                  </div>
                )}
              </div>
            )}

            {/* Queue pip */}
            {nextNum && !isSpeaking && !isDead && (
              <div
                style={{
                  position: 'absolute',
                  top: mobileStrip ? -4 : -8, right: -8,
                  width: 16, height: 16,
                  background: 'var(--ember-bg-0)',
                  border: '2px solid var(--ember-fire-3)',
                  fontFamily: 'var(--f-pixel)',
                  fontSize: 8,
                  color: 'var(--ember-fire-4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              >
                {nextNum}
              </div>
            )}

            {/* Nameplate */}
            <div
              className="nameplate"
              style={mobileStrip ? { fontSize: 6, padding: '2px 3px' } : undefined}
            >
              {player.name.split(' ')[0]}
            </div>

            {/* Sprite */}
            <div className="sprite-wrap">
              <CharacterSprite
                seed={player.spriteSeed}
                color={color}
                state={state}
                scale={spriteScale}
                revealRole={reveal}
              />
            </div>

            {/* Thinking bubble */}
            {isSpeaking && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translate(-50%, -4px)',
                  background: 'var(--ember-bg-0)',
                  border: `2px solid ${color}`,
                  padding: '4px 6px',
                  fontFamily: 'var(--f-pixel)',
                  fontSize: mobileStrip ? 6 : 7,
                  color,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 30,
                }}
              >
                <span className="thinking" style={{ marginRight: 4 }}>
                  <span style={{ width: 3, height: 3, background: color }} />
                  <span style={{ width: 3, height: 3, background: color }} />
                  <span style={{ width: 3, height: 3, background: color }} />
                </span>
                {thinkingSecs}s
                <span
                  style={{
                    position: 'absolute', bottom: -6, left: '50%',
                    transform: 'translateX(-50%)',
                    width: 6, height: 6, background: color,
                  }}
                />
              </div>
            )}

            {/* "YOU" marker */}
            {player.isYou && !isSpeaking && <div className="you-marker">▲ YOU</div>}

            {/* Vote count badge */}
            {phase === 'voting' && votes && votes[player.id] && (
              <div
                style={{
                  position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--ember-blood-2)', border: '2px solid var(--ember-blood-3)',
                  fontFamily: 'var(--f-pixel)', fontSize: 8,
                  color: '#fff', padding: '2px 5px',
                  pointerEvents: 'none',
                }}
              >
                ▼ {votes[player.id]}
              </div>
            )}

            {/* Wolf eyes at night */}
            {phase === 'night' && player.role === 'werewolf' && !isDead && (
              <div
                style={{
                  position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: 4,
                  pointerEvents: 'none',
                }}
              >
                <div style={{ width: 3, height: 3, background: 'var(--ember-blood-3)', boxShadow: '0 0 5px var(--ember-blood-3)' }} />
                <div style={{ width: 3, height: 3, background: 'var(--ember-blood-3)', boxShadow: '0 0 5px var(--ember-blood-3)' }} />
              </div>
            )}
          </div>
        );
      })}

      {/* Hover card (desktop only) */}
      {hoverInfo && (() => {
        const rect = sceneRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = hoverInfo.x - rect.left + 16;
        const y = hoverInfo.y - rect.top - 120;
        const p = hoverInfo.p;
        const isDead = deadIds.includes(p.id);
        return (
          <div
            className="hover-card"
            data-c={p.colorIdx}
            style={{
              left: Math.min(x, rect.width - 220),
              top: Math.max(10, y),
            }}
          >
            <h4>{p.name}</h4>
            {p.model && (
              <div className="row">
                <span className="k">MODEL</span>
                <span>{p.model}</span>
              </div>
            )}
            <div className="row">
              <span className="k">STATUS</span>
              <span style={{ color: isDead ? 'var(--ember-blood-3)' : 'var(--ember-team-village)' }}>
                {isDead ? '✕ DEAD' : '● ALIVE'}
              </span>
            </div>
            {(p.isYou || isDead) && p.role && (
              <div className="row">
                <span className="k">ROLE</span>
                <span style={{ color: p.role === 'werewolf' ? 'var(--ember-blood-3)' : 'var(--ember-team-village)' }}>
                  {p.role.toUpperCase()}
                </span>
              </div>
            )}
            {!p.isYou && !isDead && (
              <div className="row">
                <span className="k">ROLE</span>
                <span style={{ color: 'var(--ember-ink-3)' }}>UNKNOWN</span>
              </div>
            )}
            {p.cost != null && p.cost > 0 && (
              <div className="row">
                <span className="k">COST</span>
                <span style={{ fontFamily: 'var(--f-console)' }}>${p.cost.toFixed(4)}</span>
              </div>
            )}
            <div style={{ fontFamily: 'var(--f-console)', fontSize: 12, color: 'var(--ember-ink-3)', marginTop: 6 }}>
              {speakingId === p.id ? '▸ speaking now' : `${msgCounts[p.id] || 0} msgs today`}
            </div>
          </div>
        );
      })()}

      {/* Night overlay text */}
      {phase === 'night' && (
        <div
          style={{
            position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--f-pixel)', fontSize: 9, color: 'var(--ember-moon-2)',
            letterSpacing: 2,
            animation: 'ember-pulse 2s ease-in-out infinite',
          }}
        >
          ☾ THE VILLAGE SLEEPS ☾
        </div>
      )}
    </div>
  );
}
