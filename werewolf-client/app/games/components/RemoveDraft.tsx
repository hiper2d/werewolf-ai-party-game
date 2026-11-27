'use client';

import {deletePreviewDraft} from "@/app/api/preview-draft-actions";
import {useRouter} from "next/navigation";
import {useState} from "react";

/** The remove button of a saved preview in the game list (RemoveGame's twin). */
export default function RemoveDraft({draftId}: {draftId: string}) {
    const router = useRouter();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    async function removeGame() {
        await deletePreviewDraft(draftId);
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
                title="Remove draft"
            >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
            </button>

            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-xl)] p-6 max-w-md mx-4 shadow-pop">
                        <h3 className="text-[16px] font-semibold text-[var(--fg-0)] mb-3">
                            Remove this draft?
                        </h3>
                        <p className="text-[13px] text-[var(--fg-1)] mb-6">
                            The generated cast and story will be gone. This cannot be undone.
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
                                Remove Draft
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
