'use client';

import {removeGameById} from "@/app/api/game-actions";
import {useRouter} from "next/navigation";
import {useState} from "react";
import { buttonTransparentStyle } from '@/app/constants';

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
            <button className="ml-8 p-4 border-l-2 theme-border-subtle hover:opacity-70 w-16" onClick={handleRemoveClick}>
                X
            </button>

            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="theme-bg-card theme-border border rounded-lg p-6 max-w-md mx-4 theme-shadow">
                        <h3 className="text-xl font-bold theme-text-primary mb-4">
                            Confirm Game Removal
                        </h3>
                        <p className="theme-text-primary mb-6">
                            Are you sure you want to remove this game? This action is permanent and cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancel}
                                className={`${buttonTransparentStyle} bg-gray-600 hover:bg-gray-700 border-gray-500 !text-white`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500 !text-white`}
                            >
                                Remove Game
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}