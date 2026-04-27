// Chat page components
const { useState, useRef, useEffect, useMemo } = React;

// ---------- Icon set ----------
const Icons = {
  Moon: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M13 9.5A5 5 0 0 1 6.5 3a.5.5 0 0 0-.7-.5 6 6 0 1 0 7.7 7.7.5.5 0 0 0-.5-.7z"/>
    </svg>
  ),
  Sun: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <circle cx="8" cy="8" r="3"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M14.5 8h-1.2M2.7 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9"/>
    </svg>
  ),
  Chat: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <path d="M3 4.5h10A1.5 1.5 0 0 1 14.5 6v4.5A1.5 1.5 0 0 1 13 12H6.5L3.5 14.5V12A1.5 1.5 0 0 1 2 10.5V6A1.5 1.5 0 0 1 3.5 4.5H3z"/>
    </svg>
  ),
  Speaker: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h2.5L9 3v10L5.5 10H3z"/>
      <path d="M11.5 5.5a3.5 3.5 0 0 1 0 5"/>
    </svg>
  ),
  SpeakerSm: (p) => (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2.5 5h2L7 3v8L4.5 9h-2z"/>
      <path d="M9.5 5a2.5 2.5 0 0 1 0 4"/>
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}>
      <rect x="6" y="2" width="4" height="8" rx="2"/>
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v1.5"/>
    </svg>
  ),
  Bolt: (p) => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M9 2L3 9.5h3.5L7 14l6-7.5H9.5z"/>
    </svg>
  ),
  Lightbulb: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}>
      <path d="M5.5 9.5a3.5 3.5 0 1 1 5 0c-.5.5-1 1-1 2v.5h-3v-.5c0-1-.5-1.5-1-2z"/>
      <path d="M6.5 13.5h3"/>
    </svg>
  ),
  Vote: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2.5 9.5l3 3 8-8"/>
    </svg>
  ),
  Send: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 2L2 7.5l5 1.5L9 14l5-12z"/>
      <path d="M7 9l4-4"/>
    </svg>
  ),
  GoOn: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 3l5 5-5 5"/>
      <path d="M11 3v10"/>
    </svg>
  ),
  X: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...p}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
    </svg>
  ),
  Trash: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2.5 4h11M5.5 4V2.5h5V4M4 4l.5 9a1.5 1.5 0 0 0 1.5 1.5h4A1.5 1.5 0 0 0 11.5 13L12 4"/>
    </svg>
  ),
  Cut: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="4" cy="11" r="2"/>
      <circle cx="12" cy="11" r="2"/>
      <path d="M5.5 9.5L13 2M10.5 9.5L3 2"/>
    </svg>
  ),
  Forward: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 8h10M9 4l4 4-4 4"/>
    </svg>
  ),
  Expand: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-5 5M2.5 13.5l5-5"/>
    </svg>
  ),
  Collapse: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M14 6h-4V2M2 10h4v4M10 6l4-4M6 10l-4 4"/>
    </svg>
  ),
  Edit: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M11 3l2 2-7.5 7.5H3.5V10.5z"/>
    </svg>
  ),
  Robot: (p) => (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}>
      <rect x="8" y="10" width="16" height="13" rx="3"/>
      <circle cx="13" cy="16" r="1.5" fill="currentColor"/>
      <circle cx="19" cy="16" r="1.5" fill="currentColor"/>
      <path d="M14 19.5h4M16 7v3M12 23v2M20 23v2"/>
    </svg>
  ),
  Hand: (p) => (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 8V3.5a1 1 0 0 1 2 0V8M8 8V2.5a1 1 0 0 1 2 0V8M10 8V3.5a1 1 0 0 1 2 0V9c0 3-2 5-5 5s-5-2-5-5V6.5a1 1 0 0 1 2 0V9"/>
    </svg>
  ),
};

// ---------- Avatar ----------
function Avatar({ name, role, size = 32, className = '' }) {
  const isGm = role === 'gm';
  const style = isGm
    ? { width: size, height: size, fontSize: size * 0.38 }
    : { ...avatarStyle(name), width: size, height: size, fontSize: size * 0.38 };
  return (
    <div className={`avatar ${isGm ? 'gm-avatar' : ''} ${className}`} style={style} aria-hidden="true">
      {isGm ? 'GM' : initials(name)}
    </div>
  );
}

