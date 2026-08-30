---
category: Games
---
Click-to-expand character card modal: large portrait, name plate, role/status
tags, model and play-style rows, and the character's story. Renders as a
fullscreen fixed overlay — clicking the backdrop or pressing Escape closes it.

In designs, always pass `avatarUrl` (the app's authed portrait route is not
reachable from a design) and wrap in a sized, `transform`ed container to keep
the fixed overlay inside your frame.

Owner-only portrait controls appear when `isOwner` is true and `onSelectVariant`
is provided: arrows walk the character's portrait candidates (`‹ 2/3 ›`), and a
circular-arrow button rerolls portraits for the whole cast (`onRegenerate`).
While a reroll runs, the portrait dims, "Drawing new portraits…" overlays it,
and every control disables — the component manages that state itself.
