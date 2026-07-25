import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inkline · İngilizce Writing Koçu",
    short_name: "Inkline",
    description:
      "Canlı AI destekli, yazma odaklı interaktif İngilizce öğrenme uygulaması.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F4ED", // --paper, never pure white
    theme_color: "#F7F4ED",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
