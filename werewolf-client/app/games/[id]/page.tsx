import { redirect } from "next/navigation";
import { getGame } from "@/app/api/game-actions";
import GamePage from "./GamePage";
import { auth } from "@/auth";

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

    return <GamePage initialGame={game} session={session} />;
}