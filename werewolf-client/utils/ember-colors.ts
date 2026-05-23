// Ember design system — player color helper

const PLAYER_COLORS: Record<string | number, string> = {
  0: '#f07a22',   // flame
  1: '#ffb347',   // amber
  2: '#8ab4e8',   // moonlight
  3: '#c7dcf5',   // frost
  4: '#5ec76a',   // leaf
  5: '#a3e635',   // lime
  6: '#e23e52',   // blood
  7: '#ec4899',   // rose
  8: '#a78bfa',   // lilac
  9: '#22d3ee',   // cyan
  10: '#f5dc6f',  // gold
  11: '#14b8a6',  // teal
  12: '#d4a574',  // tan
  13: '#b45309',  // rust
  14: '#dbb4ff',  // iris
  15: '#96c8a2',  // sage
  gm: '#ffe58a',  // game master
};

export function getColor(idx: string | number): string {
  return PLAYER_COLORS[idx] || '#f07a22';
}

export { PLAYER_COLORS };
