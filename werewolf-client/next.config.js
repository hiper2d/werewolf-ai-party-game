/** @type {import('next').NextConfig} */
module.exports = {
    compiler: {
        styledComponents: true,
    },
    // The workspace package ships TypeScript source (no build step); Next compiles it.
    transpilePackages: ['@hiper2d/llm-agents'],
    experimental: {
        staleTimes: {
            dynamic: 30,
            static: 180,
        },
    },
    // Avatar generation slices the portrait grid with sharp at runtime. On
    // Vercel, Next excludes sharp's native binaries from server traces (it
    // assumes sharp is only needed platform-side for next/image), so the
    // linux libvips .so never reached the lambda and `import('sharp')` died
    // with ERR_DLOPEN_FAILED. Force the full sharp install into every
    // function bundle (only the build platform's @img binaries exist in
    // node_modules, so this adds just a few MB).
    outputFileTracingIncludes: {
        '/*': ['node_modules/sharp/**/*', 'node_modules/@img/**/*'],
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    devIndicators: false,
}