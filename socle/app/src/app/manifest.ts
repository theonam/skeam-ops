import type { MetadataRoute } from "next";
import { appIdentity } from "@/config/app";

/** Manifeste de l'application installable, tiré des variables d'environnement. Origine : egm-app `src/app/manifest.ts`. */
export default function manifest(): MetadataRoute.Manifest {
  const app = appIdentity();
  return {
    id: "/",
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: app.themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
