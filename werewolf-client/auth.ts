import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import {cookies} from "next/headers"
import {upsertUser} from "@/app/api/user-actions"
import {claimGuest, clearGuestCookie, findGuest, readGuestCookie} from "@/app/api/guest-accounts"
import {GUEST_PROVIDER_ID} from "@/app/utils/guest"

// Set on a user's very first sign-in so the redirect callback can send them to the start
// screen once (the ready-made stories; it falls back to the rules page when no story is
// live), instead of the default game list. Consumed and cleared in the same request.
const NEW_USER_COOKIE = "ww_new_user"

export const { auth, handlers, signIn, signOut } = NextAuth({
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
            // GitHub now returns an `iss` parameter on the OAuth callback (RFC 9207). @auth/core <0.41.3
            // validates it against a placeholder issuer and rejects the login; this is the upstream value.
            issuer: "https://github.com/login/oauth",
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!
        }),
        // Guest play (app/utils/guest.ts): a session for a visitor with no account. This
        // provider only signs in a guest that ALREADY exists (minted by `startGuestGame`,
        // which is where the caps are); the id is the guest's bearer secret, the same value
        // as their httpOnly `ww_guest` cookie.
        CredentialsProvider({
            id: GUEST_PROVIDER_ID,
            name: "Guest",
            credentials: { guestId: {} },
            async authorize(credentials) {
                const guest = await findGuest(credentials?.guestId);
                return guest ? { id: guest.email, email: guest.email, name: guest.name } : null;
            },
        }),
    ],
    callbacks: {
        async signIn({ user, account, profile }) { // Correct v5 signature
            // A guest's user doc was written when the guest was minted.
            if (account?.provider === GUEST_PROVIDER_ID) {
                return true
            }
            try {
                const isNewUser = await upsertUser(user);
                // A guest who signs in keeps their game: it moves to the account, and they
                // go back to it instead of to the first-visit rules page.
                let claimedGames: string[] = [];
                try {
                    claimedGames = await claimGuest(await readGuestCookie(), user.email);
                    if (claimedGames.length > 0) {
                        await clearGuestCookie();
                    }
                } catch (error) {
                    console.error("Failed to claim the guest game:", error);
                }
                if (isNewUser && claimedGames.length === 0) {
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
            // First-time users land on the start screen; the flag is one-shot.
            try {
                const cookieStore = await cookies();
                if (cookieStore.get(NEW_USER_COOKIE)) {
                    cookieStore.delete(NEW_USER_COOKIE);
                    return `${baseUrl}/games/start?welcome=1`;
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