'use client';

import React from 'react';

// Color palette for sprites
const SP = {
  skin: ['#f5d7a8', '#e8b88a', '#c89268', '#8a5a3a', '#5a3820'] as const,
  outline: '#0a0a14',
  eye: '#0a0a14',
  cheek: '#d86070',
  dead: '#6a6480',
  ghost: '#c7dcf5',
};

type CellGrid = (string | null)[][];

interface PixelSpriteProps {
  cells: CellGrid;
  w: number;
  h: number;
  scale?: number;
  style?: React.CSSProperties;
  className?: string;
}

function PixelSprite({ cells, w, h, scale = 3, style, className }: PixelSpriteProps) {
  const size = scale * 2;
  return (
    <svg
      className={`pixel ${className || ''}`}
      width={w * size}
      height={h * size}
      viewBox={`0 0 ${w * 2} ${h * 2}`}
      shapeRendering="crispEdges"
      style={style}
    >
      {cells.map((row, y) =>
        row.map((c, x) =>
          c ? <rect key={`${x}-${y}`} x={x * 2} y={y * 2} width={2} height={2} fill={c} /> : null
        )
      )}
    </svg>
  );
}

type HairType = 'short' | 'long' | 'mohawk' | 'curly' | 'bald' | 'tied';
type HatType = 'cap' | 'wizard' | 'hood' | 'crown' | 'bandana' | 'top' | 'horns' | null;
type RevealRole = 'werewolf' | 'doctor' | 'detective' | 'maniac' | null;

interface MakeCharacterParams {
  skin: string;
  body: string;
  hair: HairType;
  hat: HatType;
  accent: string;
  dead?: boolean;
  ghost?: boolean;
  revealRole?: RevealRole;
}

function makeCharacter({ skin, body, hair, hat, accent, dead = false, ghost = false, revealRole = null }: MakeCharacterParams): CellGrid {
  const OL = SP.outline;
  const SK = skin;
  const BD = body;
  const HR = skin; // hair color derived from skin for now
  const HT = accent || body;
  const AC = accent || body;

  // Override HR based on hair param - use body color for hair
  const hairColor = body;

  const grid: CellGrid = Array.from({ length: 20 }, () => Array(16).fill(null));

  const set = (x: number, y: number, c: string) => {
    if (y >= 0 && y < 20 && x >= 0 && x < 16) grid[y][x] = c;
  };
  const hline = (x1: number, x2: number, y: number, c: string) => {
    for (let x = x1; x <= x2; x++) set(x, y, c);
  };
  const rect = (x1: number, y1: number, x2: number, y2: number, c: string) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, c);
  };

  // Head (rows 3-8, cols 5-10)
  rect(5, 3, 10, 8, SK);
  hline(5, 10, 2, OL);
  hline(4, 4, 3, OL); hline(11, 11, 3, OL);
  hline(4, 4, 8, OL); hline(11, 11, 8, OL);
  hline(5, 10, 9, OL);

  // Eyes
  set(6, 5, SP.eye); set(9, 5, SP.eye);
  // Mouth
  set(7, 7, SP.eye); set(8, 7, SP.eye);

  // Hair
  if (hair === 'short') {
    rect(5, 2, 10, 2, hairColor);
    set(4, 3, hairColor); set(11, 3, hairColor);
  } else if (hair === 'long') {
    rect(5, 2, 10, 2, hairColor);
    set(4, 3, hairColor); set(11, 3, hairColor);
    set(4, 4, hairColor); set(11, 4, hairColor);
    set(4, 5, hairColor); set(11, 5, hairColor);
    set(4, 6, hairColor);
  } else if (hair === 'mohawk') {
    rect(7, 0, 8, 2, hairColor);
  } else if (hair === 'curly') {
    rect(5, 1, 10, 3, hairColor);
    set(4, 2, hairColor); set(11, 2, hairColor);
    set(4, 4, hairColor); set(11, 4, hairColor);
  } else if (hair === 'tied') {
    rect(5, 2, 10, 2, hairColor);
    set(4, 3, hairColor); set(11, 3, hairColor);
    set(11, 4, hairColor); set(12, 4, hairColor); set(12, 5, hairColor); set(11, 5, hairColor);
  }
  // bald = nothing

  // Hat
  if (hat === 'cap') {
    rect(5, 1, 10, 2, HT);
    rect(10, 2, 12, 2, HT);
  } else if (hat === 'wizard') {
    set(7, 0, HT); set(8, 0, HT);
    rect(6, 1, 9, 1, HT);
    rect(5, 2, 10, 2, HT);
    rect(4, 3, 11, 3, HT);
    set(7, 1, AC);
  } else if (hat === 'hood') {
    rect(4, 2, 11, 3, HT);
    set(3, 3, HT); set(12, 3, HT);
    set(4, 4, HT); set(11, 4, HT);
    set(4, 5, HT); set(11, 5, HT);
    set(4, 6, HT);
  } else if (hat === 'crown') {
    set(5, 1, HT); set(7, 1, HT); set(9, 1, HT);
    rect(5, 2, 10, 2, HT);
    set(7, 0, AC);
  } else if (hat === 'bandana') {
    rect(5, 3, 10, 3, HT);
    set(4, 3, HT); set(11, 3, HT);
  } else if (hat === 'top') {
    rect(6, 0, 9, 2, HT);
    rect(5, 2, 10, 2, HT);
    rect(4, 3, 11, 3, HT);
  } else if (hat === 'horns') {
    set(5, 1, HT); set(5, 2, HT);
    set(10, 1, HT); set(10, 2, HT);
  }

  // Neck
  set(7, 9, SK); set(8, 9, SK);

  // Body (rows 10-15)
  rect(4, 10, 11, 10, BD);
  rect(4, 11, 11, 14, BD);
  set(4, 15, BD); set(11, 15, BD);
  rect(5, 15, 10, 15, BD);

  // Body outline
  for (let row = 10; row <= 15; row++) {
    set(3, row, OL); set(12, row, OL);
  }

  // Accent stripe / belt
  if (accent) {
    hline(4, 11, 13, AC);
  }

  // Arms
  set(3, 14, BD); set(12, 14, BD);
  set(2, 14, SK); set(13, 14, SK);
  set(2, 15, SK); set(13, 15, SK);
  set(3, 15, BD); set(12, 15, BD);

  // Legs (sitting cross-legged)
  rect(4, 16, 6, 17, BD);
  rect(9, 16, 11, 17, BD);
  // Feet
  rect(3, 17, 6, 18, OL);
  rect(9, 17, 12, 18, OL);

  // Dead state
  if (dead) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 16; x++) {
        if (grid[y][x] && grid[y][x] !== OL) grid[y][x] = SP.dead;
      }
    }
    set(6, 5, '#3a1a1a'); set(9, 5, '#3a1a1a');

    if (revealRole === 'werewolf') {
      const EAR = '#a01830'; const EAR2 = '#e23e52';
      set(4, 2, EAR); set(5, 2, EAR2); set(5, 1, EAR);
      set(11, 2, EAR); set(10, 2, EAR2); set(10, 1, EAR);
      set(7, 6, EAR); set(8, 6, EAR);
      set(7, 8, '#ffffff'); set(8, 8, '#ffffff');
    } else if (revealRole === 'doctor') {
      const CR = '#e23e52'; const BG = '#f5f0e0';
      rect(6, 11, 9, 12, BG);
      set(7, 11, CR); set(8, 11, CR);
      set(6, 12, CR); set(7, 12, CR); set(8, 12, CR); set(9, 12, CR);
      set(7, 13, CR); set(8, 13, CR);
    } else if (revealRole === 'detective') {
      const MG = '#ffe58a'; const LN = '#8ab4e8';
      set(1, 13, MG); set(2, 13, MG); set(1, 14, MG); set(2, 14, MG);
      set(0, 14, LN); set(3, 13, LN); set(3, 14, LN);
      set(4, 4, '#7a5030'); set(11, 4, '#7a5030');
    } else if (revealRole === 'maniac') {
      const MK = '#0a0a14';
      rect(5, 5, 10, 5, MK);
      set(6, 6, MK); set(9, 6, MK);
      set(6, 5, '#e23e52'); set(9, 5, '#e23e52');
    }
  }

  if (ghost) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 16; x++) {
        if (grid[y][x]) grid[y][x] = SP.ghost;
      }
    }
  }

  return grid;
}

