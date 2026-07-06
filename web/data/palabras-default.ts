export type PalabraDefault = {
  letra: string;
  palabra: string;
  emoji: string;
  usar: boolean;
};

export const PALABRAS_DEFAULT: PalabraDefault[] = [
  { letra: "a", palabra: "auto", emoji: "🚗", usar: true },
  { letra: "b", palabra: "bebé", emoji: "👶", usar: true },
  { letra: "c", palabra: "casa", emoji: "🏠", usar: true },
  { letra: "d", palabra: "dedo", emoji: "☝️", usar: true },
  { letra: "e", palabra: "elefante", emoji: "🐘", usar: true },
  { letra: "f", palabra: "fideos", emoji: "🍝", usar: true },
  { letra: "g", palabra: "gato", emoji: "🐱", usar: true },
  { letra: "h", palabra: "helado", emoji: "🍦", usar: true },
  { letra: "i", palabra: "india", emoji: "🐶", usar: true },
  { letra: "j", palabra: "jugo", emoji: "🧃", usar: true },
  { letra: "k", palabra: "kiosco", emoji: "🏪", usar: true },
  { letra: "l", palabra: "luna", emoji: "🌙", usar: true },
  { letra: "m", palabra: "manuel", emoji: "🙋‍♂️", usar: true },
  { letra: "n", palabra: "nene", emoji: "🧒", usar: true },
  { letra: "ñ", palabra: "ñoqui", emoji: "🍝", usar: true },
  { letra: "o", palabra: "oso", emoji: "🐻", usar: true },
  { letra: "p", palabra: "papá", emoji: "👨", usar: true },
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
];

export const SUGERENCIAS_EMOJI: Record<string, string> = {
  auto: "🚗", bebé: "👶", casa: "🏠", dedo: "☝️", elefante: "🐘",
  fideos: "🍝", gato: "🐱", helado: "🍦", india: "🐶", jugo: "🧃",
  kiosco: "🏪", luna: "🌙", manuel: "🙋‍♂️", nene: "🧒", ñoqui: "🍝",
  oso: "🐻", papá: "👨", queso: "🧀", ratón: "🐭", sol: "☀️",
  tractor: "🚜", uva: "🍇", vaca: "🐄", wifi: "📶", xilofón: "🎼",
  yogur: "🥣", zapato: "👟", mamá: "👩", perro: "🐶", agua: "💧"
};
