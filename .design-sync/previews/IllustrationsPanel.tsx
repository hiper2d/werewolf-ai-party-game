import React from 'react';
import { IllustrationsPanel } from 'werewolf-client';

// Inline SVGs stand in for the generated draft images (an authed route in the
// app, unreachable from previews). Designs should always pass `imageUrlFn`.
const svgUrl = (svg: string) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
const PORTRAIT = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92" viewBox="0 0 92 92"><rect width="92" height="92" fill="#2b3242"/><circle cx="46" cy="34" r="17" fill="#b6c0d2"/><path d="M14 92c3-32 15-46 32-46s29 14 32 46z" fill="#b6c0d2"/></svg>`,
);
const SCENE = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="#1e2432"/><circle cx="330" cy="52" r="26" fill="#dfe6f2"/><path d="M0 225 90 120l70 70 60-90 80 95 100-60v90z" fill="#2c3547"/><path d="M0 225l110-70 90 45 90-65 110 50v40z" fill="#232b3b"/></svg>`,
);
const imageUrlFn = (key: string) => (key === 'scene-welcome' ? SCENE : PORTRAIT);

const cast = [
    { key: 'gm', name: 'Game Master', kind: 'gm' as const },
    { key: 'you', name: 'You', kind: 'you' as const },
    { key: 'miriam', name: 'Miriam', kind: 'bot' as const },
    { key: 'jonas', name: 'Jonas', kind: 'bot' as const },
    { key: 'petra', name: 'Petra', kind: 'bot' as const },
    { key: 'aldo', name: 'Aldo', kind: 'bot' as const },
    { key: 'sable', name: 'Sable', kind: 'bot' as const },
    { key: 'tomas', name: 'Tomas', kind: 'bot' as const },
];

const drawnDraft: any = {
    status: 'ready',
    version: 3,
    keys: cast.map(c => c.key),
    avatarVariants: {},
    avatarVersions: {},
    hasScene: true,
    stages: { portraits: true, scene: true },
    error: null,
};

const Frame = ({ children }: { children: React.ReactNode }) => <div style={{ width: 720 }}>{children}</div>;

/** Nothing drawn yet: the pitch plus the Generate call-to-action. */
export function Ready() {
    return (
        <Frame>
            <IllustrationsPanel draft={null} cast={cast} castChanged={false} busy={false} error={null} onGenerate={() => {}} />
        </Frame>
    );
}

/** A draw in flight: spinner line, stage progress bar, shimmer placeholders. */
export function Drawing() {
    const draft: any = { ...drawnDraft, status: 'generating', hasScene: false, stages: { portraits: true, scene: false } };
    return (
        <Frame>
            <IllustrationsPanel draft={draft} cast={cast} castChanged={false} busy={false} error={null} onGenerate={() => {}} />
        </Frame>
    );
}

/** The finished set: opening scene, portrait grid with role-tinted captions, redraw button. */
export function Drawn() {
    return (
        <Frame>
            <IllustrationsPanel draft={drawnDraft} cast={cast} castChanged={false} busy={false} error={null} onGenerate={() => {}} imageUrlFn={imageUrlFn} />
        </Frame>
    );
}

/** Drawn, but the cast was renamed since — the stale-set warning shows. */
export function CastChanged() {
    return (
        <Frame>
            <IllustrationsPanel draft={drawnDraft} cast={cast} castChanged={true} busy={false} error={null} onGenerate={() => {}} imageUrlFn={imageUrlFn} />
        </Frame>
    );
}
