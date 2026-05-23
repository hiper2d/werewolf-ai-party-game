'use client';

import React from 'react';

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

interface CampfireSpriteProps {
  scale?: number;
  phase?: 'day' | 'night' | 'voting' | 'results';
}

export default function CampfireSprite({ scale = 4, phase = 'day' }: CampfireSpriteProps) {
  const OL = '#0a0a14';
  const L1 = '#3a2515';
  const L2 = '#5a3a20';
  const F1 = '#c4421a';
  const F2 = '#f07a22';
  const F3 = '#ffb347';
  const F4 = '#ffe58a';
  const F5 = '#ffffff';
  const dim = phase === 'night' ? 0.6 : 1;

  const rows = [
    '................',
    '................',
    '.......AB.......',
    '......ACBB......',
    '.....ACDCB......',
    '.....CDEDB......',
    '....ACDEECA.....',
    '....CDEFECB.....',
    '...ACDEFEDCA....',
    '...CDEFFEEDC....',
    '..AACDDEEDCAA...',
    '..LLLLLLLLLL....',
    '.LLLMMMMMMLL....',
    'OLLMMMLLLMMLLO..',
    'OOLLMMMMLLLOO...',
    '.OOOOOOOOOOO....',
  ];

  const palette: Record<string, string> = {
    A: F1, B: F1, C: F2, D: F3, E: F4, F: F5, L: L2, M: L1, O: OL,
  };

  const cells: CellGrid = rows.map(r =>
    r.split('').map(ch => ch === '.' ? null : palette[ch])
  );

  return (
    <div style={{ opacity: dim, position: 'relative' }}>
      <PixelSprite
        cells={cells}
        w={16}
        h={16}
        scale={scale}
        style={{ animation: 'ember-flameDance 0.4s steps(1) infinite' }}
      />
    </div>
  );
}
