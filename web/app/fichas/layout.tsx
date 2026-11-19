import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tablele Fichas",
  description: "Estrellas y caritas que le dan al chico los adultos que están con él",
  appleWebApp: { capable: true, title: "Fichas", statusBarStyle: "black-translucent" },
};

export default function FichasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
