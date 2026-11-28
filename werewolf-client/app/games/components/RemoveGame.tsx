'use client';

import {removeGameById} from "@/app/api/game-actions";
import {removeGameSeat} from "@/app/api/seat-actions";
import {useRouter} from "next/navigation";
import {useState} from "react";

interface RemoveGameProps {
    gameId: string;
    ownerEmail: string;
    // Set on a game somebody else hosts: the character this account plays there. The
    // button then LEAVES the game (the character goes on as a bot) and deletes nothing.
    leaveAs?: string;
}

export default function RemoveGame({gameId, ownerEmail, leaveAs}: RemoveGameProps) {
    const router = useRouter();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    async function removeGame() {
        if (leaveAs) {
            await removeGameSeat(gameId, leaveAs);
        } else {
            await removeGameById(gameId, ownerEmail);
        }
        router.refresh();
    }

    function handleRemoveClick() {
        setShowConfirmDialog(true);
    }

    function handleConfirm() {
        setShowConfirmDialog(false);
        removeGame();
    }

    function handleCancel() {
        setShowConfirmDialog(false);
    }

    return (
        <>
            <button
                className="ml-4 px-3 py-2 border-l border-[var(--line-1)] text-[var(--fg-3)] hover:text-[var(--danger)] transition-colors duration-[120ms]"
                onClick={handleRemoveClick}
                title={leaveAs ? "Leave game" : "Remove game"}
            >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
            </button>

            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-xl)] p-6 max-w-md mx-4 shadow-pop">
                        <h3 className="text-[16px] font-semibold text-[var(--fg-0)] mb-3">
                            {leaveAs ? 'Leave this game?' : 'Confirm Game Removal'}
                        </h3>
                        <p className="text-[13px] text-[var(--fg-1)] mb-6">
                            {leaveAs
                                ? `The game goes on without you: ${leaveAs} will be played by a bot. You will need a new link from the host to come back.`
                                : 'Are you sure you want to remove this game? This action is permanent and cannot be undone.'}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--bg-3)] border border-[var(--line-3)] text-[var(--fg-0)] hover:bg-[var(--bg-4)] transition-all duration-[120ms]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:brightness-110 transition-all duration-[120ms]"
                            >
                                {leaveAs ? 'Leave Game' : 'Remove Game'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
