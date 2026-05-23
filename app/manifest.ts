import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "개인 대시보드",
    short_name: "대시보드",
    description: "개인 일정·가계부 통합 대시보드",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#0ea5e9",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
