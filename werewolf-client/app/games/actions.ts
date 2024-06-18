'use server'

import {addDoc, collection, deleteDoc, doc} from "firebase/firestore";
import db from "@/config/firebase";

export async function create(name: string, description: string) {
    const docRef = await addDoc(
        collection(db, "games"),
        {name: name, description: description}
    );
}

export async function remove(id: string) {
    await deleteDoc(doc(db, "games", id));
}