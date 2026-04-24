'use client';

import {removeGameById} from "@/app/api/game-actions";
import {useRouter} from "next/navigation";
import {useState} from "react";

interface RemoveGameProps {
    gameId: string;
    ownerEmail: string;
}

export default function RemoveGame({gameId, ownerEmail}: RemoveGameProps) {
    const router = useRouter();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    async function removeGame() {
        await removeGameById(gameId, ownerEmail);
        router.refresh();
    }

    return (
        <>
            <button
                className="pbtn pbtn-ghost pbtn-sm"
                style={{ marginLeft: 8, padding: '8px 12px' }}
                onClick={() => setShowConfirmDialog(true)}
            >
                ✕
            </button>

            {showConfirmDialog && (
                <div
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(5,5,10,0.78)',
                        backdropFilter: 'blur(2px)',
                        zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onClick={() => setShowConfirmDialog(false)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 420, maxWidth: '92vw',
                            background: 'var(--ember-bg-2)',
                            border: '2px solid var(--ember-blood-3)',
                            boxShadow: '0 0 0 2px var(--ember-bg-0), 0 0 0 4px var(--ember-blood-3), 8px 8px 0 rgba(0,0,0,0.6)',
                        }}
                    >
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--ember-bg-0)',
                            borderBottom: '2px solid var(--ember-blood-3)',
                        }}>
                            <div className="pixel-text" style={{ fontSize: 11, color: 'var(--ember-blood-3)', letterSpacing: 2 }}>
                                ▸ CONFIRM REMOVAL
                            </div>
                        </div>
                        <div style={{ padding: 20 }}>
                            <p style={{ color: 'var(--ember-ink-1)', marginBottom: 20, fontSize: 14, lineHeight: 1.55 }}>
                                Are you sure you want to remove this game? This action is permanent.
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                <button className="pbtn pbtn-ghost" onClick={() => setShowConfirmDialog(false)}>
                                    CANCEL
                                </button>
                                <button className="pbtn pbtn-danger" onClick={() => { setShowConfirmDialog(false); removeGame(); }}>
                                    ▸ REMOVE
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
