'use client';

import {useState} from 'react';
import {create} from "@/app/games/actions";
import {useRouter} from "next/navigation";
import {revalidatePath} from "next/cache";

export default function CreateGame() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const router = useRouter();

    async function submit() {
        await create(name, description);

        setName('');
        setDescription('');

        // router.push("/games");
        router.refresh(); // this doesn't reload the component for some reason. But it does work for delete
        router.push("/games");
        // revalidatePath('/games')
    }

    return (
        <form className="grid grid-cols-6 items-center text-black" onSubmit={submit}>
            <input
                className="col-span-2 p-3 border"
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
            />
            <input
                className="col-span-3 p-3 border mx-3"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <button className="text-white bg-slate-950 hover:bg-slate-900 p-3 text-xl" type="submit">+</button>
        </form>
    );
}