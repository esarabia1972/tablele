export type PalabraDefault = {
  letra: string;
  palabra: string;
  emoji: string;
  usar: boolean;
  foto?: string; // URL de foto real (reemplaza al emoji si está)
  silabas?: string[]; // override manual, sin UI por ahora (si no está, se calcula con silabear())
};

// Inmutable a propósito: getConfig() y "Restaurar" devuelven SIEMPRE una copia
// (ver palabrasDefault()). Si se entregara esta misma instancia, una mutación
// in-place en cualquier pantalla se le quedaría pegada al usuario siguiente.
export const PALABRAS_DEFAULT: readonly Readonly<PalabraDefault>[] = Object.freeze([
  { letra: "a", palabra: "auto", emoji: "🚗", usar: true },
  { letra: "b", palabra: "bebé", emoji: "👶", usar: true },
  { letra: "c", palabra: "casa", emoji: "🏠", usar: true },
  { letra: "d", palabra: "dedo", emoji: "☝️", usar: true },
  { letra: "e", palabra: "elefante", emoji: "🐘", usar: true },
  { letra: "f", palabra: "fideos", emoji: "🍝", usar: true },
  { letra: "g", palabra: "gato", emoji: "🐱", usar: true },
  { letra: "h", palabra: "helado", emoji: "🍦", usar: true },
  { letra: "i", palabra: "iguana", emoji: "🦎", usar: true },
  { letra: "j", palabra: "jugo", emoji: "🧃", usar: true },
  { letra: "k", palabra: "kiosco", emoji: "🏪", usar: true },
  { letra: "l", palabra: "luna", emoji: "🌙", usar: true },
  { letra: "m", palabra: "mono", emoji: "🐒", usar: true },
  { letra: "n", palabra: "nene", emoji: "🧒", usar: true },
  { letra: "ñ", palabra: "ñoqui", emoji: "🍝", usar: true },
  { letra: "o", palabra: "oso", emoji: "🐻", usar: true },
  { letra: "p", palabra: "pato", emoji: "🦆", usar: true },
  { letra: "q", palabra: "queso", emoji: "🧀", usar: true },
  { letra: "r", palabra: "ratón", emoji: "🐭", usar: true },
  { letra: "s", palabra: "sol", emoji: "☀️", usar: true },
  { letra: "t", palabra: "tractor", emoji: "🚜", usar: true },
  { letra: "u", palabra: "uva", emoji: "🍇", usar: true },
  { letra: "v", palabra: "vaca", emoji: "🐄", usar: true },
  { letra: "w", palabra: "wifi", emoji: "📶", usar: false },
  { letra: "x", palabra: "xilofón", emoji: "🎼", usar: false },
  { letra: "y", palabra: "yogur", emoji: "🥣", usar: true },
  { letra: "z", palabra: "zapato", emoji: "👟", usar: true },
].map((p) => Object.freeze(p)));

/** Copia fresca y mutable del set por defecto. Usar SIEMPRE esto, nunca PALABRAS_DEFAULT. */
export function palabrasDefault(): PalabraDefault[] {
  return PALABRAS_DEFAULT.map((p) => ({ ...p }));
}

export const SUGERENCIAS_EMOJI: Record<string, string> = {
  auto: "🚗", bebé: "👶", casa: "🏠", dedo: "☝️", elefante: "🐘",
  fideos: "🍝", gato: "🐱", helado: "🍦", iguana: "🦎", jugo: "🧃",
  kiosco: "🏪", luna: "🌙", mono: "🐒", nene: "🧒", ñoqui: "🍝",
  oso: "🐻", pato: "🦆", queso: "🧀", ratón: "🐭", sol: "☀️",
  tractor: "🚜", uva: "🍇", vaca: "🐄", wifi: "📶", xilofón: "🎼",
  yogur: "🥣", zapato: "👟", mamá: "👩", perro: "🐶", agua: "💧"
};
