import db from "@/config/firebase";
import styles from './Games.module.css';

import Link from 'next/link';
import {collection, getDocs} from 'firebase/firestore'
import CreateGame from './components/CreateGame';


/*export const dynamic = 'auto',
    dynamicParams = true,
    revalidate = 0,
    fetchCache = 'auto',
    runtime = 'nodejs',
    preferredRegion = 'auto'*/


export default async function GamePages() {

    const collectionRef = collection(db, 'games')
    const q = await getDocs(collectionRef)

    const documents = q.docs.map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        description: doc.data().description,
    }));

    return(
        <main className="flex min-h-screen flex-col items-center justify-between sm:p-24 p-4">
            <div className="z-10 w-full max-w-4xl items-center justify-between text-sm lg:flex">
                <h1 className="text-4xl p-4 text-center">Game List</h1>
                <div className="bg-slate-800 p-4 rounded-lg">
                    <CreateGame/>
                    <ul>
                        {documents?.map((game) => (
                            <li key={game.id} className="my-4 w-full flex justify-between bg-slate-950">

                                    <div className="p-4 w-full flex justify-between">
                                        <Link href={`/games/${game.id}`}>
                                            <span className="capitalize">{game.name}</span>
                                        </Link>
                                        <span>{game.description}</span>
                                    </div>
                                <button className="ml-8 p-4 border-l-2 border-slate-900 hover:bg-slate-900 w-16">X
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>
    );
}

function GameDetails({game}: any) {
    const {id, name} = game || {};

    return (
        <Link href={`/games/${id}`}>
            <div className={styles.game}>
                <h2>{id}</h2>
                <h5>{name}</h5>
            </div>
        </Link>
    );
}