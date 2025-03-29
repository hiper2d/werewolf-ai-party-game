# Upgrade Guide (NextAuth.js v5)

This guide applies to `next-auth` upgrades for Next.js users. If you're not upgrading to `next-auth@5`, you can skip to the [Installation](https://authjs.dev/getting-started/installation) section.

NextAuth.js version 5 is a major rewrite of the `next-auth` package. While we've introduced as few breaking changes as possible, this document will guide you through the migration process.

Start by installing the latest version of `next-auth` with the `beta` tag:

```bash
npm install next-auth@beta
# or
pnpm add next-auth@beta
# or
yarn add next-auth@beta
# or
bun add next-auth@beta
```

## New Features

### Main Changes

- **App Router-first**: Prioritizes the App Router (`pages/` is still supported).
- **OAuth support on preview deployments**: [Read more](https://authjs.dev/getting-started/deployment#securing-a-preview-deployment)
- **Simplified setup**: Shared configuration with inferred environment variables.
- **New `account()` callback on providers**: [Documentation](https://authjs.dev/reference/core/providers#account)
- **Edge-compatible**: Enhanced compatibility with edge environments.

### Universal `auth()`

- **Single authentication method**: Use `auth()` instead of `getServerSession`, `getSession`, `withAuth`, `getToken`, and `useSession`. [Learn more](https://authjs.dev/getting-started/migrating-to-v5#authenticating-server-side)

## Breaking Changes

- **Stricter OAuth/OIDC compliance**: Auth.js now builds on `@auth/core` with stricter adherence to OAuth/OIDC specifications, which might affect some existing OAuth providers. [See open issues](https://github.com/nextauthjs/next-auth/issues) for more details.
- **OAuth 1.0 support deprecated**: OAuth 1.0 is no longer supported.
- **Minimum Next.js version**: Now requires Next.js 14.0 or higher.
- **Imports updated**: The imports `next-auth/next` and `next-auth/middleware` have been replaced. [See details](https://authjs.dev/getting-started/migrating-to-v5#authenticating-server-side)
- **`idToken: false` behavior change**: Setting `idToken: false` now signals `next-auth` to also visit the `userinfo_endpoint` for the final user data, rather than entirely disabling the ID token validation.

## Migration

### Configuration File

To streamline configuration, move your `authOptions` to a root-level `auth.ts` file. This file should export the necessary functions (`auth`, `handlers`, `signIn`, `signOut`, etc.) for use throughout your application.

**Example `auth.ts` file:**

```typescript
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
});
```

**Key Points:**

1. **File Location**: Place this `auth.ts` file at the root of your repository. While you can name it differently, importing from a central `auth.ts` is recommended for consistency.
2. **Provider Imports**: Import providers directly from `next-auth`; no need to install `@auth/core` separately.
3. **Configuration Object**: The object passed to `NextAuth()` remains consistent with previous versions.

### Authenticating Server-side

Replace instances of `getServerSession(authOptions)` with the `auth()` function exported from your `auth.ts` file.

**Before:**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";

export default async function Page() {
  const session = await getServerSession(authOptions);
  return <p>Welcome {session?.user.name}!</p>;
}
```

**After:**

```typescript
import { auth } from "@/auth";

export default async function Page() {
  const session = await auth();
  return <p>Welcome {session?.user.name}!</p>;
}
```

### Authentication Methods

The `auth()` function can be used universally across your application, replacing various previous methods:

| Where                   | v4                                                                 | v5                              |
|------------------------|--------------------------------------------------------------------|----------------------------------|
| **Server Component**   | `getServerSession(authOptions)`                                    | `auth()` call                    |
| **Middleware**         | `withAuth(middleware, subset of authOptions)` wrapper              | `auth` export / `auth()` wrapper|
| **Client Component**   | `useSession()` hook                                                | `useSession()` hook              |
| **Route Handler**      | *Previously not supported*                                         | `auth()` wrapper                 |
| **API Route (Edge)**   | *Previously not supported*                                         | `auth()` wrapper                 |
| **API Route (Node.js)**| `getServerSession(req, res, authOptions)`                          | `auth(req, res)` call            |
| **API Route (Node.js)**| `getToken(req)` *(No session rotation)*                            | `auth(req, res)` call            |
| **getServerSideProps** | `getServerSession(ctx.req, ctx.res, authOptions)`                  | `auth(ctx)` call                 |
| **getServerSideProps** | `getToken(ctx.req)` *(No session rotation)*                        | `auth(req, res)` call            |

### Details – Migrating to NextAuth.js v5

#### Edge compatibility

In v5, all methods and helpers exported from `next-auth` work seamlessly in both Node.js and Edge runtimes.

#### Environment Variables

If you're using a `.env` file, ensure it’s located in the root of your project. v5 expects the following default environment variables:

```env
AUTH_SECRET=...
AUTH_TRUST_HOST=true
```

If you're using GitHub/GitLab/Google as a provider, you will also need:

```env
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...

AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

You can also define a custom prefix for your provider env variables if you are using multiple configurations:

```ts
NextAuth({
  providers: [
    GitHub({
      clientId: process.env.MYAPP_GITHUB_ID,
      clientSecret: process.env.MYAPP_GITHUB_SECRET,
    }),
  ]
})
```

#### TypeScript

Most type issues can be resolved by explicitly importing `NextAuthConfig`:

```ts
import type { NextAuthConfig } from "next-auth"
```

If you are using `auth()` across your app, you can also type it globally in a `global.d.ts`:

```ts
import type { NextAuthConfig } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
  }
}
```

#### Cookies

You can configure session cookies explicitly in v5 via the `cookies` option in the config:

```ts
NextAuth({
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
})
```

This can be useful when you're working with subdomains or non-standard cookie behavior.

### Adapters

**Adapter Packages**: Install database adapters from the `@auth/*-adapter` scope instead of `@next-auth/*-adapter`.

**Example:**

```bash
npm install @auth/prisma-adapter
```

[See the adapters page](https://authjs.dev/adapters) for a list of official adapters, or learn how to [create your own](https://authjs.dev/guides/creating-a-database-adapter).

## Summary

Migrating to NextAuth.js v5 involves updating your configuration to a centralized `auth.ts` file, utilizing the universal `auth()` function across your application, and updating adapter imports to the new `@auth/*-adapter` scope. These changes aim to simplify the setup and enhance the flexibility of authentication in your Next.js applications.
