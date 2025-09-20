'use client';

import {removeGameById} from "@/app/api/game-actions";
import {useRouter} from "next/navigation";
import {useState} from "react";
import { buttonTransparentStyle } from '@/app/constants';

interface RemoveGameProps {
    gameId: string
}

export default function RemoveGame({gameId}: RemoveGameProps) {
    const router = useRouter();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    async function removeGame() {
        await removeGameById(gameId);
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
            <button className="ml-8 p-4 border-l-2 border-white border-opacity-30 hover:bg-slate-900 w-16" onClick={handleRemoveClick}>
                X
            </button>

            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-gray-900 border border-white border-opacity-30 rounded-lg p-6 max-w-md mx-4">
                        <h3 className="text-xl font-bold text-white mb-4">
                            Confirm Game Removal
                        </h3>
                        <p className="text-white mb-6">
                            Are you sure you want to remove this game? This action is permanent and cannot be undone.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={handleCancel}
                                className={`${buttonTransparentStyle} bg-gray-600 hover:bg-gray-700 border-gray-500`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`${buttonTransparentStyle} bg-red-600 hover:bg-red-700 border-red-500`}
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