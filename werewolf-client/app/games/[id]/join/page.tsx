import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/auth';
import { isGuestEmail } from '@/app/utils/guest';
import { readSeatInvite } from '@/app/api/seat-actions';
import JoinSeat from './JoinSeat';

export const metadata = { title: 'Join a game', robots: { index: false } };

/**
 * Where a host's link leads (docs/plan-multiplayer.md, "D"): the place offered, and one
 * button. Opening the page takes nothing: a link preview or a prefetch must not sit down
 * in somebody's game.
 */
export default async function JoinGamePage(props: any) {
    const params = await props.params;
    const token = String((await props.searchParams)?.t || '');
    const here = `/games/${params.id}/join?t=${encodeURIComponent(token)}`;
    const session = await auth();
    const email = session?.user?.email;
    // Signed-in accounts only: a guest is asked to sign in like anybody else.
    if (!email || isGuestEmail(email)) {
        redirect(`/?login=true&callbackUrl=${encodeURIComponent(here)}`);
    }

    const result = await readSeatInvite(params.id, token);
    if (result.ok && result.alreadySeated) {
        redirect(`/games/${params.id}`);
    }
    if (!result.ok) {
        return (
            <div className="max-w-[520px] mx-auto mt-16 px-4">
                <div className="bg-[var(--bg-1)] border border-[var(--line-2)] rounded-[var(--radius-xl)] p-6">
                    <h1 className="text-[18px] font-semibold text-[var(--fg-0)] mb-2">This invitation cannot be used</h1>
                    <p className="text-[13px] text-[var(--fg-1)] mb-4">{result.error}</p>
                    <Link href="/games" className="text-[13px] underline text-[var(--fg-0)]">Go to your games</Link>
                </div>
            </div>
        );
    }
    return <JoinSeat gameId={params.id} token={token} invite={result.invite} />;
}
