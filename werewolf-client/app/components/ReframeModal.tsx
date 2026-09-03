'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AvatarFraming, CARD_ASPECT, MIN_CARD_HEIGHT_FRACTION } from '@/app/api/game-models';
import { cardFocus, circleFocusOnSheet, fitCard, fitCircle, focusToBackground, ImageSize } from '@/app/utils/avatar-framing';

interface ReframeModalProps {
    name: string;                 // header line
    sheetUrl: string;             // the map the portrait was cut from
    framing: AvatarFraming;       // current, sheet px
    initial: AvatarFraming;       // what "Reset to the drawn crop" restores
    // Rejects → the error shows inline and the modal stays open.
    onSave: (framing: AvatarFraming) => Promise<void>;
    onClose: () => void;
    // Mannequins are pencil-on-white and render multiplied over the
    // character's gradient everywhere in the game; pass that gradient so the
    // previews here show the same tinted result, not the raw white sketch.
    blendGradient?: [string, string];
}

type DragMode = 'move' | 'size' | 'circle' | 'circleSizeX' | 'circleSizeY';

const MONO_LABEL = 'font-mono text-[10px] uppercase tracking-[0.08em]';
const HANDLE = 'absolute w-[14px] h-[14px] rounded-full bg-white border-2 border-[var(--bg-1)] shadow-[0_1px_4px_rgba(0,0,0,0.6)]';

/**
 * Two-stage crop editor over a portrait sheet: where the 3:4 card sits on
 * the sheet, then where the round avatar sits inside that card. Every
 * preview is the same sheet positioned by CSS, so dragging costs nothing —
 * only Save leaves the browser. Pure/presentational: the caller decides what
 * saving means (re-cut a draft card, record a mannequin framing…).
 * @category Game
 */
