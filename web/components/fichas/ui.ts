// Clases compartidas por las pantallas de Fichas, con el mismo lenguaje visual
// que Tablele (tarjetas blancas, sombra "de botón", Comic Sans).

export const card =
  "bg-white/85 p-5 sm:p-6 rounded-[26px] shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full flex flex-col gap-4";
export const input =
  "w-full text-lg p-3 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue bg-white";
export const btn =
  "bg-brand-green text-white rounded-[20px] px-5 py-3 text-lg font-bold shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none disabled:opacity-50";
export const btnGris =
  "bg-gray-200 text-gray-700 rounded-[18px] px-4 py-2 font-bold active:translate-y-1 disabled:opacity-50";
export const titulo = "text-brand-dark text-2xl font-bold";
export const errorTxt = "text-brand-pink font-bold text-center";

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function fechaDia(fecha: string): string {
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
