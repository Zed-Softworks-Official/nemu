/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, {buildId, dev, isServer, defaultLoaders, nextRuntime, webpack}) => {
        config.externals.push({
            '@aws-sdk/signature-v4-multi-region': 'commonjs @aws-sdk/signature-v4-multi-region',
        });

        return config
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'pbs.twimg.com',
                port: '',
                pathname: '/profile_images/**'
            }
        ]
    }
}

module.exports = nextConfig
