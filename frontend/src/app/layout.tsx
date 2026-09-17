import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import PwaRegister from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "HARTEK CMD Office — Command Center v3",
  description: "Enterprise Operations & Command Dashboard for HARTEK Group CMD Office",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HARTEK CMD",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F2A4A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HARTEK CMD" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
