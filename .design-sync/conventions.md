## Werewolf AI — how to build with this kit

**Always wrap every screen in `DesignPreviewProvider`** (from the bundle). It sets
`data-theme="dark"` on the document and defines the font variables. Without it,
every `var(--*)` token is undefined and the page renders unthemed. The app is
dark-first; a light theme exists (`data-theme="light"`) but design for dark.

**Styling idiom — tokens via CSS variables.** The stylesheet is the *compiled*
app CSS: a Tailwind utility class exists only if the app already uses it.
Never invent new utility classes — for your own layout glue, use **inline
styles with the tokens**, and reuse component snippets from the `.prompt.md`
docs verbatim (their class strings are all compiled in).

Token vocabulary (all defined in `styles.css` → `_ds_bundle.css`):
- Surfaces: `--bg-0` (page) … `--bg-4` (raised); modal backdrop `--overlay`
- Borders: `--line-1` … `--line-3`
- Text: `--fg-0` (primary) … `--fg-3` (faint)
- Accent (cool blue): `--accent`, `--accent-soft`, `--accent-line`, `--accent-text`
- Semantic: `--danger`/`--danger-line`, `--good-fg/-soft/-line`, `--warn-fg/-soft/-line`,
  `--you-fg` (the human player), `--gm-fg` (the Game Master)
- Elevation: `--shadow-1`, `--shadow-2`, `--shadow-pop`; radii `--radius-sm/md/lg/xl`

**Fonts:** body text is Inter (`var(--font-inter)`); tiny uppercase labels and
numbers use JetBrains Mono (`var(--font-jetbrains-mono)`, e.g. the
`10px uppercase tracking-wide` section headers).

**Images:** components that show game art take explicit URLs in designs —
`PlayerAvatar`/`CharacterCard`/`CharacterPoster` need `avatarUrl`, `RoleCard`
needs `imageSrc`, `IllustrationsPanel` needs `imageUrlFn` (a `(key) => url` fn;
the scene image asks for key `'scene-welcome'`). Pass a data-URI or your asset;
the app's own image routes don't resolve here.

**Modals:** `CharacterCard` and `RoleCard` render as fullscreen `fixed`
overlays. To keep one inside a frame, wrap it in a container with an explicit
size and any `transform` (e.g. `transform: 'scale(1)'`) — that makes the
container the overlay's containing block.

Idiomatic example — a participants row:

```jsx
const { DesignPreviewProvider, PlayerAvatar } = window.WerewolfUI;
<DesignPreviewProvider>
  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-2)',
                borderRadius: 'var(--radius-md)', padding: '6px 8px',
                display: 'flex', alignItems: 'center', gap: 8 }}>
    <PlayerAvatar name="Miriam" size={32} avatarUrl={portrait} />
    <span style={{ color: 'var(--fg-0)', fontSize: 13, fontWeight: 500 }}>Miriam</span>
    <span style={{ color: 'var(--fg-3)', fontSize: 11, marginLeft: 'auto',
                   fontFamily: 'var(--font-jetbrains-mono), monospace' }}>$0.14</span>
  </div>
</DesignPreviewProvider>
```
