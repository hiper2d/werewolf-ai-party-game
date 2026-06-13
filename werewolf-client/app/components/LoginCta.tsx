'use client';

import { useLoginDialog } from '@/app/providers/LoginDialogProvider';

export default function LoginCta({
    label,
    callbackUrl,
    className,
}: {
    label: string;
    callbackUrl?: string;
    className?: string;
}) {
    const { openLoginDialog } = useLoginDialog();
    return (
        <button type="button" onClick={() => openLoginDialog(callbackUrl)} className={className}>
            {label}
        </button>
    );
}
