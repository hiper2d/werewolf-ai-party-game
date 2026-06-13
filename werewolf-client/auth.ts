import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import {cookies} from "next/headers"
import {upsertUser} from "@/app/api/user-actions"

// Set on a user's very first sign-in so the redirect callback can send them to the rules
// page once, instead of the default game list. Consumed and cleared in the same request.
const NEW_USER_COOKIE = "ww_new_user"

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
                const isNewUser = await upsertUser(user);
                if (isNewUser) {
                    (await cookies()).set(NEW_USER_COOKIE, "1", {
                        maxAge: 300,
                        path: "/",
                        httpOnly: true,
                        sameSite: "lax",
                    });
                }
            } catch (error) {
                console.error("Failed to update user data in Firebase:", error);
                // Continue with sign in even if Firebase operation fails
            }
            return true
        },
        async redirect({ url, baseUrl }) {
            // First-time users land on the rules page; the flag is one-shot.
            try {
                const cookieStore = await cookies();
                if (cookieStore.get(NEW_USER_COOKIE)) {
                    cookieStore.delete(NEW_USER_COOKIE);
                    return `${baseUrl}/rules`;
                }
            } catch (error) {
                console.error("Failed to read onboarding cookie:", error);
            }

            // Default Auth.js behaviour: keep same-origin/relative targets, otherwise home.
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            try {
                if (new URL(url).origin === baseUrl) return url;
            } catch {
                // fall through
            }
            return baseUrl;
        },
    }
})