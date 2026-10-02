import type { MetadataRoute } from "next";

/**
 * Web app manifest (`/manifest.webmanifest`): name and icons when the portal is added to a
 * home screen. The icons are the brand mark (accent tile with the bolt) in the default
 * customer preset "klar"; the zones link the same files (`APP_ICONS` in `@kundenportal/ui/theme`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kundenportal (Demo)",
    short_name: "Kundenportal",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b6e4f",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon1.png", type: "image/png", sizes: "192x192" },
      { src: "/icon2.png", type: "image/png", sizes: "512x512", purpose: "any" },
      { src: "/icon2.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
