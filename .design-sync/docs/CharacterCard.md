---
category: Games
---
Click-to-expand character card modal: the CharacterPoster (portrait, role
chip, name plate with model / play style / STORY toggle) over a blurred scrim,
with a round Close button top-right. Clicking the backdrop or pressing Escape
closes it. The same poster cinematic mode shows beside the speech bubble.

In designs, always pass `avatarUrl` (the app's authed portrait route is not
reachable from a design) and wrap in a sized, `transform`ed container to keep
the fixed overlay inside your frame.

Owner-only portrait switcher appears in the poster's top-right chip when
`isOwner` is true, `onSelectVariant` is provided and the character has more
than one kept candidate: chevrons walk the candidates, dots show the position
(a `2/8` counter past six). Each click commits the shown face as the one used
everywhere in the game. Drawing new portraits is not a card action — it lives
in the participants panel and redraws the whole cast.
