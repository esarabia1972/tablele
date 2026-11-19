import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tablele Fichas",
  description: "Estrellas y caritas que le dan al chico los adultos que están con él",
  appleWebApp: { capable: true, title: "Fichas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#ffc94d" };

export default function FichasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fondo propio de Fichas (dorado, de "medalla"), para que no se confunda
          con Tablele. Es una capa fija como la de globals.css y queda encima
          de ella por orden en el DOM. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ background: "linear-gradient(160deg, #ffc94d 0%, #ffe6a3 40%, #fff3d6 75%, #ffd9c2 100%)" }}
      />
      {children}
    </>
  );
}
