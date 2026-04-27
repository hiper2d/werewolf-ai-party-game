// Main app
const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "chipStyle": "square",
  "showFastPillInTrigger": true,
  "theme": "dark"
}/*EDITMODE-END*/;

// ---------- Preview data (mock generated content) ----------
const SAMPLE_PREVIEW = {
  story: "In the shadow of the Capitol, the tributes and former victors gather in the eerily quiet arena, where alliances are fragile and betrayal lurks behind every smile. Three werewolves hide among them, ready to strike when the sun sets, while a doctor works to save the wounded, a detective seeks the truth, and a maniac stalks the night to abduct unsuspecting victims. In this deadly game, trust is a weapon and suspicion is survival.",
  master: {
    voiceProvider: "OpenAI",
    aiModel: "DeepSeek V3",
    voice: "onyx",
    voiceStyle: "authoritatively",
  },
  players: [
    { name: "Katniss",  gender: "Female", voice: "nova",     model: "Claude 4.5 Haiku", style: "Protective Team Player", story: "As the Mockingjay, Katniss has survived two Hunger Games through sheer will and unmatched archery skills. She is fiercely protective of her allies, but her deep distrust of authority makes her wary of everyone.", voiceStyle: "warmly", role: "villager" },
    { name: "Peeta",    gender: "Male",   voice: "echo",     model: "GPT-5 mini",       style: "Diplomatic Mediator",    story: "Charming and disarmingly honest, Peeta uses words the way others use weapons. He'll talk anyone down from a ledge — or onto one.", voiceStyle: "gently",   role: "villager" },
    { name: "Haymitch", gender: "Male",   voice: "onyx",     model: "Sonnet 4.5",       style: "Cynical Strategist",     story: "A former victor turned mentor, Haymitch sees every angle and trusts none of them. He drinks to forget what he knows; he plays to remember.", voiceStyle: "gruffly",  role: "werewolf" },
    { name: "Effie",    gender: "Female", voice: "shimmer",  model: "Gemini 2.0 Flash", style: "Cheerful Information Broker", story: "Polished, perfumed, and persistently chipper, Effie is the last person you'd suspect of anything sinister — which is exactly what makes her dangerous.", voiceStyle: "brightly", role: "villager" },
  ]
};

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [name, setName] = useState("Leo");
  const [title, setTitle] = useState("Hunger Games");
  const [description, setDescription] = useState("");
  const [playerCount, setPlayerCount] = useState("12");
  const [werewolves, setWerewolves] = useState("3");
  const [roles, setRoles] = useState(["doctor", "detective", "maniac"]);
  const [models, setModels] = useState([
    "haiku-4.5","sonnet-4.5","gpt-5-mini","gpt-5","gpt-4o-mini",
    "gemini-flash-2","llama-3-8b","mistral-small","deepseek-v3"
  ]);

  // Preview generation flow
  const [genState, setGenState] = useState("idle"); // idle | generating | done
  const [preview, setPreview] = useState(null);

  // Demo URL params: ?state=generating | ?state=preview | ?theme=light
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("state");
    const t = params.get("theme");
    if (t === "light" || t === "dark") setTweak("theme", t);
    if (s === "generating") setGenState("generating");
    if (s === "preview") { setGenState("done"); setPreview(SAMPLE_PREVIEW); }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tweaks.theme);
  }, [tweaks.theme]);

  const handleGenerate = () => {
    setGenState("generating");
    setPreview(null);
    setTimeout(() => {
      setPreview(SAMPLE_PREVIEW);
      setGenState("done");
    }, 1800);
  };

  return (
    <>
      {/* ---------- Top nav ---------- */}
      <nav className="nav" data-screen-label="01 Top Nav">
        <div className="nav-left">
          <div className="brand">
            <div className="brand-mark">W</div>
            <span className="brand-name">Aliaksei Zelianouski</span>
            <span className="api-tag">API</span>
          </div>
        </div>
        <div className="nav-right">
          <a className="nav-link" href="#">All games</a>
          <span className="nav-divider" />
          <a className="nav-link" href="#">Rules</a>
          <span className="nav-divider" />
          <a className="nav-link" href="#">User Profile</a>
          <button
            className="mode-toggle"
            type="button"
            title="Toggle theme"
            onClick={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}
          >
            {tweaks.theme === "dark" ? <Icon.Moon /> : <Icon.Sun />}
            {tweaks.theme === "dark" ? "Dark" : "Light"}
          </button>
          <button className="btn">Logout</button>
        </div>
      </nav>

      {/* ---------- Page ---------- */}
      <main className="page">
        <section className="card" data-screen-label="02 Create New Game">
          <header className="card-header">
            <h1 className="card-title">Create New Game</h1>
            <button
              className={"btn btn-primary btn-generate" + (genState === "generating" ? " busy" : "")}
              type="button"
              onClick={handleGenerate}
              disabled={genState === "generating"}
            >
              <Icon.Bolt />
              {genState === "generating" ? "Generating…" : "Generate Preview"}
            </button>
          </header>

          <div className="card-body">
            <div className="form-grid" style={{ marginBottom: 18 }}>
              <div className="field">
                <label className="label">Host Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">Game Title</label>
                <input className="input" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="field full-row">
                <label className="label">Description <span style={{ color: "var(--fg-3)", fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  className="textarea"
                  placeholder="Describe the setting for your game…"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid" style={{ marginBottom: 18 }}>
              <div className="field-row">
                <span className="label-inline">Player Count</span>
                <div className="select-wrap">
                  <select className="select" value={playerCount} onChange={e => setPlayerCount(e.target.value)}>
                    {Array.from({ length: 17 }, (_, i) => i + 4).map(n => (
                      <option key={n} value={n}>{n} players</option>
                    ))}
                  </select>
                  <span className="select-caret"><Icon.Caret /></span>
                </div>
              </div>
              <div className="field-row">
                <span className="label-inline">Werewolf Count</span>
                <div className="select-wrap">
                  <select className="select" value={werewolves} onChange={e => setWerewolves(e.target.value)}>
                    {[1,2,3,4,5,6].map(n => (
                      <option key={n} value={n}>{n} werewol{n === 1 ? "f" : "ves"}</option>
                    ))}
                  </select>
                  <span className="select-caret"><Icon.Caret /></span>
                </div>
              </div>
            </div>

            <div className="field-row" style={{ marginBottom: 18 }}>
              <span className="label-inline">Players AI</span>
              <AIMultiSelect value={models} onChange={setModels} />
            </div>

            <div className="field-row tight">
              <span className="label-inline">Special Roles</span>
              <SpecialRoles value={roles} onChange={setRoles} />
            </div>
          </div>
        </section>

        {/* ---------- Generating banner ---------- */}
        {genState === "generating" && (
          <div className="banner" role="status" aria-live="polite">
            <div className="banner-icon spinning"><Icon.Bolt /></div>
            <div className="banner-body">
              <div className="banner-title">Generating Game Preview<span className="dots" /></div>
              <div className="banner-text">The AI is creating your game story and characters. This may take a moment.</div>
            </div>
          </div>
        )}

        {/* ---------- Preview ---------- */}
        {genState === "done" && preview && (
          <PreviewSection data={preview} />
        )}
      </main>

      {/* ---------- Tweaks panel ---------- */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakRadio
            label="Mode"
            value={tweaks.theme}
            onChange={v => setTweak("theme", v)}
            options={[
              { value: "dark",  label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
        </TweakSection>
        <TweakSection title="Special Roles">
          <TweakRadio
            label="Chip style"
            value={tweaks.chipStyle}
            onChange={v => setTweak("chipStyle", v)}
            options={[
              { value: "pill",   label: "Pill" },
              { value: "square", label: "Square" },
              { value: "icon",   label: "Icon-only" },
            ]}
          />
        </TweakSection>
        <TweakSection title="AI picker">
          <TweakToggle
            label="Show 'Fast only' pill in trigger"
            value={tweaks.showFastPillInTrigger}
            onChange={v => setTweak("showFastPillInTrigger", v)}
          />
        </TweakSection>
        <TweakSection title="Preview flow">
          <TweakButton onClick={handleGenerate}>Trigger generation</TweakButton>
          <TweakButton onClick={() => { setGenState("idle"); setPreview(null); }}>Reset</TweakButton>
        </TweakSection>
      </TweaksPanel>

      {/* Tweak-driven CSS overrides */}
      <style>{`
        ${tweaks.chipStyle === "square" ? `.role-chip { border-radius: 8px !important; }` : ""}
        ${tweaks.chipStyle === "pill"   ? `.role-chip { border-radius: 999px !important; }` : ""}
        ${tweaks.chipStyle === "icon"   ? `
          .role-chip > span:nth-child(2) { display: none; }
          .role-chip { padding: 6px 8px !important; border-radius: 8px !important; }
          .role-chip .chip-check { display: none; }
        ` : ""}
        ${!tweaks.showFastPillInTrigger ? `.ai-trigger .ai-fastpill { display: none; }` : ""}
      `}</style>
    </>
  );
}

// ---------- Preview Section ----------
function PreviewSection({ data }) {
  return (
    <div className="preview-section" data-screen-label="03 Game Preview">
      <h2 className="preview-h1">Preview</h2>

      {/* Game Story */}
      <div className="field full-row" style={{ marginBottom: 8 }}>
        <label className="label" style={{ marginBottom: 6 }}>Game Story</label>
        <textarea className="textarea" defaultValue={data.story} style={{ minHeight: 130 }} />
      </div>

      {/* Game Master */}
      <h3 className="preview-h2">Game Master</h3>
      <div className="preview-card">
        <div className="preview-meta">
          Voice Provider: <b>{data.master.voiceProvider}</b>
        </div>
        <div className="preview-grid-2">
          <div className="field">
            <label className="label">AI Model</label>
            <div className="select-wrap">
              <select className="select" defaultValue={data.master.aiModel}>
                <option>{data.master.aiModel}</option>
              </select>
              <span className="select-caret"><Icon.Caret /></span>
            </div>
          </div>
          <div className="field">
            <label className="label">Voice</label>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="select-wrap" style={{ flex: 1 }}>
                <select className="select" defaultValue={data.master.voice}>
                  <option>{data.master.voice}</option>
                </select>
                <span className="select-caret"><Icon.Caret /></span>
              </div>
              <button className="icon-btn" type="button" title="Preview voice"><Icon.Play /></button>
            </div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Voice Style</label>
          <input className="input" defaultValue={data.master.voiceStyle} />
        </div>
      </div>

      {/* Players */}
      <h3 className="preview-h2">Players <span style={{ fontSize: 12, color: "var(--fg-2)", fontWeight: 500 }}>· {data.players.length} of {12}</span></h3>
      {data.players.map((p, i) => (
        <PlayerCard key={i} player={p} />
      ))}
    </div>
  );
}

function PlayerCard({ player }) {
  const initials = player.name.slice(0, 1).toUpperCase();
  return (
    <div className="player-card">
      <div className="player-head">
        <div className="player-avatar">{initials}</div>
        <div>
          <div className="player-name">{player.name}</div>
          <div className="player-sub">{player.gender} · voice: {player.voice}</div>
        </div>
        {player.role === "werewolf"
          ? <span className="player-tag werewolf">Werewolf</span>
          : <span className="player-tag">Villager</span>}
      </div>
      <div className="preview-grid-2">
        <div className="field">
          <label className="label">AI Model</label>
          <div className="select-wrap">
            <select className="select" defaultValue={player.model}><option>{player.model}</option></select>
            <span className="select-caret"><Icon.Caret /></span>
          </div>
        </div>
        <div className="field">
          <label className="label">Play Style</label>
          <div className="select-wrap">
            <select className="select" defaultValue={player.style}><option>{player.style}</option></select>
            <span className="select-caret"><Icon.Caret /></span>
          </div>
        </div>
      </div>
      <div className="field">
        <label className="label">Story</label>
        <textarea className="textarea" defaultValue={player.story} style={{ minHeight: 70 }} />
      </div>
      <div className="preview-grid-2">
        <div className="field">
          <label className="label">Voice Style</label>
          <input className="input" defaultValue={player.voiceStyle} />
        </div>
        <div className="field">
          <label className="label">Voice</label>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="select-wrap" style={{ flex: 1 }}>
              <select className="select" defaultValue={player.voice}><option>{player.voice}</option></select>
              <span className="select-caret"><Icon.Caret /></span>
            </div>
            <button className="icon-btn" type="button" title="Preview voice"><Icon.Play /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
