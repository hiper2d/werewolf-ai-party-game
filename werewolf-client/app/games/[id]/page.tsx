import { redirect } from "next/navigation";
import { getGame } from "@/app/api/game-actions";
import GamePage from "./GamePage";
import { auth } from "@/auth";
import { getUserTier } from "@/app/api/user-actions";
import { canOpenGameOnTier } from "@/app/utils/tier-access";
import { gameForSession } from "@/app/api/game-session-view";

export async function generateMetadata(props: any) {
    const params = await props.params;
    const session = await auth();
    if (!session) {
        redirect(`/?login=true&callbackUrl=${encodeURIComponent(`/games/${params.id}`)}`);
    }

    const game = await getGame(params.id);
    if (!game) {
        return { title: 'Game not found' };
    }

    return {
        title: game.theme,
    };
}

export default async function Page(props: any) {
    const params = await props.params;
    const session = await auth();
    if (!session) {
        redirect(`/?login=true&callbackUrl=${encodeURIComponent(`/games/${params.id}`)}`);
    }

    const game = await getGame(params.id);
    if (!game) {
        return <div>Game not found</div>;
    }

    if (!session.user?.email) {
        redirect(`/?login=true&callbackUrl=${encodeURIComponent(`/games/${params.id}`)}`);
    }

    // Check ownership — redirect if this game belongs to another user
    if (game.ownerEmail && game.ownerEmail !== session.user.email) {
        redirect('/games');
    }

    const userTier = await getUserTier(session.user.email);
    if (!canOpenGameOnTier(game.createdWithTier, userTier)) {
        const searchParams = new URLSearchParams({
            error: 'tier_mismatch',
            blocked: params.id,
        });
        redirect(`/games?${searchParams.toString()}`);
    }

    // The page is a client component: it gets the player's view, not the stored game.
    return <GamePage initialGame={await gameForSession(game)} session={session} />;
}
