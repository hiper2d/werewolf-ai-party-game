// Shared components for the Create Game page
const { useState, useEffect, useRef, useMemo } = React;

// ---------- Tiny icon set ----------
const Icon = {
  Caret: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6l4 4 4-4" />
    </svg>
  ),
  Check: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  ),
  Search: ({ className = "" }) => (
    <svg className={"ico " + className} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L13.5 13.5" />
    </svg>
  ),
  Bolt: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
    </svg>
  ),
  Sun: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.6 3.4l-1 1M5.4 10.6l-1 1M12.6 12.6l-1-1M5.4 5.4l-1-1" />
    </svg>
  ),
  Moon: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" />
    </svg>
  ),
  Wolf: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5l3 4-2 4 4-1 4 3 4-3 4 1-2-4 3-4-5 2-4-2-4 2-5-2z" />
      <path d="M9 11l1 1M15 11l-1 1" />
    </svg>
  ),
  Play: ({ className = "" }) => (
    <svg className={"ico " + className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.5v9l7-4.5-7-4.5z" />
    </svg>
  ),
};

// ---------- Role icons (originals — small geometric glyphs, no copyrighted UI) ----------
const RoleGlyph = ({ kind }) => {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "doctor":
      return <svg {...common}><path d="M8 3v10M3 8h10" /></svg>;
    case "detective":
      return <svg {...common}><circle cx="6.5" cy="7" r="3" /><path d="M9 9.5L13 13.5" /></svg>;
    case "maniac":
      return <svg {...common}><path d="M3 13L8 3l5 10" /><path d="M5.5 10h5" /></svg>;
    case "seer":
      return <svg {...common}><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" /><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case "hunter":
      return <svg {...common}><path d="M3 13L13 3M9 3h4v4" /></svg>;
    case "witch":
      return <svg {...common}><path d="M4 13h8" /><path d="M5 13l3-9 3 9" /><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none" /></svg>;
    default:
      return <svg {...common}><circle cx="8" cy="8" r="4" /></svg>;
  }
};

// ---------- Special Roles ----------
const ROLES = [
  { id: "doctor",    label: "Doctor",    desc: "Heals one player per night" },
  { id: "detective", label: "Detective", desc: "Investigates a player's role" },
  { id: "maniac",    label: "Maniac",    desc: "Kills independently each night" },
  { id: "seer",      label: "Seer",      desc: "Sees a player's true alignment" },
  { id: "hunter",    label: "Hunter",    desc: "Takes one with them on death" },
];

const RoleChip = ({ role, selected, onToggle }) => (
  <button
    type="button"
    className="role-chip"
    aria-pressed={selected}
    onClick={onToggle}
    title={role.desc}
  >
    <span className="chip-icon"><RoleGlyph kind={role.id} /></span>
    <span>{role.label}</span>
    <span className="chip-check"><Icon.Check /></span>
  </button>
);

const SpecialRoles = ({ value, onChange }) => {
  const toggle = (id) => {
    const next = value.includes(id) ? value.filter(x => x !== id) : [...value, id];
    onChange(next);
  };
  return (
    <div className="roles-row">
      {ROLES.map(r => (
        <RoleChip
          key={r.id}
          role={r}
          selected={value.includes(r.id)}
          onToggle={() => toggle(r.id)}
        />
      ))}
    </div>
  );
};

// ---------- AI Models data ----------
const MODELS = [
  { id: "haiku-4.5",       name: "Haiku 4.5",          provider: "anthropic",  fast: true },
  { id: "sonnet-4.5",      name: "Sonnet 4.5",         provider: "anthropic",  fast: false },
  { id: "opus-4",          name: "Opus 4",             provider: "anthropic",  fast: false },
  { id: "gpt-5-mini",      name: "GPT-5 mini",         provider: "openai",     fast: true },
  { id: "gpt-5",           name: "GPT-5",              provider: "openai",     fast: false },
  { id: "gpt-4o-mini",     name: "GPT-4o mini",        provider: "openai",     fast: true },
  { id: "o4-mini",         name: "o4-mini",            provider: "openai",     fast: true },
  { id: "gemini-flash-2",  name: "Gemini 2.0 Flash",   provider: "google",     fast: true },
  { id: "gemini-pro-2",    name: "Gemini 2.0 Pro",     provider: "google",     fast: false },
  { id: "llama-3-70b",     name: "Llama 3.1 70B",      provider: "meta",       fast: false },
  { id: "llama-3-8b",      name: "Llama 3.1 8B",       provider: "meta",       fast: true },
  { id: "mistral-large",   name: "Mistral Large",      provider: "mistral",    fast: false },
  { id: "mistral-small",   name: "Mistral Small",      provider: "mistral",    fast: true },
  { id: "deepseek-v3",     name: "DeepSeek V3",        provider: "deepseek",   fast: false },
  { id: "qwen-2.5-72b",    name: "Qwen 2.5 72B",       provider: "alibaba",    fast: false },
];

