'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import db from "@/config/firebase";

import {doc, addDoc, setDoc, collection} from 'firebase/firestore'
import {randomBytes} from "crypto";

export default function CreateNote() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const router = useRouter();

    const create = async() => {
        console.log(`creating game ${name}`)
        const docRef = await addDoc(
            collection(db, "games"),
            {name: name, description: description}
        );
        console.log("Document written with ID: ", docRef.id);

        setName('');
        setDescription('');

        router.refresh();
    }

    const generateSecureRandomString = (length: number): string => {
        return randomBytes(length).toString('hex').slice(0, length);
    };

    return (
        <form className="grid grid-cols-6 items-center text-black" onSubmit={create}>
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