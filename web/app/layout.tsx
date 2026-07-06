import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tablele",
  description: "App web para crear tableros de aprendizaje de lectura",
  appleWebApp: {
    capable: true,
    title: "Tablele",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#7ec8ff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <div className="w-full max-w-[1100px] px-4 pb-6 flex flex-col items-center flex-1">
          {children}
        </div>
      </body>
    </html>
  );
}