export default function ReframeModal({ name, sheetUrl, framing: framingProp, initial, onSave, onClose, blendGradient }: ReframeModalProps) {
    const [framing, setFraming] = useState<AvatarFraming>(framingProp);
    // The sheet's pixel size, read off the loaded image: the geometry lives
    // in sheet pixels, the DOM in fractions.
    const [sheet, setSheet] = useState<ImageSize | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, saving]);

    const onSheetLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const size = { width: img.naturalWidth, height: img.naturalHeight };
        setSheet(size);
        // Snap whatever was stored into this sheet's bounds once we know them.
        setFraming(f => ({ card: fitCard(f.card, size), circle: fitCircle(f.circle) }));
    };

    const startDrag = useCallback((mode: DragMode, e: React.PointerEvent) => {
        if (!sheet || saving) return;
        e.preventDefault();
        e.stopPropagation();
        const onCard = mode !== 'move' && mode !== 'size';
        const rect = (onCard ? cardRef : stageRef).current?.getBoundingClientRect();
        if (!rect) return;
        const start = { card: { ...framing.card }, circle: { ...framing.circle } };
        const px = e.clientX, py = e.clientY;
        const move = (ev: PointerEvent) => {
            const fx = (ev.clientX - px) / rect.width;
            const fy = (ev.clientY - py) / rect.height;
            if (mode === 'move') {
                setFraming(f => ({ ...f, card: fitCard({ ...start.card, left: start.card.left + fx * sheet.width, top: start.card.top + fy * sheet.height }, sheet) }));
            } else if (mode === 'size') {
                // Diagonal handle: average the horizontal pull and the vertical
                // pull, both expressed as card height in sheet pixels.
                const dh = (fx * sheet.width / CARD_ASPECT + fy * sheet.height) / 2;
                setFraming(f => ({ ...f, card: fitCard({ ...start.card, height: start.card.height + dh }, sheet) }));
            } else if (mode === 'circle') {
                setFraming(f => ({ ...f, circle: fitCircle({ ...start.circle, x: start.circle.x + fx, y: start.circle.y + fy }) }));
            } else {
                // The circle is square in card-width units; a vertical pull
                // (a fraction of the taller card) converts through the aspect.
                const dd = mode === 'circleSizeY' ? fy / CARD_ASPECT : fx;
                setFraming(f => ({ ...f, circle: fitCircle({ ...start.circle, d: start.circle.d + dd }) }));
            }
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }, [framing, sheet, saving]);

    const setCardHeightPercent = (value: number) => {
        if (!sheet) return;
        setFraming(f => ({ ...f, card: fitCard({ ...f.card, height: (value / 100) * sheet.height }, sheet) }));
    };
    const setCirclePercent = (value: number) => {
        setFraming(f => ({ ...f, circle: fitCircle({ ...f.circle, d: value / 100 }) }));
    };

    const handleSave = async () => {
        if (saving) return;
        setSaving(true);
        setError(null);
        try {
            await onSave(framing);
        } catch (err: any) {
            setError(err?.message ?? 'Saving the crop failed.');
            setSaving(false);
        }
    };

    const { card, circle } = framing;
    const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
    const frameStyle = sheet ? {
        left: pct(card.left / sheet.width),
        top: pct(card.top / sheet.height),
        width: pct(card.width / sheet.width),
    } : { left: 0, top: 0, width: 0 };
    const cardBg = sheet ? focusToBackground(cardFocus(card, sheet)) : null;
    const avatarBg = sheet ? focusToBackground(circleFocusOnSheet(framing, sheet)) : null;
    const previewStyle = (bg: { backgroundSize: string; backgroundPosition: string } | null): React.CSSProperties => {
        if (!bg) return {};
        if (!blendGradient) {
            return { backgroundImage: `url(${sheetUrl})`, backgroundRepeat: 'no-repeat', backgroundSize: bg.backgroundSize, backgroundPosition: bg.backgroundPosition };
        }
        return {
            backgroundImage: `url(${sheetUrl}), linear-gradient(135deg, ${blendGradient[0]} 0%, ${blendGradient[1]} 100%)`,
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: `${bg.backgroundSize}, 100% 100%`,
            backgroundPosition: `${bg.backgroundPosition}, 0 0`,
            backgroundBlendMode: 'multiply, normal',
        };
    };
    // Slider bounds: the card can't be shorter than the minimum or taller than
    // what fits the sheet at 3:4.
    const minHeightPct = Math.round(MIN_CARD_HEIGHT_FRACTION * 100);
    const maxHeightPct = sheet ? Math.floor(Math.min(sheet.height, sheet.width / CARD_ASPECT) / sheet.height * 100) : 100;
    const heightPct = sheet ? Math.round(card.height / sheet.height * 100) : minHeightPct;
    const readout = `${Math.round(card.left)}, ${Math.round(card.top)} · ${Math.round(card.width)}×${Math.round(card.height)}px`;

    return (
        <div
            className="fixed inset-0 z-[60] grid place-items-center p-[clamp(12px,3vw,28px)]"
            style={{ background: 'var(--overlay)' }}
            onClick={() => { if (!saving) onClose(); }}
        >
            <div
                className="w-full max-w-[760px] max-h-full overflow-auto bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-xl)] shadow-pop flex flex-col"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Reframe ${name}'s portrait`}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-[18px] py-4 border-b border-[var(--line-1)]">
                    <div className="min-w-0">
                        <div className={`${MONO_LABEL} text-[var(--fg-2)]`}>Reframe portrait</div>
                        <div className="text-[16px] font-semibold tracking-[-0.01em] text-[var(--fg-0)]">{name}</div>
                    </div>
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Close"
                        className="w-[30px] h-[30px] flex-none rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-2)] text-[var(--fg-1)] grid place-items-center hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] disabled:opacity-50 transition-all duration-[120ms]"
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
                    </button>
                </div>

                <div className="p-[18px] flex gap-5 flex-wrap items-start">
                    {/* 1 · Card on the sheet */}
                    <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-2.5">
                        <div className="flex items-baseline gap-2">
                            <span className={`${MONO_LABEL} text-[var(--accent)]`}>1 · Card on the sheet</span>
                            <span className="text-[12px] text-[var(--fg-3)]">drag, resize from the corner</span>
                        </div>
                        <div
                            ref={stageRef}
                            className="relative rounded-[var(--radius-md)] overflow-hidden bg-[var(--bg-2)] border border-[var(--line-2)] select-none"
                            style={{ touchAction: 'none' }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- authed dynamic route / static sheet */}
                            <img src={sheetUrl} alt="The drawn portrait sheet" draggable={false} onLoad={onSheetLoad} className="w-full block" />
                            {sheet && (
                                <div
                                    onPointerDown={e => startDrag('move', e)}
                                    className="absolute border-2 border-[var(--accent)] rounded-[var(--radius-md)] box-border cursor-grab active:cursor-grabbing"
                                    style={{ ...frameStyle, aspectRatio: '3 / 4', boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)' }}
                                >
                                    <span
                                        onPointerDown={e => startDrag('size', e)}
                                        className="absolute right-1 bottom-1 w-4 h-4 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-1)] shadow-[0_1px_4px_rgba(0,0,0,0.6)] cursor-nwse-resize"
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block mb-1.5 text-[12px] font-medium text-[var(--fg-1)]">Card size</label>
                            <input
                                type="range"
                                min={minHeightPct}
                                max={maxHeightPct}
                                value={heightPct}
                                disabled={!sheet || saving}
                                onChange={e => setCardHeightPercent(Number(e.target.value))}
                                className="w-full"
                                style={{ accentColor: 'var(--accent)' }}
                                aria-label="Card size"
                            />
                        </div>
                    </div>

                    {/* 2 · Avatar in the card */}
                    <div className="flex-[1_1_220px] min-w-[180px] flex flex-col gap-2.5">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className={`${MONO_LABEL} text-[var(--fg-0)]`}>2 · Avatar in the card</span>
                            <span className="text-[12px] text-[var(--fg-3)]">drag the circle</span>
                        </div>
                        <div
                            ref={cardRef}
                            className="relative w-full max-w-[240px] aspect-[3/4] rounded-[var(--radius-md)] overflow-hidden border border-[var(--line-2)] bg-[var(--bg-2)] select-none"
                            style={{ touchAction: 'none', ...previewStyle(cardBg) }}
                        >
                            {sheet && (
                                <div
                                    onPointerDown={e => startDrag('circle', e)}
                                    title="Drag to place the avatar circle"
                                    className="absolute border-2 border-white rounded-full box-border cursor-grab active:cursor-grabbing hover:bg-white/[.08]"
                                    style={{ left: pct(circle.x), top: pct(circle.y), width: pct(circle.d), aspectRatio: '1 / 1', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
                                >
                                    <span onPointerDown={e => startDrag('circleSizeX', e)} className={`${HANDLE} right-[3px] top-1/2 -mt-[7px] cursor-ew-resize`} />
                                    <span onPointerDown={e => startDrag('circleSizeY', e)} className={`${HANDLE} left-1/2 bottom-[3px] -ml-[7px] cursor-ns-resize`} />
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block mb-1.5 text-[12px] font-medium text-[var(--fg-1)]">Avatar size</label>
                            <input
                                type="range"
                                min={15}
                                max={100}
                                value={Math.round(circle.d * 100)}
                                disabled={!sheet || saving}
                                onChange={e => setCirclePercent(Number(e.target.value))}
                                className="w-full"
                                style={{ accentColor: 'var(--accent)' }}
                                aria-label="Avatar size"
                            />
                        </div>
                    </div>

                    {/* Result */}
                    <div className="flex-[1_1_120px] min-w-[110px] flex flex-col gap-3">
                        <span className={`${MONO_LABEL} text-[var(--fg-2)]`}>Result</span>
                        <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex flex-col gap-1.5 items-center">
                                <div className="w-[72px] aspect-[3/4] rounded-[var(--radius-md)] border border-[var(--line-2)] bg-[var(--bg-2)]" style={previewStyle(cardBg)} />
                                <span className="font-mono text-[9px] tracking-[0.08em] text-[var(--fg-3)]">CARD</span>
                            </div>
                            <div className="flex flex-col gap-1.5 items-center">
                                <div className="w-[46px] h-[46px] rounded-full border border-[var(--line-2)] bg-[var(--bg-2)]" style={previewStyle(avatarBg)} />
                                <span className="font-mono text-[9px] tracking-[0.08em] text-[var(--fg-3)]">AVATAR</span>
                            </div>
                        </div>
                        <span className="font-mono text-[10px] leading-[1.4] text-[var(--fg-3)]">{readout}</span>
                        <button
                            type="button"
                            disabled={!sheet || saving}
                            onClick={() => setFraming(sheet ? { card: fitCard(initial.card, sheet), circle: fitCircle(initial.circle) } : initial)}
                            className="px-3 py-[7px] text-[12px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--fg-1)] hover:bg-[var(--bg-3)] hover:text-[var(--fg-0)] disabled:opacity-50 transition-all duration-[120ms]"
                        >
                            Reset to the drawn crop
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2.5 flex-wrap px-[18px] py-3.5 border-t border-[var(--line-1)]">
                    <span className="text-[12px] text-[var(--fg-3)]">Only this character&rsquo;s crop changes &mdash; nothing is redrawn.</span>
                    {error && <span className="text-[12px] text-[var(--danger)]">{error}</span>}
                    <span className="flex-1" />
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-3.5 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-1)] hover:bg-[var(--bg-4)] hover:text-[var(--fg-0)] disabled:opacity-50 transition-all duration-[120ms]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!sheet || saving}
                        className="px-4 py-2 text-[13px] font-semibold rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-fg)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[120ms]"
                    >
                        {saving ? 'Saving…' : 'Save crop'}
                    </button>
                </div>
            </div>
        </div>
    );
}
