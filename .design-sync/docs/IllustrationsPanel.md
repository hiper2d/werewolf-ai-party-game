---
category: Games
---
The paid-tier illustrations block from the new-game preview: one action draws a
portrait for every character plus an opening-scene illustration. Three states:
a pitch with the accent `Generate illustrations` button (draft `null`), a
drawing state (spinner line, per-stage progress bar, shimmer placeholders for
the scene and the portrait grid), and a drawn state (400px opening scene beside
a 6-column grid of 46px round portraits with role-tinted captions, plus a
`Redraw everything` button in the section header).

Captions tint by `kind`: `gm` green, `you` blue-ish accent, `bot` neutral.
`castChanged` adds a stale-set warning line under the drawn grid.

In designs, always pass `imageUrlFn` — the app's authed draft-image route is
not reachable from a design. The scene image is requested with the key
`scene-welcome`; every other key is a cast portrait.
