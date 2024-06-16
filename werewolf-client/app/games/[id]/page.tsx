import styles from '../Games.module.css';
import db from "@/config/firebase";

import {doc, getDoc, collection, where} from 'firebase/firestore'

async function getGame(gameId: string) {
    const gameRef = doc(db, "games", gameId);
    const gameSnap = await getDoc(gameRef);

    if (gameSnap.exists()) {
        return gameSnap.data();
    } else {
        return null;
    }
}

export default async function GamePage({ params }: any) {
    const game: any = await getGame(params.id);

    return (
        <div>
            <h1>games/{game.id}</h1>
            <div className={styles.game}>
                <p>{game.name}</p>
            </div>
        </div>
    );
}