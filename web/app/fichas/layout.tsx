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
          con Tablele. Capa fija con el MISMO z-index (-1) que el body::before de
          globals.css: a igual z-index gana el orden en el DOM, y el ::before va
          primero. Con -10 quedaba debajo del celeste. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-1 pointer-events-none"
        style={{ background: "linear-gradient(160deg, #ffc94d 0%, #ffe6a3 40%, #fff3d6 75%, #ffd9c2 100%)" }}
      />
      {children}
    </>
  );
}
