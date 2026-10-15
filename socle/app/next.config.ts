import type { NextConfig } from "next";

/**
 * Configuration Next.js. Origine : egm-app `next.config.ts`, sans Cache Components : chaque page qui lit
 * la session est rendue à la demande, ce qui simplifie le code des applications clients.
 * En-têtes de sécurité par défaut, nouveaux dans le socle.
 */
const nextConfig: NextConfig = {
  // Paquets natifs ou volumineux : restent côté serveur, hors du bundle.
  serverExternalPackages: ["@node-rs/argon2", "sharp", "playwright-core"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
