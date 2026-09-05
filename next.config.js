/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    serverComponentsExternalPackages: ["@sparticuz/chromium", "playwright-core"],
    outputFileTracingIncludes: {
      "/api/kasse/beleg/[id]/pdf": ["./node_modules/@sparticuz/chromium/**/*"],
    },
  },
  async redirects() {
    return [
      {
        // scribe.animacura.io/ fuehrt direkt ins Scribe-Cockpit.
        // Greift nur fuer diese Subdomain, alle anderen Adressen bleiben unberuehrt.
        source: "/",
        has: [{ type: "host", value: "scribe.animacura.io" }],
        destination: "/scribe",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
