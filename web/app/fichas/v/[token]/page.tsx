import type { Metadata } from "next";
import { TOKEN_RE } from "@/lib/fichas";
import Entrar from "./Entrar";

// Enlace de invitación. El servidor sólo arma la vista previa que muestran
// WhatsApp y compañía (título, descripción, ícono); no consulta la base, así
// que la vista previa no revela el nombre del chico a quien vea el enlace.

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const titulo = "Te invitaron a dar Fichas 🏅";
  const descripcion = "Tocá el enlace para darle estrellas cuando se porte bien.";
  return {
    title: titulo,
    description: descripcion,
    robots: { index: false, follow: false },
    openGraph: {
      title: titulo,
      description: descripcion,
      siteName: "Tablele Fichas",
      images: [{ url: "/icon.png" }],
      type: "website",
    },
  };
}

export default async function Invitacion({ params }: Props) {
  const { token } = await params;
  return <Entrar token={TOKEN_RE.test(token) ? token : ""} />;
}