// Character archetypes for visual variety
const ARCHETYPES: { hair: HairType; hat: HatType; skinIdx: number }[] = [
  { hair: 'short',  hat: null,      skinIdx: 0 },
  { hair: 'long',   hat: null,      skinIdx: 1 },
  { hair: 'curly',  hat: null,      skinIdx: 2 },
  { hair: 'short',  hat: 'wizard',  skinIdx: 0 },
  { hair: 'short',  hat: 'hood',    skinIdx: 1 },
  { hair: 'long',   hat: 'crown',   skinIdx: 3 },
  { hair: 'mohawk', hat: null,      skinIdx: 2 },
  { hair: 'bald',   hat: 'bandana', skinIdx: 1 },
  { hair: 'tied',   hat: null,      skinIdx: 0 },
  { hair: 'short',  hat: 'cap',     skinIdx: 3 },
  { hair: 'bald',   hat: 'top',     skinIdx: 0 },
  { hair: 'short',  hat: 'horns',   skinIdx: 4 },
];

export type CharacterState = 'idle' | 'speaking' | 'dead';

interface CharacterSpriteProps {
  seed?: number;
  color?: string;
  state?: CharacterState;
  scale?: number;
  revealRole?: RevealRole;
}

export default function CharacterSprite({
  seed = 0,
  color = '#f07a22',
  state = 'idle',
  scale = 3,
  revealRole = null,
}: CharacterSpriteProps) {
  const arc = ARCHETYPES[seed % ARCHETYPES.length];
  const skinTone = SP.skin[arc.skinIdx % SP.skin.length];
  const cells = makeCharacter({
    skin: skinTone,
    body: color,
    hair: arc.hair,
    hat: arc.hat,
    accent: SP.outline,
    dead: state === 'dead',
    revealRole,
  });

  const anim = state === 'speaking' ? 'ember-bob 0.5s ease-in-out infinite' : 'none';

  return (
    <div style={{ animation: anim, transformOrigin: 'bottom' }}>
      <PixelSprite cells={cells} w={16} h={20} scale={scale} />
    </div>
  );
}

export { ARCHETYPES, SP };
