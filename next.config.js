/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    serverComponentsExternalPackages: ["@sparticuz/chromium", "playwright-core", "@huggingface/transformers", "onnxruntime-node"],
    outputFileTracingExcludes: {
      "*": ["./node_modules/onnxruntime-node/bin/napi-v3/darwin/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/win32/**/*", "./node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**/*"],
    },
    outputFileTracingIncludes: {
      "/api/animahost/whatsapp": ["./.model-assets/**/*", "./docs/animahost/2026-11-24-systemtext-v1.md"],
      "/api/animahost/whatsapp/internal/replay": ["./.model-assets/**/*", "./docs/animahost/2026-11-24-systemtext-v1.md"],
      "/api/animahost/whatsapp/internal/control": ["./.model-assets/**/*", "./docs/animahost/2026-11-24-systemtext-v1.md"],
      "/api/cron/animahost-retrieval": ["./.model-assets/**/*", "./docs/animahost/2026-11-24-systemtext-v1.md"],
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
