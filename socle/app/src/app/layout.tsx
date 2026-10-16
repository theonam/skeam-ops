import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { appIdentity } from "@/config/app";
import "./globals.css";

/** Mise en page racine. Origine : egm-app `src/app/layout.tsx`, identité tirée des variables d'environnement. */
export function generateMetadata(): Metadata {
  const app = appIdentity();
  return {
    title: { default: app.name, template: `%s · ${app.name}` },
    description: app.description,
    applicationName: app.name,
    appleWebApp: { capable: true, title: app.shortName, statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
    robots: { index: false, follow: false },
  };
}

export function generateViewport(): Viewport {
  return { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: appIdentity().themeColor };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