// ---------- Sidebar ----------
function Sidebar({ participants, totalCost, showCost, onToggleCost, gmTreatment, onChangeModel }) {
  const viewer = participants.find(p => p.you);
  const aliveCount = participants.filter(p => p.role !== 'gm' && !p.dead).length;
  const totalCount = participants.filter(p => p.role !== 'gm').length;
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="game-title">Harry Potter</div>
        <div className="game-meta-row">
          <span className="cost-pill" title="Total game cost so far">
            <span className="dot"></span>
            ${totalCost.toFixed(4)}
          </span>
          <span>{aliveCount}/{totalCount} alive</span>
          <span className="sep">·</span>
          <span>Day 2</span>
        </div>
      </div>
      <div className="sidebar-section-label">
        <span>Participants</span>
        <button
          className={`cost-toggle ${showCost ? 'on' : ''}`}
          onClick={onToggleCost}
          title="Toggle per-message cost display"
        >
          $ {showCost ? 'on' : 'off'}
        </button>
      </div>
      <div className={`participants ${showCost ? 'show-costs-list' : ''}`}>
        {participants.map((p) => (
          <ParticipantRow key={p.id} p={p} viewer={viewer} showCost={showCost} gmTreatment={gmTreatment} onChangeModel={onChangeModel} />
        ))}
      </div>
    </aside>
  );
}

function RoleTag({ role, variant }) {
  // variant: 'self' | 'fellow-wolf' | 'dead'
  const label = role === 'gm' ? 'GM' : role;
  return <span className={`role-tag role-${role} ${variant ? `variant-${variant}` : ''}`}>{label}</span>;
}

function ParticipantRow({ p, viewer, showCost, gmTreatment, onChangeModel }) {
  const role = p.role;
  const clickable = !p.you && p.model && !p.dead;
  const vis = getRoleVisibility(p, viewer);
  const deathLabel = p.deathCause === 'lynched'
    ? `Lynched · Day ${p.deathDay || 1}`
    : p.deathCause === 'killed'
      ? `Killed · Night ${p.deathNight || 1}`
      : 'Dead';

  let titleAttr = '';
  if (p.dead) titleAttr = `${p.name} — ${deathLabel} · revealed ${role}`;
  else if (p.you) titleAttr = 'You — playing this character';
  else if (p.model) titleAttr = `Click to change AI model — currently ${p.model}`;

  return (
    <div
      className={`participant ${role === 'gm' ? 'gm' : ''} ${p.you ? 'you' : ''} ${p.dead ? 'dead' : ''} ${showCost ? 'show-cost' : ''} ${clickable ? 'clickable' : ''}`}
      title={titleAttr}
      onClick={() => clickable && onChangeModel?.(p)}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => clickable && (e.key === 'Enter' || e.key === ' ') && onChangeModel?.(p)}
    >
      <div className="p-avatar-wrap">
        <Avatar name={p.name} role={p.role} size={32} />
        {p.dead ? <span className="death-mark" aria-hidden>✕</span> : null}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="p-name-line">
          <span className="p-name">{p.name}</span>
          {p.you ? <span className="you-tag">you</span> : null}
          {vis.visible && vis.reason !== 'dead' ? (
            <RoleTag role={role} variant={vis.reason} />
          ) : null}
        </div>
        <div className="p-sub">
          {p.dead ? (
            <span className="death-line">
              <RoleTag role={role} variant="dead" />
              <span className="death-cause">{deathLabel}</span>
            </span>
          ) : p.role === 'gm' ? (
            <span>{p.model}</span>
          ) : p.you ? (
            <span className="role">Playing as you</span>
          ) : (
            <span>{p.model}</span>
          )}
        </div>
      </div>
      {!p.you && !p.dead && p.cost > 0 ? (
        <span className="p-cost">${p.cost.toFixed(4)}</span>
      ) : null}
    </div>
  );
}

