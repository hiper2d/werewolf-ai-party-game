import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import {upsertUser} from "@/app/api/user-actions"

export const { auth, handlers, signIn, signOut } = NextAuth({
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        })
    ],
    callbacks: {
        async signIn({ user, account, profile }) { // Correct v5 signature
            try {
                await upsertUser(user);
            } catch (error) {
                console.error("Failed to update user data in Firebase:", error);
                // Continue with sign in even if Firebase operation fails
            }
            return true
        },
    }
})