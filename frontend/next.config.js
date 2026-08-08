/** @type {import('next').NextConfig} */

// GitHub Pages serves a project site under /<repo>, so the build needs a base
// path. Set NEXT_PUBLIC_BASE_PATH in CI; leave it unset for local dev and for
// any host that serves the app from the domain root (e.g. Vercel).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const config = {
  reactStrictMode: true,
  // Emit a fully static site into ./out so it can be served from GitHub Pages.
  // The dashboard is client-only — it talks to the backend API and the chain
  // from the browser — so there is no server behaviour to lose.
  output: 'export',
  basePath,
  // Export /issue as issue/index.html rather than issue.html; GitHub Pages
  // resolves the directory form, but not the bare extensionless path.
  trailingSlash: true,
  images: {
    // GitHub Pages has no image optimisation server.
    unoptimized: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false }
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  },
}

module.exports = config
