import Link from 'next/link';
import {redirect} from 'next/navigation';
import {auth} from '@/auth';
import {listStarterGames} from '@/app/api/starter-game-actions';
import StarterGames from '@/app/games/components/StarterGames';
import {starterDefaultName} from '@/app/utils/starter-games';
import {isGuestEmail} from '@/app/utils/guest';

/**
 * Quick start: ready-made stories a player starts with one click. With no live starter
 * template there is nothing to show, so the page hands over to the setup form.
 */
export default async function StartPage() {
    const session = await auth();
    if (!session?.user?.email) {
        redirect('/?login=true&callbackUrl=%2Fgames%2Fstart');
    }
    if (isGuestEmail(session.user.email)) {
        redirect('/');
    }
    const cards = await listStarterGames();
    if (cards.length === 0) {
        redirect('/games/newgame');
    }

    return (
        <div className="flex flex-col h-full overflow-auto max-w-[1040px] mx-auto w-full">
            <div className="flex justify-between items-end gap-4 mb-6 pt-4 flex-wrap">
                <div>
                    <h1 className="m-0 text-[20px] font-semibold text-[var(--fg-0)] tracking-[-0.01em]">Quick start</h1>
                    <p className="m-0 mt-1 text-[13.5px] text-[var(--fg-2)]">
                        Pick a story and play right away. The cast is ready and waiting at the table.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/games" className="text-[13px] text-[var(--fg-1)] hover:text-[var(--fg-0)] transition-colors duration-[120ms]">My games</Link>
                    <Link
                        href="/games/newgame"
                        className="px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)] bg-transparent text-[var(--fg-1)] border border-[var(--line-2)] hover:bg-[var(--bg-1)] hover:border-[var(--line-3)] hover:text-[var(--fg-0)] transition-all duration-[120ms]"
                    >
                        Create your own game
                    </Link>
                </div>
            </div>
            <StarterGames cards={cards} defaultName={starterDefaultName(session.user.name)} />
        </div>
    );
}