// ---------- Message ----------
function Message({ msg, author, viewer, showCost, onChangeModel, onDelete, isPlaying, onTogglePlay }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const popRef = useRef(null);
  const role = author.role || 'villager';
  const isGm = role === 'gm';
  const isYou = author.you;
  const isWerewolf = role === 'werewolf';
  const authorClass = isGm ? 'gm' : isYou ? 'you' : isWerewolf ? 'werewolf' : '';
  const vis = getRoleVisibility(author, viewer);

  // Close popover on outside click
  useEffect(() => {
    if (!deleteOpen) return;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setDeleteOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [deleteOpen]);

  return (
    <div className="msg-group">
      <div className="msg-meta">
        <span
          className={`msg-author ${authorClass} ${author.model ? 'clickable' : ''}`}
          onClick={() => author.model && onChangeModel?.(author)}
          title={author.model ? `Click to change AI model \u2014 currently ${author.model}` : ''}
        >
          {author.name}
        </span>
        {vis.visible && vis.reason !== 'dead' ? (
          <RoleTag role={role} variant={vis.reason} />
        ) : null}
        {!isYou && msg.cost ? (
          <span className="msg-cost">${msg.cost.toFixed(4)}</span>
        ) : null}
        <div className="msg-meta-actions">
          <button
            className={`msg-action-btn ${isPlaying ? 'active' : ''}`}
            title={isPlaying ? 'Stop voice' : 'Read message aloud'}
            onClick={() => onTogglePlay?.(msg)}
          >
            <Icons.SpeakerSm className="icon-sm" />
          </button>
          <div className="msg-action-wrap" ref={popRef}>
            <button
              className={`msg-action-btn danger-hover ${deleteOpen ? 'active-danger' : ''}`}
              title="Delete message"
              onClick={() => setDeleteOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={deleteOpen}
            >
              <Icons.X className="icon-sm" />
            </button>
            {deleteOpen ? (
              <div className="msg-delete-popover" role="menu">
                <button className="delete-action danger" onClick={() => { onDelete?.(msg, 'incl'); setDeleteOpen(false); }}>
                  <Icons.Cut className="icon-sm" />
                  Delete from here (incl.)
                </button>
                <button className="delete-action warn" onClick={() => { onDelete?.(msg, 'after'); setDeleteOpen(false); }}>
                  <Icons.Forward className="icon-sm" />
                  Delete after here (excl.)
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="msg-row">
        <Avatar name={author.name} role={author.role} size={32} />
        <div className={`msg ${isGm ? 'gm-msg' : ''} ${isYou ? 'you-msg' : ''} ${isPlaying ? 'msg-playing' : ''}`}>
          {msg.text}
        </div>
        <div></div>
      </div>
    </div>
  );
}

// ---------- Thinking bubble (skeleton) ----------
function ThinkingBubble({ name, role }) {
  return (
    <div className="msg-group">
      <div className="msg-meta">
        <span className="msg-author">{name}</span>
        <span className="thinking-text">is thinking…</span>
      </div>
      <div className="msg-row">
        <Avatar name={name} role={role} size={32} />
        <div className="thinking-bubble">
          <div className="thinking-dots"><span></span><span></span><span></span></div>
          <div className="skeleton-lines">
            <div className="skeleton-line w90"></div>
            <div className="skeleton-line w70"></div>
            <div className="skeleton-line w50"></div>
          </div>
        </div>
        <div></div>
      </div>
    </div>
  );
}

// ---------- Composer ----------
function Composer({ disabled, hint, onOpenSelect, micOn, onToggleMic }) {
  const [val, setVal] = useState('');
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef(null);
  const wrapRef = useRef(null);
  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = expanded ? 280 : 120;
    el.style.height = Math.min(max, Math.max(expanded ? 140 : 48, el.scrollHeight)) + 'px';
  }
  useEffect(autosize, [val, expanded]);

  // Collapse on click outside the composer (only when empty)
  useEffect(() => {
    if (!expanded) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        if (!val.trim()) setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [expanded, val]);

  return (
    <div ref={wrapRef} className={`composer-wrap ${expanded ? 'composer-expanded' : ''}`}>
      <div className={`composer ${disabled ? 'disabled' : ''}`}>
        <div className="composer-input-wrap">
          <textarea
            ref={taRef}
            className="composer-input"
            placeholder={hint || 'Type a message…'}
            value={val}
            rows={1}
            onChange={(e) => setVal(e.target.value)}
            onFocus={() => setExpanded(true)}
            disabled={disabled}
          />
        </div>
        <div className="composer-bar">
          <div className="composer-actions">
            <button className="pri-btn" disabled={disabled || !val.trim()}>
              <Icons.Send className="icon-sm" />
              Send
            </button>
            <button className="sec-btn" title="Call a vote">
              <Icons.Vote className="icon-sm" />
              Vote
            </button>
            <button className="sec-btn" title="Continue without speaking">
              <Icons.GoOn className="icon-sm" />
              Go on
            </button>
          </div>
          <div className="composer-actions right">
            <button
              className={`icon-btn ${micOn ? 'active' : ''}`}
              title="Voice input"
              onClick={onToggleMic}
            >
              <Icons.Mic className="icon-sm" />
            </button>
            <button className="icon-btn" title="Hint">
              <Icons.Lightbulb className="icon-sm" />
            </button>
          </div>
        </div>
      </div>
      {hint ? (
        <div className="composer-hint">
          <span className="dot"></span>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Discussion Queue ----------
function DiscussionQueue({ queue, onOpenSelect }) {
  const idle = !queue || queue.length === 0;
  if (idle) {
    return (
      <aside className="queue-col">
        <div className="queue-header">
          <Icons.Chat className="icon" />
          <div className="queue-title">Discussion Queue</div>
          <div className="queue-status-tag">Idle</div>
        </div>
        <div className="queue-body">
          <div className="queue-idle">
            <div className="queue-idle-illustration">
              <Icons.Robot className="icon-lg" />
            </div>
            <div className="queue-idle-text">All bots are idle</div>
          </div>
        </div>
        <div className="queue-footer">
          <button className="queue-select-btn" onClick={onOpenSelect}>
            <Icons.Hand className="icon-sm" />
            Select Bots Manually
          </button>
        </div>
      </aside>
    );
  }
  const total = queue.length;
  const remaining = queue.filter(q => q.state !== 'done').length;
  const pct = ((total - remaining) / total) * 100;
  return (
    <aside className="queue-col">
      <div className="queue-header">
        <Icons.Chat className="icon" />
        <div className="queue-title">Discussion Queue</div>
        <div className="queue-status-tag active">Live</div>
      </div>
      <div className="queue-body">
        <div className="queue-list">
          {queue.map((q, i) => (
            <div key={q.id} className={`queue-item ${q.state}`}>
              <span className="q-step">{String(i + 1).padStart(2, '0')}</span>
              <span className="q-name">{q.name}</span>
              <span className="q-state">
                {q.state === 'current' ? (<><span className="dot"></span>Current</>) : null}
                {q.state === 'done' ? 'Done' : null}
                {q.state === 'pending' ? 'Up next' : null}
              </span>
            </div>
          ))}
        </div>
        <div className="progress-block">
          <div className="progress-row">
            <span>Progress</span>
            <span>{remaining} remaining</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: pct + '%' }}></div>
          </div>
        </div>
      </div>
      <div className="queue-footer">
        <button className="queue-select-btn" onClick={onOpenSelect}>
          <Icons.Hand className="icon-sm" />
          Select Bots Manually
        </button>
      </div>
    </aside>
  );
}

// ---------- Modal: Select Bots to Respond ----------
function SelectBotsModal({ onClose, participants }) {
  const bots = participants.filter(p => !p.you && p.role !== 'gm');
  const [selected, setSelected] = useState([]); // ordered ids
  const [counts, setCounts] = useState(() => Object.fromEntries(bots.map(b => [b.id, 1])));
  function toggle(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function bumpCount(id, delta, e) {
    e.stopPropagation();
    setCounts(prev => ({ ...prev, [id]: Math.max(1, Math.min(5, (prev[id] || 1) + delta)) }));
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icons.Hand className="icon" />
            <div>
              <div className="modal-title">Select Bots to Respond</div>
              <div className="modal-subtitle">Pick 1–5 bots in the order you want them to respond.</div>
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="bot-rows">
            {bots.map((b) => {
              const idx = selected.indexOf(b.id);
              const isSelected = idx >= 0;
              return (
                <div
                  key={b.id}
                  className="bot-row"
                  aria-pressed={isSelected}
                  onClick={() => toggle(b.id)}
                >
                  <span className="order-num">{isSelected ? idx + 1 : ''}</span>
                  <Avatar name={b.name} role={b.role} size={28} />
                  <span className="bot-name">{b.name}</span>
                  <CountStepper
                    value={counts[b.id]}
                    onDec={(e) => bumpCount(b.id, -1, e)}
                    onInc={(e) => bumpCount(b.id, +1, e)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <div className="selected-summary">
            <span className="num">{selected.length}</span> of {bots.length} selected
          </div>
          <button className="sec-btn" onClick={onClose}>Cancel</button>
          <button className="pri-btn" disabled={selected.length === 0}>
            Select {selected.length} Bot{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CountStepper({ value, onDec, onInc }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: '1px solid var(--line-2)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-1)' }}>
      <button onClick={onDec} style={{ width: 22, height: 24, border: 0, background: 'transparent', color: 'var(--fg-2)', cursor: 'pointer' }}>−</button>
      <span style={{ minWidth: 36, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)' }}>
        {value} msg{value === 1 ? '' : 's'}
      </span>
      <button onClick={onInc} style={{ width: 22, height: 24, border: 0, background: 'transparent', color: 'var(--fg-2)', cursor: 'pointer' }}>+</button>
    </div>
  );
}

// ---------- Modal: Change AI Model ----------
function ChangeModelModal({ player, currentModelId, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(currentModelId || null);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return MODELS.map(g => ({
      ...g,
      items: g.items.filter(m => m.name.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q)),
    })).filter(g => g.items.length > 0);
  }, [query]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={player.name} role={player.role} size={32} />
            <div>
              <div className="modal-title">Change AI Model — {player.name}</div>
              <div className="modal-subtitle">
                Currently using <strong style={{ color: 'var(--fg-0)', fontWeight: 600 }}>{player.model || '—'}</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-body" style={{ padding: '12px 14px' }}>
          <div style={{ position: 'relative', padding: '0 8px 10px' }}>
            <input
              className="input"
              placeholder="Search models or providers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line-2)',
                borderRadius: 8, color: 'var(--fg-0)', fontFamily: 'inherit', fontSize: 13,
                padding: '9px 12px', outline: 'none',
              }}
            />
          </div>
          <div className="model-list">
            {filtered.map((g) => (
              <React.Fragment key={g.provider}>
                <div className="model-group-label">{g.provider}</div>
                {g.items.map((m) => {
                  const sel = selectedId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`model-item ${sel ? 'selected' : ''}`}
                      onClick={() => setSelectedId(m.id)}
                    >
                      <span className="model-radio"></span>
                      <span className="model-name">{m.name}</span>
                      <span style={{ display: 'flex', gap: 4 }}>
                        {m.tags?.includes('fast') ? <span className="model-tag fast">fast</span> : null}
                        {m.tags?.includes('thinking') ? <span className="model-tag thinking">thinking</span> : null}
                      </span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <div className="selected-summary">
            {selectedId ? (
              <>Switch to <span className="num">{flatModels().find(m => m.id === selectedId)?.name}</span></>
            ) : 'No selection'}
          </div>
          <button className="sec-btn" onClick={onClose}>Cancel</button>
          <button className="pri-btn" disabled={!selectedId} onClick={() => { onSelect(selectedId); onClose(); }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
function flatModels() { return MODELS.flatMap(g => g.items); }

Object.assign(window, {
  Icons, Avatar, Sidebar, ParticipantRow, RoleTag, Message, ThinkingBubble,
  Composer, DiscussionQueue, SelectBotsModal, ChangeModelModal,
});
