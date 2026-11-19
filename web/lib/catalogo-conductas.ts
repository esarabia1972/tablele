// Catálogo genérico de conductas de Tablele Fichas (SPEC-fichas-v3.md §3).
// Es el mismo para todos los chicos; al activarlo, cada chico recibe su copia,
// que la familia puede ajustar (texto, imagen, Vale Doble).
//
// Redactadas para completar "¡Gracias por …!", en positivo y hablándole al
// chico. `picto` es el id de ARASAAC (CC BY-NC-SA, Gobierno de Aragón).
// La `clave` no se cambia nunca: identifica la copia de cada chico.

export type ItemCatalogo = { clave: string; texto: string; picto: number };

export const CATALOGO: readonly ItemCatalogo[] = [
  { clave: "esperar-turno", texto: "esperar tu turno", picto: 7158 },
  { clave: "terminar-tarea", texto: "terminar la tarea", picto: 32814 },
  { clave: "palabras-lindas", texto: "hablar con palabras lindas", picto: 6517 },
  { clave: "calmarse", texto: "calmarte cuando te enojás", picto: 31310 },
  { clave: "pedir-ayuda", texto: "pedir ayuda con palabras", picto: 19524 },
  { clave: "hacer-caso", texto: "hacer caso a la primera", picto: 22007 },
  { clave: "guardar-juguetes", texto: "guardar tus juguetes", picto: 8680 },
  { clave: "compartir", texto: "compartir tus cosas", picto: 16623 },
  { clave: "por-favor-gracias", texto: "decir por favor y gracias", picto: 8195 },
  { clave: "tratar-bien-hermano", texto: "tratar bien a tu hermano", picto: 2423 },
  { clave: "levantar-mano", texto: "levantar la mano para hablar", picto: 28419 },
  { clave: "sentado-clase", texto: "quedarte sentado en clase", picto: 25082 },
  { clave: "dejar-tablet", texto: "dejar la tablet cuando terminó el tiempo", picto: 28099 },
  { clave: "comer-mesa", texto: "comer sentado en la mesa", picto: 6456 },
  { clave: "lavar-dientes", texto: "lavarte los dientes", picto: 6971 },
  { clave: "vestirse", texto: "vestirte solo", picto: 6627 },
  { clave: "dormir-horario", texto: "ir a dormir a horario", picto: 2369 },
  { clave: "ayudar-casa", texto: "ayudar en casa", picto: 32648 },
];

export function itemCatalogo(clave: string): ItemCatalogo | undefined {
  return CATALOGO.find((c) => c.clave === clave);
}
