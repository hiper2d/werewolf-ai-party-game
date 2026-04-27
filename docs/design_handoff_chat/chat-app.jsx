// Chat page main app
const { useState, useEffect } = React;

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "showCost": false,
  "gmTreatment": "rail",
  "queueState": "idle",
  "thinking": false,
  "modal": "none"
}/*EDITMODE-END*/;

function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }

function App() {
  const [t, setT] = useTweaks(DEFAULTS);

  const [showCost, setShowCost] = useState(false);
  const [modal, setModal] = useState('none');
  const [modelTarget, setModelTarget] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => { applyTheme(t.theme); }, [t.theme]);

  const totalCost = PARTICIPANTS.reduce((s, p) => s + (p.cost || 0), 0);

  // Demo queue
  const queue = t.queueState === 'active' ? [
    { id: 'cho', name: 'Cho', state: 'current' },
    { id: 'hagrid', name: 'Hagrid', state: 'pending' },
  ] : [];

  return (
    <>
      <nav className="nav">
        <div className="nav-left">
          <div className="brand">
            <div className="brand-mark">W</div>
            <div className="brand-name">Werewolf</div>
            <span className="api-tag">API</span>
          </div>
          <div className="nav-divider"></div>
          <a className="nav-link" href="#">All games</a>
          <span className="nav-divider"></span>
          <span className="breadcrumb-tag">Harry Potter</span>
        </div>
        <div className="nav-right">
          <a className="nav-link" href="#">Rules</a>
          <a className="nav-link" href="#">Profile</a>
          <button className="mode-toggle" onClick={() => setT('theme', t.theme === 'dark' ? 'light' : 'dark')}>
            {t.theme === 'dark' ? <Icons.Moon className="icon-sm" /> : <Icons.Sun className="icon-sm" />}
            {t.theme === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button className="sec-btn">Logout</button>
        </div>
      </nav>

      <div className="app">
        <Sidebar
          participants={PARTICIPANTS}
          totalCost={totalCost}
          showCost={showCost}
          onToggleCost={() => setShowCost(v => !v)}
          gmTreatment={t.gmTreatment}
          onChangeModel={(p) => { setModelTarget(p); setModal('model'); }}
        />

        <main className="chat-col">
          <div className="chat-header">
            <div className="chat-title-block">
              <span className="phase-tag day">Day 2</span>
              <span className="chat-title">Day discussion</span>
            </div>
            <div className="chat-header-right">
              <span>{MESSAGES.length} messages</span>
            </div>
          </div>

          <div className={`stream ${showCost ? 'show-costs' : ''}`}>
            {MESSAGES.map(m => {
              const author = PARTICIPANTS.find(p => p.id === m.authorId);
              const viewer = PARTICIPANTS.find(p => p.you);
              return (
                <Message
                  key={m.id}
                  msg={m}
                  author={author}
                  viewer={viewer}
                  showCost={showCost}
                  onChangeModel={(p) => { setModelTarget(p); setModal('model'); }}
                  onDelete={() => {}}
                  isPlaying={playingId === m.id}
                  onTogglePlay={() => setPlayingId(playingId === m.id ? null : m.id)}
                />
              );
            })}
            {t.thinking ? <ThinkingBubble name="Cho" role="villager" /> : null}
          </div>

          <Composer
            disabled={t.thinking}
            hint={t.thinking ? 'Waiting for Cho to respond…' : null}
            onOpenSelect={() => setModal('bots')}
            micOn={micOn}
            onToggleMic={() => setMicOn(v => !v)}
          />
        </main>

        <DiscussionQueue queue={queue} onOpenSelect={() => setModal('bots')} />
      </div>

      {modal === 'bots' ? (
        <SelectBotsModal participants={PARTICIPANTS} onClose={() => setModal('none')} />
      ) : null}
      {modal === 'model' && modelTarget ? (
        <ChangeModelModal
          player={modelTarget}
          currentModelId={null}
          onClose={() => setModal('none')}
          onSelect={() => {}}
        />
      ) : null}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio
          label="Theme"
          value={t.theme}
          options={['dark', 'light']}
          onChange={(v) => setT('theme', v)}
        />
        <TweakSection label="State demo" />
        <TweakRadio
          label="Queue"
          value={t.queueState}
          options={['idle', 'active']}
          onChange={(v) => setT('queueState', v)}
        />
        <TweakToggle
          label="Thinking bubble"
          value={t.thinking}
          onChange={(v) => setT('thinking', v)}
        />
        <TweakSection label="Modals" />
        <TweakButton label="Open Select Bots" onClick={() => setModal('bots')} />
        <TweakButton label="Open Change Model" onClick={() => { setModelTarget(PARTICIPANTS.find(p => p.id === 'draco')); setModal('model'); }} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