// ---------- AI Multi-select ----------
const AIMultiSelect = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fastOnly, setFastOnly] = useState(false);
  const wrapRef = useRef(null);

  // Apply Fast-only as a pre-selection: when toggled on, select all fast models.
  // When toggled off, leave selection as-is (user-friendly: they can deselect manually).
  const handleFastOnly = (next) => {
    setFastOnly(next);
    if (next) {
      const fastIds = MODELS.filter(m => m.fast).map(m => m.id);
      onChange(Array.from(new Set([...value, ...fastIds])).filter(id => {
        // when applying fast-only, restrict selection to fast models only
        return fastIds.includes(id);
      }));
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    let list = MODELS;
    if (fastOnly) list = list.filter(m => m.fast);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q));
    }
    return list;
  }, [query, fastOnly]);

  // Group filtered by provider
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(m => { (g[m.provider] = g[m.provider] || []).push(m); });
    return g;
  }, [filtered]);

  const toggle = (id) => {
    const m = MODELS.find(x => x.id === id);
    if (fastOnly && !m.fast) return; // disabled while fastOnly is on
    const next = value.includes(id) ? value.filter(x => x !== id) : [...value, id];
    onChange(next);
  };

  const selectAllVisible = () => {
    const ids = filtered.map(m => m.id);
    onChange(Array.from(new Set([...value, ...ids])));
  };
  const clearAll = () => onChange([]);

  const summary = (() => {
    if (value.length === 0) return "No models selected";
    if (value.length === 1) {
      const m = MODELS.find(x => x.id === value[0]);
      return m ? m.name : "1 model selected";
    }
    if (value.length <= 3) {
      return value.map(id => (MODELS.find(m => m.id === id) || {}).name).filter(Boolean).join(", ");
    }
    return `${value.length} models selected`;
  })();

  return (
    <div className="ai-field" ref={wrapRef}>
      <div
        className={"ai-trigger" + (open ? " open" : "")}
        onClick={() => setOpen(o => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
      >
        <span className="ai-count">{value.length}</span>
        <span className="ai-summary">{summary}</span>
        {fastOnly && (
          <span className="ai-fastpill" title="Selection limited to fast models">
            <Icon.Bolt /> Fast only
          </span>
        )}
        <span className="ai-caret"><Icon.Caret /></span>
      </div>

      {open && (
        <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
          <div className="ai-panel-header">
            <div className="ai-search-wrap" style={{ position: "relative", flex: 1, display: "flex" }}>
              <Icon.Search />
              <input
                className="ai-search"
                placeholder="Search models or providers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="ai-toolbar">
            <button
              type="button"
              className="filter-pill"
              aria-pressed={fastOnly}
              onClick={() => handleFastOnly(!fastOnly)}
              title="Pre-select only fast models"
            >
              <span className="dot" />
              <Icon.Bolt /> Fast only
            </button>
            <div className="toolbar-spacer" />
            <button type="button" className="toolbar-link" onClick={selectAllVisible}>
              Select visible
            </button>
            <button type="button" className="toolbar-link" onClick={clearAll}>
              Clear
            </button>
          </div>

          <div className="ai-list">
            {filtered.length === 0 && (
              <div className="ai-empty">No models match “{query}”</div>
            )}
            {Object.entries(grouped).map(([provider, items]) => (
              <div key={provider}>
                <div style={{
                  padding: "8px 12px 4px",
                  fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
                  color: "var(--fg-3)", fontFamily: "var(--font-mono)"
                }}>{provider}</div>
                {items.map(m => {
                  const checked = value.includes(m.id);
                  const disabled = fastOnly && !m.fast;
                  return (
                    <div
                      key={m.id}
                      className={"ai-row" + (disabled ? " disabled" : "")}
                      data-checked={checked}
                      onClick={() => toggle(m.id)}
                    >
                      <span className="check"><Icon.Check /></span>
                      <div className="ai-meta">
                        <div className="ai-name">
                          {m.name}
                          {m.fast
                            ? <span className="speed-tag fast">fast</span>
                            : <span className="speed-tag slow">standard</span>}
                        </div>
                        <div className="ai-sub">{m.provider} · {m.id}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="ai-footer">
            <div className="ai-footer-info">
              <b>{value.length}</b> selected · <b>{filtered.length}</b> shown
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, {
  Icon, RoleGlyph, ROLES, RoleChip, SpecialRoles, MODELS, AIMultiSelect,
});
