import { NextResponse, type NextRequest } from "next/server";

// Tablele Fichas vive en la misma app, en otro subdominio (SPEC-fichas.md §8).
//
//   fichas.tablele.com.ar/<x>  →  se sirve /fichas/<x>
//   tablele.com.ar/fichas/...  →  404: Fichas no se ve desde Tablele
//
// En localhost y en los deploys de preview de Vercel /fichas queda accesible
// directo, para poder probar sin configurar el subdominio. Las rutas /api son
// las mismas en los dos hosts y no pasan por acá (ver matcher).

function esHostFichas(host: string): boolean {
  return host.startsWith("fichas.");
}

function permiteRutaDirecta(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
}

export function proxy(request: NextRequest) {
  // El header Host es el que manda: nextUrl.hostname puede venir resuelto al
  // host interno del servidor y no al dominio que pidió el navegador.
  const host = (request.headers.get("host") || request.nextUrl.hostname).split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  const enFichas = path === "/fichas" || path.startsWith("/fichas/");

  if (esHostFichas(host)) {
    if (enFichas) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = path === "/" ? "/fichas" : `/fichas${path}`;
    return NextResponse.rewrite(url);
  }

  if (enFichas && !permiteRutaDirecta(host)) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos la API, los assets de Next y los archivos con extensión.
  matcher: ["/((?!api/|_next/|.*\\.[a-z0-9]+$).*)"],
};
