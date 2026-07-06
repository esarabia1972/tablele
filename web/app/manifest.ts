import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tablele",
    short_name: "Tablele",
    description: "Juegos para aprender a leer con el método SELEC",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#b9e6ff",
    theme_color: "#7ec8ff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
