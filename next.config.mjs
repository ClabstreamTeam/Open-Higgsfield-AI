/** @type {import('next').NextConfig} */
const repoName = 'Open-Higgsfield-AI';
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true';

const nextConfig = {
  transpilePackages: ['studio'],
  ...(isGitHubPagesBuild ? { output: 'export' } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  ...(isGitHubPagesBuild
    ? {
        basePath: `/${repoName}`,
        assetPrefix: `/${repoName}`,
      }
    : {}),
};

export default nextConfig;
