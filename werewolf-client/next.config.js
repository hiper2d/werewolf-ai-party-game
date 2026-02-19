/** @type {import('next').NextConfig} */
module.exports = {
    compiler: {
        styledComponents: true,
    },
    experimental: {
        staleTimes: {
            dynamic: 30,
            static: 180,
        },
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