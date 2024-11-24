import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getGame } from "@/app/api/game-actions";
import GamePage from "./GamePage";

export async function generateMetadata({ params }: any) {
    const session = await getServerSession();
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

export default async function Page({ params }: any) {
    const session = await getServerSession();
    if (!session) {
        redirect('/api/auth/signin');
    }
    
    const game = await getGame(params.id);
    if (!game) {
        return <div>Game not found</div>;
    }

    return <GamePage initialGame={game} session={session} />;
}