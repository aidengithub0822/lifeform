import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Splash from "@/components/Splash";

export const metadata: Metadata = {
  title: "lifeform scanner",
  description: "Scan your food, hit your bulk, track the transformation.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    // This is what shows under the icon on the iPhone home screen —
    // kept short and lowercase per the intended look.
    title: "lifeform",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-zinc-950 pb-20 text-white antialiased">
        <ServiceWorkerRegister />
        <Splash />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
