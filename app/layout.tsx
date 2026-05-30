import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Do & Done",
  description: "Google 캘린더 기반 개인 일정 앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Do & Done",
  },
};

export const viewport: Viewport = {
  themeColor: "#3182f6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
