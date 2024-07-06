import {auth, config} from "firebase-functions";
import {initializeApp} from "firebase-admin/app";
import {firestore} from "firebase-admin";

initializeApp(config().firebase);

export const onUserCreate = auth.user().onCreate(async (user) => {
    await firestore().collection('users').doc(user.uid).create({
        isAdmin: false,
    })

    return;
});