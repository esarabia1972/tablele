import { NextResponse } from "next/server";
import allowlist from "@/data/allowlist.json";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ ok: false, message: "Email inválido" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    const user = allowlist.find(
      (entry: { email: string; nombre: string }) => 
        entry.email.toLowerCase() === normalizedEmail
    );

    if (user) {
      return NextResponse.json({ ok: true, nombre: user.nombre });
    } else {
      return NextResponse.json({ ok: false, message: "Este email no tiene acceso todavía" });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, message: "Error interno del servidor" }, { status: 500 });
  }
}
