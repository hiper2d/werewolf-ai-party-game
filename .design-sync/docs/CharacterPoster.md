---
category: Games
---
The character poster: a 3:4.35 card filled by the portrait, a role-tinted
glow ring (neutral crew, red werewolf, green Game Master), a role chip top-left
(`CREW`, `WEREWOLF`, `YOU · DETECTIVE`, `GAME MASTER` — only roles the player
legitimately knows), and a name plate over the bottom with model, play style,
optional cost, and a STORY toggle that unfolds the character's story over the
portrait. Dead characters render grayscale with a ✝ after the name.

Width comes from the container (`w-full`); height follows the aspect ratio.
`cornerChip` fills the top-right chip: cinematic mode passes its turn counter
(`6 / 6`), the character card passes the owner's portrait switcher.

In designs, always pass `avatarUrl` — the app's authed portrait route is not
reachable from a design.
