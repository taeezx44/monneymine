/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  env: {
    NEXT_TELEMETRY_DISABLED: '1'
  }
}

module.exports = nextConfig
