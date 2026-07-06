# Tablele — Documentación de desarrollo

> **Tablele** (tablero + leer): app web para crear tableros de aprendizaje de lectura, inspirada en el método SELEC (etapa global y etapa silábica). Nace de "Juegos de Manu" (`JuegosManu_v2.html`), un juego funcional de una sola página que hoy tiene las palabras hardcodeadas.

**Estado:** borrador inicial · **Deploy objetivo:** Vercel · **Última edición:** 2026-07-05

---

## 1. Visión

No existe un sitio amigable para que familias, docentes y terapeutas armen tableros de lectura personalizados. Tablele permite:

- **Crear tableros** con las palabras significativas de cada niño (su nombre, su mascota, su familia), con emoji o foto real.
- **Jugar** con esos tableros en modos de dificultad creciente, con refuerzo positivo y aprendizaje sin error.
- **Seguir el progreso** por palabra, para saber qué reforzar.

**Usuarios:** el adulto (crea tableros, ve informes) y el niño (juega). Dos experiencias bien separadas.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router) + React | Deploy directo en Vercel, SSG para landing, SPA para el juego |
| Lenguaje | TypeScript | Modelo de datos tipado (Tablero, Palabra, Perfil) |
| Estilos | Tailwind CSS | Rápido, consistente con el estilo lúdico actual |
| Estado / persistencia MVP | localStorage + IndexedDB (fotos) | Sin backend en fase 1; funciona offline |
| Persistencia fase 2 | Vercel Postgres o Supabase + Auth | Cuentas, sincronización y tableros compartidos |
| Audio | Web Speech API (TTS) | Ya probado en JuegosManu (scoring de voces es-AR) |
| Imágenes | Emoji nativo + subida de fotos (canvas resize → IndexedDB / Blob storage) | Fotos reales son clave en SELEC |
| PWA | next-pwa / manifest | Uso en tablet sin conexión |

## 3. Arquitectura y rutas

```
/                      Landing: qué es Tablele, empezar
/tableros              Lista de tableros del usuario (CRUD)
/tableros/nuevo        Editor: crear tablero
/tableros/[id]/editar  Editor: modificar tablero
/jugar/[id]            Menú de juegos del tablero (pantalla del niño)
/jugar/[id]/[modo]     Un modo de juego
/informe/[id]          Estadísticas por palabra (pantalla del adulto)
```

Principio: **todo lo del niño es pantalla completa, sin navegación accidental** (salir del juego requiere gesto de adulto, ej. pulsación larga, como el "borrar historial" actual).

## 4. Modelo de datos

```ts
type Perfil = {
  id: string;
  nombre: string;          // "Manu" — usado en frases de aliento y TTS
  voz?: PreferenciaVoz;    // género/idioma preferido para TTS
};

type Palabra = {
  id: string;
  texto: string;           // minúsculas con acentos
  imagen: { tipo: 'emoji'; valor: string } | { tipo: 'foto'; valor: string /* blob ref */ };
  silabas?: string[];      // ["za","pa","to"] — para etapa silábica
};

type Tablero = {
  id: string;
  nombre: string;          // "Palabras de casa"
  perfilId: string;
  palabras: Palabra[];
  opciones: {
    mayusculas: boolean;   // MAYÚSCULA vs minúscula
    rondas: number;        // default 12
    metaEstrellas: number; // default 20
    premio?: string;       // texto del premio acordado
  };
};

type Estadistica = {
  perfilId: string;
  palabraId: string;
  aciertos: number;
  intentos: number;
  ultimaVez: string;       // ISO date
};
```

## 5. Modos de juego (heredados de JuegosManu, parametrizados por tablero)

1. **👀 Conocer** — presentación tarjeta por tarjeta (imagen + palabra + voz), sin evaluación.
2. **📖 Leo y busco el dibujo** — palabra escrita → elegir imagen entre 3.
3. **🔍 Miro y busco la palabra** — imagen → elegir palabra escrita entre 3.
4. **🃏 Memotest** — parejas palabra–imagen (6 pares).
5. **🦜 El loro dice** — audio → palabra escrita, sin imagen (el más difícil).
6. *(Futuro, etapa silábica SELEC)* **🧩 Armo la palabra** — ordenar sílabas para formar la palabra.

Mecánicas transversales a conservar:

- **Aprendizaje sin error:** el error no penaliza; al 2.º error la opción correcta brilla.
- **Refuerzo:** estrellas por acierto, confeti, frases de aliento con TTS usando el nombre del perfil, premio real acordado al llegar a la meta.
- **Registro:** cada respuesta alimenta `Estadistica` para el informe.

## 6. Editor de tableros (el corazón de Tablele)

- Alta/edición de palabras: texto + selector de emoji **o** foto (cámara/galería, recorte cuadrado, compresión ~256 px).
- Vista previa en vivo de la tarjeta tal como la verá el niño.
- Sugerencias: banco de palabras frecuentes de arranque (mamá, papá, agua, casa...) con emoji predefinido.
- División en sílabas asistida (editable a mano) para la futura etapa silábica.
- Opciones del tablero: mayúsculas/minúsculas, rondas, meta de estrellas, premio.
- Exportar/importar tablero como archivo `.json` (compartir sin backend en fase 1).

## 7. Accesibilidad y UX niño

- Tipografía grande y redondeada, alto contraste, targets ≥ 64 px.
- `aria-label` en todos los botones de solo ícono (deuda del prototipo).
- Sin texto imprescindible para navegar en pantallas del niño (íconos + audio).
- Audio repetible tocando la tarjeta; velocidad TTS lenta (rate ≈ 0.85).
- Evitar `user-select`, menú contextual y zoom accidental en tablets (ya resuelto en el prototipo).

## 8. Deploy en Vercel

- Repo en GitHub → proyecto Vercel con auto-deploy en `main`, previews por PR.
- Dominio: `tablele.com` / `tablele.app` (verificar disponibilidad y registrar).
- Fase 1 sin variables de entorno (todo client-side). Fase 2: `DATABASE_URL`, auth provider.
- Analytics: Vercel Analytics (sin cookies, apto uso con niños).

## 9. Roadmap

| Fase | Alcance |
|---|---|
| **0 — Migración** | Portar JuegosManu a Next.js/TS sin cambios funcionales, palabras aún fijas |
| **1 — MVP Tablele** | Editor de tableros, perfiles, fotos, export/import JSON, PWA offline, deploy Vercel |
| **2 — Cuentas** | Auth, base de datos, tableros en la nube, compartir por link |
| **3 — Etapa silábica** | Modo "armo la palabra" y juegos de sílabas (SELEC etapa 2) |
| **4 — Features a definir** | *(pendiente: lista de features de Esteban)* |

## 10. Decisiones pendientes

- ¿Registro de usuarios desde el MVP o recién en fase 2? (propuesta: fase 2)
- ¿Voces TTS del dispositivo o audio grabado por la familia? (grabar la voz de mamá/papá es muy potente para SELEC — candidato a feature)
- Nombre de dominio definitivo y disponibilidad.
- Licencia / si será gratuito, freemium u open source.
