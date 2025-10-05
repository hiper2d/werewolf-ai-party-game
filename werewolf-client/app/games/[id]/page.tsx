import { redirect } from "next/navigation";
import { getGame } from "@/app/api/game-actions";
import GamePage from "./GamePage";
import { auth } from "@/auth";
import { getUserTier } from "@/app/api/user-actions";

export async function generateMetadata(props: any) {
    const params = await props.params;
    const session = await auth();
    if (!session) {
        redirect('/api/auth/signin');
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
        redirect('/api/auth/signin');
    }
    
    const game = await getGame(params.id);
    if (!game) {
        return <div>Game not found</div>;
    }

    const userTier = await getUserTier(session.user.email!);
    if (game.createdWithTier !== userTier) {
        const searchParams = new URLSearchParams({
            error: 'tier_mismatch',
            blocked: params.id,
        });
        redirect(`/games?${searchParams.toString()}`);
    }

    return <GamePage initialGame={game} session={session} />;
}
