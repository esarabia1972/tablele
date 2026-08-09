# Tablele — Documento técnico-funcional y guía de reuso

*Estado del código: commit `372dc9b` · Tablele v0.9.1 · Next 16.2.10 / React 19.2.4*

> **Para qué es este documento.** Documentar Tablele tal como está hoy —producto, arquitectura y decisiones— y, en cada pieza, decir qué se puede llevar al proyecto nuevo de **estimulación del lenguaje** y qué no. Los veredictos de reuso están marcados así:
>
> - 🟢 **Copiar** — se lleva casi tal cual, cambiando poco o nada.
> - 🟡 **Adaptar** — la idea sirve, la implementación necesita generalizarse.
> - 🔴 **No reusar** — específico de alfabetización, o deuda técnica que no conviene arrastrar.
>
> Documentos hermanos en esta carpeta: `ANALISIS-refactor-morfosintaxis.md` (comparación conceptual con el proyecto de Leticia) y `Especificacion-tecnica-app-lenguaje.md` (la spec del producto nuevo). Este documento es la contraparte: **qué hay construido y funcionando**.

---

## 1. Qué es Tablele

Una **PWA de lectoescritura** para chicos con discapacidad intelectual, aproximadamente 6 a 10 años. Enseña **lectura global de palabras** siguiendo el método SELEC: el chico aprende la palabra como una unidad visual (no letra por letra), asociándola a una imagen y a su sonido.

**Población y contexto de uso:** un chico por usuario, en tablet, con un adulto (familia o terapeuta) que configura el vocabulario y mira el informe. El chico usa la app solo; el adulto entra a una pantalla aparte.

**Idioma:** español rioplatense, voseo, todo en minúsculas y segunda persona ("tocá", "probá otra vez", "muy bien").

**Alcance actual:** una sola dimensión del lenguaje —**léxico / denominación**: reconocer y leer palabras sueltas—. Dos etapas: **Global** (la palabra completa) y **Silábica** (descomponerla en sílabas). No trabaja oración, morfología ni sintaxis.

### 1.1. Los seis juegos

| Juego | Modo interno | Consigna | Rondas | Da estrella |
|---|---|---|---|---|
| 👀 Conocer | `show` | Presenta la palabra escrita. Sin imagen y sin audio: el chico la lee. Botón "Próximo". | **Todas** las palabras activas | No |
| 📖 Leo y Busco | `wp` | Ve la palabra escrita → toca la imagen correcta entre 3 | 6 | Sí |
| 🔍 Miro y Busco | `pw` | Ve la imagen → toca la palabra correcta entre 3 | 6 | Sí |
| 🦜 El Loro Dice | `listen` | Escucha la palabra → toca la palabra escrita entre 3 | 6 | Sí |
| 🃏 Memotest | `memo` | Aparea 6 pares palabra ↔ imagen (12 cartas, grilla 3×4) | 6 pares | Sí |
| 🧩 Armo la Palabra | `silabas` | Ve la palabra → ordena sus sílabas arrastrándolas a casillas. Solo en etapa **Silábica** | 6 | Sí |

Regla transversal deliberada: **cada juego quita una ayuda distinta**. En "Conocer" no hay imagen ni voz que resuelvan la palabra; en "Leo y Busco" y "Miro y Busco" la tarjeta del enunciado es `pointer-events-none`, así que no hay audio ni por accidente; en "Armo la palabra" no se dicta la palabra al empezar ni se lee cada sílaba al agarrarla —la voz llega al acertar, diciendo la palabra completa—, aunque el chico **puede** pedirla en cualquier momento tocando la tarjeta (ayuda a demanda, no automática). La única excepción es "El Loro Dice", donde el audio **es** la consigna: se dicta a los 400 ms y se repite tocando al loro.

🟡 **Reuso:** las seis mecánicas son *plantillas de interacción*, no juegos atados a palabras. "elegir 1 de 3 con enunciado arriba" y "ordenar piezas arrastrando" son exactamente dos de las mecánicas que la spec de lenguaje necesita. Lo que hay que generalizar es el **ítem**: hoy es siempre `PalabraDefault`; en el proyecto nuevo tiene que ser un ítem genérico con consigna, target y distractores.

### 1.2. Sistema de recompensa

- Meta de **5 estrellas** (`GOAL = 5`), **una por juego terminado** (no por acierto individual).
- Al llegar a 5 → pantalla de premio ("andá a buscarlo"), que resetea el contador al volver.
- **Nueva partida automática:** si quedaron estrellas a medias y pasó **1 hora** sin jugar, el contador arranca de cero. Nace de un problema real: el chico volvía días después con 3 estrellas olvidadas y ganaba el premio a los dos minutos, lo cual rompe la relación esfuerzo → recompensa.
- Feedback por acierto individual: ✅ + elogio hablado. Se usó ⭐ hasta que se detectó que competía visualmente con las estrellas del contador.

🟢 **Reuso:** la lógica es sana y transferible: **recompensa por sesión completada, no por acierto**, con expiración por inactividad. Los números (5 estrellas, 1 hora, 6 rondas) salieron de iteración con usuarios reales, no de la nada — vale la pena arrancar de ahí.

---

## 2. Arquitectura

### 2.1. Stack

| Capa | Elección | Notas |
|---|---|---|
| Framework | Next.js **16.2.10** (App Router) + React **19.2.4** + TypeScript strict | `next.config.ts` solo tiene `devIndicators: false` |
| Estilos | Tailwind **4** con tokens propios en `@theme` | Sin config JS; todo en `app/globals.css` |
| Backend | Route Handlers de Next (`app/api/*`) | Sin servidor propio |
| Datos | Supabase (Postgres + Storage) **vía REST con `fetch`** | **No** usa `@supabase/supabase-js` |
| Persistencia local | `localStorage` | Fuente inmediata; funciona sin red mientras la app ya esté cargada |
| Audio | Web Speech API (TTS) + WebAudio (efectos generados) | Cero archivos de audio |
| Deploy | Vercel, push a `main` | |
| Tests | Ninguno automatizado | Ver §7.3 |

Deliberadamente **sin dependencias más allá del framework**: no hay librería de estado, ni de drag&drop, ni de gráficos, ni de audio, ni de fechas. No está escrito como política en ningún archivo del repo, pero el `package.json` lo confirma —solo Next, React, Tailwind y las herramientas de desarrollo— y es una de las razones por las que el código es fácil de portar.

🟢 **Reuso:** el stack completo es válido para el proyecto nuevo. La spec de lenguaje ya propone lo mismo, con dos cambios que comparto: **IndexedDB en vez de localStorage** (§4.2) y **Supabase Auth + RLS** (§3).

### 2.2. Estructura de archivos

```
web/
├── app/
│   ├── layout.tsx              # html/body, metadata, viewport, appleWebApp
│   ├── globals.css             # tokens de color + @keyframes + reset
│   ├── manifest.ts             # manifest PWA
│   ├── page.tsx                # "/" login por username
│   ├── jugar/page.tsx          # menú de juegos + host del GameEngine
│   ├── config/
│   │   ├── page.tsx            # configuración del adulto
│   │   └── informe/page.tsx    # métricas del adulto
│   └── api/
│       ├── acceso/route.ts     # POST — valida/crea usuario
│       ├── datos/route.ts      # GET/POST — sync config+stars+stats
│       └── foto/route.ts       # POST — sube foto a Storage
├── components/
│   ├── GameEngine.tsx          # el motor: 6 modos, 652 líneas
│   ├── SilabasGame.tsx         # drag & drop de sílabas
│   ├── TopBar.tsx              # estrellas + volver + engranaje
│   └── Visual.tsx              # imagen de una palabra (foto o emoji)
├── lib/
│   ├── storage.ts              # localStorage + tipos del dominio
│   ├── sync.ts                 # sincronización con el servidor
│   ├── seleccion.ts            # selección adaptativa ponderada
│   ├── silabas.ts              # silabeo del español
│   ├── silabas.test.ts         # 37 casos (array exportado)
│   ├── silabas.run-tests.ts    # runner manual con node (agregado después de 372dc9b)
│   └── audio.ts                # TTS + efectos
└── data/palabras-default.ts    # 27 palabras semilla (a–z + ñ)
```

### 2.3. Capas

```
┌──────────────────────────────────────────────────────┐
│  Pantallas:  login · menú · juego · config · informe │
├──────────────────────────────────────────────────────┤
│  GameEngine  (ciclo de ronda, feedback, recompensa)  │
│  6 modos · SilabasGame como mecánica aparte          │
├──────────────────────────────────────────────────────┤
│  seleccion.ts (adaptativo)   silabas.ts (lingüístico)│
│  audio.ts (TTS + efectos)                            │
├──────────────────────────────────────────────────────┤
│  storage.ts (localStorage + tipos)  →  sync.ts       │
├──────────────────────────────────────────────────────┤
│  Route Handlers  →  Supabase (Postgres + Storage)    │
└──────────────────────────────────────────────────────┘
```

Lo bueno de esta separación, y lo que hace el reuso viable: **`lib/seleccion.ts`, `lib/silabas.ts` y `lib/audio.ts` no dependen de React**. Son funciones puras (salvo que `seleccion` lee eventos de storage). Se copian y funcionan.

Lo malo: **`GameEngine.tsx` concentra demasiado** — ciclo de ronda, validación, feedback, recompensa y el JSX de los 6 modos en un solo archivo con ~15 piezas de estado. Es el archivo que más cuesta modificar y el que acumula toda la deuda de lint. Ver §8.1.

---

## 3. Acceso y sesión

**No hay contraseña.** El chico o el adulto escribe un **username**; si no existe, se crea en el acto.

```
POST /api/acceso  { username }
  → valida  /^[a-z0-9_]{3,20}$/
  → upsert en tablele_datos (merge-duplicates: si existe, no pisa nada)
  → { ok: true, username }
```

Sin variables de entorno de Supabase configuradas, **entra igual en modo local** y la app funciona entera contra `localStorage`. Eso permite desarrollar y demostrar sin backend.

La sesión queda en `localStorage["tablele.session"] = { username }`. No hay expiración, ni logout server-side, ni verificación de que el username sea tuyo: **quien escribe un username existente entra a esos datos.**

🔴 **No reusar.** Es aceptable para una app de un solo chico con datos no sensibles, y no lo es para el proyecto nuevo: ahí un terapeuta tiene varios pacientes, con datos clínicos, y la spec ya pide **Supabase Auth + Row Level Security**. Lo único que vale conservar es la idea de que **el chico no tenga que escribir credenciales**: en el nuevo, "Modo Casa" por enlace/código por paciente, y login real solo para el terapeuta.

🟡 **Sí vale copiar** el patrón de *degradación elegante*: si no hay backend configurado, la app arranca en modo local en vez de romper. Ahorra mucha fricción en desarrollo.

---

## 4. Modelo de datos

### 4.1. Tipos del dominio

```ts
// data/palabras-default.ts
type PalabraDefault = {
  letra: string;        // "a".."z","ñ" — la letra que representa en el tablero
  palabra: string;
  emoji: string;        // fallback si no hay foto
  usar: boolean;        // el adulto activa/desactiva cada palabra
  foto?: string;        // URL pública en Supabase Storage; si está, reemplaza al emoji
  silabas?: string[];   // override manual del silabeo (sin UI de edición todavía)
};

// lib/storage.ts
type ConfigTablero = {
  nombre?: string;                          // del chico; se usa en los elogios hablados
  metodo: string;                           // "SELEC" — único valor implementado
  nivel: string;                            // "Global" | "Silabica"
  nivelPalabra?: "inicial" | "intermedio";  // inicial = muestra solo la 1ª letra
  palabras: PalabraDefault[];
};

// Un registro por CADA intento de respuesta, en todos los juegos
type Evento = {
  t: number;        // timestamp
  juego: string;    // "wp" | "pw" | "listen" | "memo" | "silabas"
  palabra: string;  // el target de la ronda
  elegida: string;  // qué eligió (para detectar confusiones sistemáticas)
  ok: boolean;
  intento: number;  // 1 = primer intento de esta ronda
  ms: number;       // latencia desde que apareció la ronda
  ayuda: boolean;   // la correcta ya estaba resaltada cuando respondió
};
```

**`Evento` es la pieza más valiosa del proyecto.** Con esos ocho campos alcanza para: el informe del adulto, la selección adaptativa, y el perfil cognitivo que la spec de lenguaje quiere construir. Fijate qué preguntas ya responde: *¿acierta al primer intento? ¿cuánto tarda? ¿necesitó que le resalten la respuesta? ¿con qué otra palabra la confunde?*

🟢 **Copiar `Evento` casi tal cual.** Para el proyecto nuevo hay que agregarle: `itemId` en vez de `palabra` (los ítems ya no son palabras), `objetivo` (a qué objetivo terapéutico pertenece), `controlled: boolean` (sesión con terapeuta vs. casa, que la spec pide no promediar) y desdoblar `ms` en los `t0/t1/t2` que la spec describe. La estructura "un registro plano por intento, guardado local y sincronizado en bloque" es la correcta y ya está probada.

### 4.2. localStorage

| Clave | Contenido |
|---|---|
| `tablele.session` | `{ username }` |
| `tablele.config` | `ConfigTablero` |
| `tablele.stars` | número. `getStars()` lo lee acotado a `GOAL` con `Math.min`, porque el valor persistido puede venir del esquema viejo (tope 20) y `expirarEstrellas()` usa justamente `raw > GOAL` para detectarlo y resetear |
| `tablele.lastPlayed` | timestamp de la última estrella (para expirar la partida) |
| `tablele.eventos` | `Evento[]`, recortado a los últimos **2000** |
| `tablele.uso` | `{ "YYYY-MM-DD": segundos }`, últimos **90** días |
| `tablele.stats` | *residuo de un esquema viejo — solo se borra, nunca se escribe* |

Todo el acceso pasa por `lib/storage.ts` (única excepción: `lib/sync.ts` lee las claves directo para armar el payload). Ese encapsulamiento es lo que hizo baratos varios cambios de esquema.

🟡 **Adaptar: pasar a IndexedDB.** Los topes de 2000 eventos y 90 días existen para no reventar el límite de ~5 MB de `localStorage`, no por una razón de producto — y eso significa que **hoy Tablele descarta historial clínico en silencio**. El proyecto nuevo va a capturar más eventos por ítem, así que IndexedDB (con un wrapper tipo Dexie) es obligatorio. Lo que **sí** hay que copiar es el patrón: *un único módulo que encapsula la persistencia y expone funciones de dominio*, no llamadas a la base desparramadas por los componentes.

### 4.3. Supabase

Una sola tabla, `tablele_datos`:

| Columna | Tipo | Notas |
|---|---|---|
| `username` | text, clave | `on_conflict=username` |
| `config` | jsonb | `ConfigTablero` completo |
| `stars` | numeric | acotado server-side a 0..20 ⚠️ (residuo: el cliente usa 5) |
| `stats` | jsonb | `{ eventos, uso }` |
| `updated_at` | timestamptz | lo setea el server en cada POST |

Storage: bucket público `fotos`, path `${username}/${timestamp}-${random}.jpg`. Límite 2,5 MB, mime jpeg/png/webp.

🔴 **No reusar el esquema.** "Todo el estado del usuario en dos columnas jsonb" es cómodo para un chico y una config, e inmanejable para un terapeuta con 20 pacientes: no se puede consultar, no se puede indexar, no se puede hacer RLS por paciente, y cada guardado reescribe el historial completo. El proyecto nuevo necesita tablas normalizadas (terapeuta, paciente, plan, objetivo, ítem, evento) como plantea la spec.

🟢 **Sí reusar el patrón de fotos**: comprimir en el cliente antes de subir (canvas → 512px → JPEG 0.82) es simple, sin dependencias, y evita el 90% de los problemas de subida desde tablet. Ver §6.3.

---

## 5. Piezas reutilizables

Esta es la parte que más importa para el proyecto nuevo. Las cuatro primeras se copian y andan.

### 5.1. `lib/seleccion.ts` — selección adaptativa 🟢

```ts
export function elegirPalabras(activas: PalabraDefault[], n: number): PalabraDefault[]
```

Elige `n` ítems con **muestreo ponderado sin reposición**: las palabras que cuestan aparecen más seguido, las dominadas casi desaparecen, las nuevas tienen prioridad media-alta.

**Cómo calcula el peso de cada palabra:**

1. Junta stats de todos los eventos **excluyendo Memotest** (errar apareando cartas es memoria, no lectura). Los de "Armo la palabra" **sí** cuentan.
2. Por palabra: `rondas` y `primerOk` (solo eventos con `intento === 1`), `tiemposOk` (ms de todos los aciertos), y la racha `ultimosPrimeros`.
3. Peso:

   | Situación | Peso |
   |---|---|
   | Sin datos (palabra nueva) | **2** |
   | "Dominada": últimos 3 primeros intentos OK **y** mediana < 3000 ms | **0.4** |
   | Resto | `0.5 + 3 × (1 − tasaDeAcierto)` → 0.5 a 3.5 |
   | *+1* si la mediana supera 4000 ms | hasta 4.5 |
   | *+1 más* si supera 8000 ms | hasta 5.5 |

4. Ruleta ponderada sobre el pool, y la elegida se saca del pool para no repetirla en la misma tirada.

Dos detalles que valen la pena: usa **mediana** y no promedio (un solo tirón de 40 s por una distracción no contamina la métrica), y define "dominada" combinando **precisión reciente + velocidad**, no solo precisión — porque leer bien pero lento significa que todavía está descifrando, no reconociendo.

**Cómo copiarlo:** cambiar `PalabraDefault` por el tipo de ítem y el filtro de `juego !== "memo"` por el criterio equivalente (qué mecánicas miden el objetivo y cuáles no). Todo lo demás es aritmética portable. Son 90 líneas.

Lo que **le falta** para el proyecto nuevo: **repaso espaciado** (hoy el peso no considera *cuándo* fue la última vez que apareció, así que una palabra dominada hace un mes sigue con peso 0.4) y **ponderación por objetivo terapéutico**, no solo por ítem.

### 5.2. `lib/silabas.ts` — silabeo del español 🟢

```ts
export function silabear(palabra: string): string[]
export function contarSilabas(palabra: string): number
export function silabasDe(p: { palabra: string; silabas?: string[] }): string[]
export function esElegibleSilabas(p: { palabra: string; silabas?: string[] }): boolean
```

Función pura, sin dependencias, **37 casos de test verdes**. Reglas implementadas:

1. **Dígrafos que no se separan:** `ch`, `ll`, `rr`; y `qu`/`gu` + `e`/`i` donde la `u` no suena (`que-so`, `ño-qui`) — distinguiéndolos de los casos donde sí suena (`a-gua`, `pin-güi-no`).
2. **Diptongo vs. hiato:** fuerte+fuerte separa (`fi-de-os`, `le-o`); débil con tilde separa (`pa-ís`, `dí-a`, `bú-ho`); el resto forma diptongo (`au-to`, `in-dia`, `kios-co`).
3. **Grupos consonánticos inseparables:** `pl bl cl gl fl pr br cr gr fr tr dr` **y `tl`** (`trac-tor`, `pro-ble-ma`, `a-tlas` — con la convención americana, no la peninsular `at-las`).
4. Reparto de clusters según longitud: 1 consonante pasa entera a la sílaba siguiente; 2 se dividen salvo que formen grupo; 3+ se evalúa si las últimas dos forman grupo.
5. `trim()` de entrada, y monosílabos devueltos tal cual.

No contempla triptongos ni la "h intercalada" transparente (`al-co-hol` en vez de `al-cohol`) — ninguna de las dos afecta al vocabulario actual, y están anotadas como limitaciones conocidas.

Los tests se corren con `node --experimental-strip-types lib/silabas.run-tests.ts` (sale con código 1 si falla, así sirve para CI o pre-commit).

**Reuso:** 🟢 tal cual si el proyecto nuevo trabaja conciencia fonológica o segmentación. Si no, es la mejor demostración de un patrón que sí conviene copiar: **la regla lingüística vive en un módulo puro, testeado, con override manual por si la profesional discrepa** (`silabas?: string[]`). Ese mismo patrón aplica a concordancia de género y número, conjugación verbal o flexión — todas cosas que la app de lenguaje necesita y que no querés tener dispersas en componentes.

### 5.3. `lib/audio.ts` — TTS y efectos, sin archivos 🟢

```ts
export function speak(text: string): void
export function ensureAudio(): void          // crea el AudioContext (lazy)
export function sndGood(): void
export function sndBad(): void
export function sndWin(): void
export function tone(freq, t0, dur, type?: OscillatorType, vol?): void
export function bestVoice(): SpeechSynthesisVoice | null
export function spanishVoices(): SpeechSynthesisVoice[]
export function scoreVoice(v: SpeechSynthesisVoice): number
```

**Efectos generados con WebAudio**, cero assets: `sndGood` son tres tonos ascendentes (523/659/784 Hz), `sndBad` uno grave triangular (220 Hz), `sndWin` una secuencia de seis. Un solo `AudioContext` lazy.

**TTS con Web Speech API** y —esto es lo verdaderamente reutilizable— un **selector de voz por puntaje**, porque la calidad de las voces en español varía muchísimo entre dispositivos y la voz por defecto suele ser mala:

| Criterio | Puntos |
|---|---|
| "natural" / "neural" / "premium" / "enhanced" / "mejorada" | +60 |
| "google" | +50 |
| Nombre masculino o "male"/"hombre" | +45 |
| `es-AR` | +25 · `es-MX`/`es-US`/`es-419` +15 |
| "siri" | +20 |
| Voz de red (`localService === false`) | +10 |
| Nombre femenino | −40 |
| "espeak" / "compact" / "novelty" (robóticas) | **−100** |

Además resuelve dos problemas concretos de iOS: **`getVoices()` devuelve vacío al arrancar** (hace polling cada 150 ms, hasta 10 intentos, antes de hablar) y **las voces se superponen** (`speechSynthesis.cancel()` antes de cada frase). `rate: 0.85` y `pitch: 1.05` — más lento que el default, porque estos chicos necesitan tiempo de procesamiento.

**Reuso:** 🟢 copiar el archivo completo, son 130 líneas y resuelven problemas que si no los conocés te comen dos días. Si el proyecto nuevo necesita **grabar** al chico (la spec menciona consignas de producción), eso es aparte: `MediaRecorder`, no está acá.

### 5.4. `components/SilabasGame.tsx` — drag & drop táctil 🟢

Ordenar piezas arrastrándolas. Es la mecánica más costosa de construir bien y la más transferible: *arrastrar piezas a huecos* sirve para armar oraciones, ordenar secuencias temporales o completar frases.

**Contrato, ya desacoplado del dominio:**

```ts
interface SilabasGameProps {
  target: PalabraDefault;
  correctas: string[];              // el orden correcto
  locked: boolean;                  // el padre bloquea durante el feedback
  hint: boolean;                    // resaltar la próxima pieza correcta
  resetSignal: number;              // incrementar = remezclar (mismo ítem, tras error)
  onSubmit: (orden: string[]) => void;
}
```

**Estado:** un solo array como fuente de verdad —`TileState = { id, texto, slotIdx: number | null }`— en vez de mantener sincronizados un array de bandeja y otro de casillas. `slotIdx === null` significa "está en la bandeja".

**Decisiones que hacen que funcione en tablet:**

1. **Pointer Events, no HTML5 Drag & Drop.** El DnD nativo simplemente no dispara en touch. Con `setPointerCapture` el drag sobrevive aunque el dedo salga del elemento.
2. **Clon fantasma movido por `transform` fuera de React.** `pointermove` dispara ~60 veces por segundo; re-renderizar React a esa frecuencia se nota tildado en tablets de gama media. El clon es un `<div>` `position: fixed` en `document.body` que se mueve por `style.transform`. El resto de la UI no se re-renderiza durante el arrastre.
3. **Tap como alternativa al arrastre.** Si el dedo se movió menos de **8 px**, cuenta como toque y la pieza va a la primera casilla vacía. Muchos chicos con dificultades motoras no logran un arrastre sostenido.
4. **Hit-test propio con tolerancia de 14 px.** No usa `elementFromPoint` porque el clon tapa el DOM debajo del dedo: itera las casillas **vacías** comparando el punto contra cada rectángulo ampliado. Si el punto cae en varias, gana la de centro más cercano.
5. **Un solo dedo a la vez.** Ignora un `pointerdown` nuevo si ya hay un drag activo.
6. **`pointercancel` manejado** y clon limpiado también en el desmontaje, para que no quede una pieza fantasma flotando si la ronda termina con el dedo en pantalla.
7. **Validación por contenido, no por identidad.** Compara textos posición por posición, así "nene" → `ne-ne` funciona con dos piezas de texto idéntico.
8. **Sin botón de confirmar.** Colocar la última pieza dispara la corrección. Un `submittedRef` evita el doble disparo.
9. **Reset entre ítems por `key` del padre**, no por efecto: `<SilabasGame key={target.palabra} />` remonta el componente y el estado nace ya mezclado. Reset tras error por `resetSignal`.

**Reuso:** 🟢 copiar y renombrar. Lo único específico del dominio es el nombre y el tipo de `target`; el resto es una mecánica genérica de ordenamiento. Es 330 líneas y no depende de ninguna librería.

### 5.5. `components/Visual.tsx` — imagen del ítem 🟢

Veinticinco líneas que resuelven "mostrá la imagen de este ítem": si tiene `foto` renderiza el `<img>`, si no el emoji, con tres tamaños (`grande` / `opcion` / `memo`). El patrón **"foto real si la cargaron, emoji como fallback"** es exactamente lo que necesita cualquier app con vocabulario configurable: el emoji hace que el contenido funcione desde el minuto cero, y la foto real —el vaso *de la casa* del chico, su perro— es lo que lo vuelve significativo.

### 5.6. `lib/sync.ts` — sincronización offline-first 🟡

```ts
export function schedulePush(): void            // debounce 600 ms
export function flushPush(): Promise<void>      // subir ya
export function syncFromServer(username): Promise<void>
```

Cuatro decisiones que valen:

1. **`localStorage` es la fuente inmediata**; el servidor es respaldo y sincronización entre dispositivos. La app nunca espera a la red para responderle al chico.
2. **Debounce de 600 ms** en cada escritura (`saveConfig`, `setStars`, `recordEvento` llaman a `schedulePush()`), así una ronda con varios eventos genera un POST y no cinco.
3. **Push antes de pull.** `syncFromServer` primero descarga lo pendiente y recién después baja del servidor, para no pisar cambios locales con datos viejos.
4. **`sendBeacon` en `pagehide` y `visibilitychange`.** Cerrar la pestaña o mandar la app al fondo no pierde el último push pendiente — algo habitual en tablet, donde nadie "cierra" la app.

🟡 **Adaptar:** la estrategia es correcta y hay que conservarla. Lo que no escala es el **payload monolítico**: sube `config` + `stars` + **todos** los eventos en cada POST, y el servidor sobrescribe. Con dos dispositivos en paralelo, el último gana y el otro pierde datos. El proyecto nuevo necesita sync **incremental por evento** (append-only con id de cliente, que además hace el merge trivial: los eventos nunca se editan).

### 5.7. Sistema de diseño 🟢

En `app/globals.css`, sin config de Tailwind:

```css
@theme {
  --color-brand-blue:   #2b6cb0;
  --color-brand-dark:   #1a4a7a;
  --color-brand-pink:   #d63384;
  --color-brand-green:  #3dbf6e;
  --color-brand-orange: #ff8a3d;
  --color-brand-purple: #a06df0;
  --font-sans: "Comic Sans MS", "Chalkboard SE", "Segoe UI", sans-serif;
}
```

**Animaciones** (`@keyframes`, todas usadas): `pop` (acierto, escala a 1.15), `shake` (error, oscilación horizontal), `glow` (pista, halo amarillo pulsante), `bounce-short` (trofeos), `fall` (confetti, cae 110vh rotando 720°).

**Botón "físico":** `shadow-[0_5px_0_rgba(0,0,0,0.18)]` simula un borde inferior con volumen, y `active:translate-y-1 active:shadow-none` lo hunde al presionarlo. Da una respuesta táctil clarísima sin JS y sin librería.

**Adaptación a pantalla, tres técnicas que valen:**

- **`clamp()` en casi todos los tamaños**, incluidos padding y gaps, atados a `vh` en el menú para que 6 botones entren sin scroll tanto en tablet como en celular.
- **`min-height: 100dvh`** (con `100vh` como fallback). En iOS Safari `100vh` no descuenta las barras del navegador y genera scroll fantasma; `dvh` usa la altura real. Este bug costó una iteración entera de "no entiendo por qué scrollea si el contenido entra".
- **`env(safe-area-inset-*)`** con `max()` en la barra superior y los botones inferiores fijos, para notch y home indicator.

🟢 **Copiar los tres.** Y un aprendizaje de UX que salió de usuarios reales, no de teoría: **el espaciado entre opciones importa más de lo que parece.** Los chicos se equivocaban tocando la opción de al lado; separarlas bajó los errores accidentales (hoy: 22 px entre las 3 imágenes de "Leo y Busco", 28 px entre las opciones de texto de "Miro y Busco" y "El Loro Dice", 24-32 px entre las piezas de sílabas). En la misma línea: las opciones ahora **reparten toda la altura libre** en vez de apilarse arriba dejando un hueco muerto, y la separación entre el enunciado y la primera opción es mayor que la separación entre opciones, para que se lea como "pregunta" y "respuestas".

### 5.8. Instrumentación e informe 🟡

Cada intento en cada juego llama a `recordEvento`. Sobre esos eventos, `/config/informe` calcula:

| Panel | Cálculo | Excluye |
|---|---|---|
| **Tiempo de uso** | Suma de segundos hoy / 7 días / 30 días. Se acumula 15 s por tick mientras la app está visible | — |
| **Por palabra** | % de acierto al primer intento, **mediana** de tiempo hasta acertar, veces jugada, veces que necesitó ayuda. Ordenado de peor a mejor | `memo` |
| **Confusiones** | Top 6 de pares "palabra → qué eligió", solo errores | `memo` y `silabas` |
| **Por juego** | % de acierto al primer intento por mecánica | — |

Las exclusiones son deliberadas y vale entender por qué: **Memotest** queda fuera de las métricas de lectura porque errar apareando cartas mide memoria de trabajo, no reconocimiento. **"Armo la palabra"** queda fuera de *confusiones* porque ahí `elegida` es el orden de sílabas armado (`"sa-ca"`), y mostrarle al adulto "casa → eligió sa-ca" le haría creer que el chico leyó otra palabra, cuando solo invirtió el orden. Sigue contando en "por palabra" y "por juego", donde sí es coherente.

Detalle de producto que funcionó: **el borrado de historial está detrás de un candado adulto** —una suma de dos dígitos al azar— para que el chico no borre sus datos tocando por curiosidad.

🟡 **Adaptar:** el patrón "eventos crudos guardados, métricas derivadas al vuelo" es el correcto (no guardar agregados: se recalculan cuando cambia la definición). Lo que el proyecto nuevo necesita agregar: agrupar por **objetivo terapéutico** y no solo por ítem, separar sesión controlada de casa, y las cuatro reglas de perfil cognitivo de la spec. La base de datos de eventos ya alcanza para eso — es el análisis lo que falta.

---

## 6. El motor de juego

### 6.1. Ciclo de una ronda

```
initGame(mode)
  ├─ getConfig() → palabras con usar:true
  ├─ si mode==="silabas": filtrar por esElegibleSilabas (excluye monosílabos)
  ├─ elegirPalabras(activas, n)     n = 6, o todas si mode==="show"
  └─ setupRound(0)

setupRound(idx)
  ├─ si idx >= total → handleCelebrate()
  ├─ armar 3 opciones: target + 2 distractores al azar (no en show/silabas)
  ├─ resetear errs, feedback, locked; roundStartRef = ahora
  └─ si mode==="listen": decir la palabra a los 400 ms

handleAnswer (wp/pw/listen)
  ├─ recordEvento({ ok, intento: errs+1, ms: ahora−roundStart, ayuda: errs>=2 })
  ├─ ACIERTO → sndGood + ✅ + elogio hablado → siguiente ronda (1400 ms)
  └─ ERROR   → sndBad + 💪 + frase de reintento
              → tras 1800 ms: rearmar la ronda (anti-descarte) y desbloquear

handleSilabasSubmit (silabas)
  ├─ mismo evento que handleAnswer
  ├─ ACIERTO → sndGood + dice la palabra completa + elogio (900 ms después)
  │            → siguiente ronda (2100 ms, para que se oigan las dos cosas)
  └─ ERROR   → tras 1800 ms: resetSignal++ → SilabasGame remezcla

handleMemoClick (memo)
  ├─ recordEvento con intento:1, ms:0, ayuda:false  ← ver nota abajo
  ├─ PAR OK  → +1 par; a los 6 pares → handleCelebrate (1400 ms)
  └─ ERROR   → las cartas se dan vuelta a los 1100 ms

handleCelebrate
  ├─ show: festejo, sin estrella
  └─ resto: +1 estrella → si llega a GOAL, pantalla de premio
```

⚠️ **Memotest instrumenta distinto.** `handleMemoClick` graba `intento: 1`, `ms: 0` y `ayuda: false` fijos, porque en apareamiento esos conceptos no existen (no hay "reintento sobre el mismo target" ni pista). Consecuencia práctica: **los eventos de Memotest no aportan latencia ni marca de ayuda**, solo acierto/error. Es coherente con que las métricas de lectura lo excluyan (§5.8), pero si el proyecto nuevo quiere medir tiempo en una mecánica de apareamiento, hay que instrumentarla explícitamente.

### 6.2. Cuatro mecanismos que valen copiar 🟢

**1. Anti-descarte.** Al fallar, la ronda se rearma: se conserva la respuesta correcta pero **se renuevan los distractores y se mezcla el orden**, excluyendo todo lo ya probado en esa ronda. Sin esto, con 3 opciones el chico acierta por eliminación tocando una por una, y el evento registrado dice "acertó" cuando en realidad no leyó nada. Es la diferencia entre medir lectura y medir persistencia.

**2. Bloqueo durante el feedback.** `locked` desactiva la entrada mientras suena el feedback. Evita el toqueteo rápido y —más importante— asegura que el chico *escuche* la corrección.

**3. Pista progresiva.** Al tercer intento (`errs >= 2`) se resalta la respuesta correcta con `glow`. En "Armo la palabra" se resalta **solo la próxima pieza**, no toda la secuencia. Y el evento queda marcado con `ayuda: true`, así el informe distingue "acertó" de "acertó porque se lo mostramos" — distinción clínicamente importante que se pierde si solo guardás `ok`.

**4. Timers centralizados.** Todos los `setTimeout` pasan por un helper `later()` que los acumula en un ref, y `clearTimers()` los cancela junto con `speechSynthesis.cancel()` al desmontar. Nace de un bug concreto: volvías al menú y la app seguía hablando la palabra anterior. Con feedback diferido en varias capas, esto no es opcional.

### 6.3. Configuración del adulto

En `/config`: nombre del chico, etapa (Global / Silábica), nivel de palabra (inicial = solo la primera letra / intermedio = palabra completa), y por cada una de las 27 letras: la palabra, su emoji **o** una foto real, y si se usa o no.

**Subida de fotos:** compresión en el cliente con `<canvas>` (máximo 512 px en el lado mayor, JPEG calidad 0.82) → `POST /api/foto` → Supabase Storage. El servidor valida mime y tamaño (2,5 MB). Comprimir antes de subir es lo que hace que funcione con la cámara de una tablet sin que el usuario espere ni falle por tamaño.

🟢 **Copiar:** compresión client-side, y el patrón **emoji por defecto / foto real opcional**.
🔴 **No copiar:** la estructura "una palabra por letra del abecedario". Es del método SELEC y no aplica a lenguaje.

---

## 7. Qué NO tiene

Vale tenerlo explícito, porque son cosas que en el proyecto nuevo probablemente sí hagan falta.

### 7.1. No funciona offline de verdad
Hay manifest e iconos, así que es **instalable**, pero **no hay service worker**. Sin red la app no carga; una vez cargada funciona porque los datos son locales. Para uso real en consultorio sin wifi confiable, hace falta service worker.

### 7.2. No hay autenticación
Ver §3.

### 7.3. No hay tests automatizados
Solo `lib/silabas.test.ts` (37 casos) corriendo con un runner manual de Node, sin jest/vitest. Fue una decisión explícita de mantener dependencias mínimas, y es defendible en un proyecto de una persona. En el proyecto nuevo, con reglas lingüísticas más complejas —concordancia, conjugación, orden de constituyentes— los tests de las funciones puras pasan de opcionales a necesarios.

### 7.4. No hay multi-paciente
Un username = un chico = una config. Un terapeuta con varios pacientes hoy necesita un username por chico y cambiar de sesión a mano. Es la limitación estructural más grande frente a lo que pide la spec nueva.

### 7.5. Otras ausencias
Sin grabación de voz del chico, sin exportación de informes (PDF/CSV), sin borrado de cuenta, sin orientación horizontal pensada (el manifest fija `portrait`, y la spec de lenguaje quiere tablet horizontal para arrastrar).

---

## 8. Deuda técnica

### 8.1. `GameEngine.tsx` concentra demasiado
652 líneas: ciclo de ronda, validación de los 6 modos, feedback, recompensa y todo el JSX. Acumula **10 de los 11 errores de lint** del repo. Es el archivo donde cada cambio cuesta más y donde se rompió algo una vez (se vació accidentalmente durante el desarrollo del juego de sílabas y hubo que reconstruirlo).

**Aprendizaje para el proyecto nuevo:** el enfoque correcto ya está insinuado en cómo se hizo "Armo la palabra" — **el motor coordina, cada mecánica es un componente aparte con un contrato de props chico** (`target`, `locked`, `hint`, `onSubmit`). Si el nuevo va a tener ocho mecánicas, esa separación tiene que ser la regla desde el primer commit, no la excepción.

### 8.2. Lint preexistente: 11 errores, 14 warnings

| Categoría | Dónde | Qué es |
|---|---|---|
| `react-hooks/purity` ×7 | GameEngine | `Date.now()` en el cuerpo de handlers. Reglas nuevas del React Compiler que Next 16 trae más estrictas |
| `react-hooks/set-state-in-effect` | GameEngine | `initGame()` llamado directo en un `useEffect` |
| `react-hooks/immutability` | GameEngine | orden de declaración entre `initGame` y `setupRound` |
| `no-explicit-any` ×2 | GameEngine (`memoCards`), audio (`webkitAudioContext`) | |
| Warnings | varios | `<img>` en vez de `next/image`, variables sin usar en catches, deps faltantes |

Nada rompe en runtime, pero conviene arrancar el proyecto nuevo con el lint en cero: estas reglas del React Compiler son las que después impiden activar optimizaciones.

### 8.3. Hardcodeos
`ROUNDS = 6`; siempre 3 opciones múltiples; Memotest fijo en 6 pares y grilla 3×4; `metodo: "SELEC"` como único valor; umbrales del drag (8 px / 14 px); tres colores del menú fuera de los tokens (`#4d9de0`, `#e0508e`, `#2bb3a3`).

En el proyecto nuevo, **cantidad de rondas, cantidad de distractores y nivel de ayuda deberían ser parámetros del plan del paciente**, no constantes: son exactamente las perillas que un terapeuta quiere mover.

### 8.4. Residuos de refactors
`stars` acotado a 20 en el servidor cuando el cliente usa 5; la clave `tablele.stats` que solo se borra y nunca se escribe; `handleRestore()` en `/config` sin botón que la llame; versión `"Tablele v0.9.1"` escrita a mano en el footer, desalineada del `package.json` (`0.1.0`).

---

## 9. Resumen de reuso

### 🟢 Copiar (poco o ningún cambio)

| Pieza | Líneas | Por qué |
|---|---|---|
| `lib/audio.ts` | 130 | TTS con selector de voz por puntaje + efectos WebAudio. Resuelve problemas de iOS que cuestan días descubrir |
| `lib/seleccion.ts` | 90 | Selección adaptativa ponderada, probada. Cambiar el tipo de ítem y listo |
| `lib/silabas.ts` + tests | 270 | Si hace falta segmentación. Si no, es el modelo de "regla lingüística pura, testeada, con override manual" |
| `components/SilabasGame.tsx` | 330 | Drag & drop táctil que funciona de verdad en tablet. La mecánica más costosa de hacer bien |
| `components/Visual.tsx` | ~25 | Patrón emoji-por-defecto / foto-real-opcional |
| Tipo `Evento` | 10 | El esquema de instrumentación. Extenderlo, no rediseñarlo |
| Tokens + animaciones + botón físico | ~60 CSS | Sistema de diseño completo sin dependencias |
| `clamp()` + `dvh` + `safe-area` | — | Tres técnicas que resuelven bugs reales de tablet/iOS |
| Anti-descarte, bloqueo, pista progresiva, timers centralizados | — | Cuatro mecanismos de integridad de la medición |
| Compresión de fotos en el cliente | ~20 | Canvas → 512 px → JPEG 0.82 |
| Recompensa por sesión + expiración por inactividad | — | Números validados con usuarios reales |

### 🟡 Adaptar (la idea sirve, la implementación no escala)

| Pieza | Qué cambiar |
|---|---|
| `lib/storage.ts` | Mismo patrón de módulo único que encapsula persistencia, pero sobre **IndexedDB**. Los topes de 2000 eventos / 90 días hoy descartan historial |
| `lib/sync.ts` | Conservar offline-first + debounce + push-antes-de-pull + `sendBeacon`. Cambiar el payload monolítico por **sync incremental append-only** |
| Las 6 mecánicas | Son plantillas de interacción válidas. Generalizar el ítem: de `PalabraDefault` a un ítem con consigna, target y distractores |
| Informe / métricas | Conservar "eventos crudos + métricas derivadas". Agregar objetivo terapéutico, sesión vs. casa, perfil cognitivo |
| `GameEngine.tsx` | Conservar el ciclo de ronda. **Partirlo**: motor coordinador + una mecánica por componente con contrato chico |

### 🔴 No reusar

| Pieza | Por qué |
|---|---|
| Acceso por username sin contraseña | El proyecto nuevo tiene datos clínicos y multi-paciente: Supabase Auth + RLS |
| Esquema `tablele_datos` (2 columnas jsonb) | No se puede consultar, indexar ni aislar por paciente. Hace falta normalizar |
| Modelo "una palabra por letra del abecedario" | Específico del método SELEC |
| Etapas Global / Silábica y el juego de sílabas como producto | Alfabetización, no lenguaje (el *código* de silabeo sí sirve) |
| Los 11 errores de lint | Arrancar en cero |
| `localStorage` como persistencia principal | Ver 🟡 arriba |

---

## 10. Cómo levantarlo

```bash
cd web
npm install
npm run dev                                            # http://localhost:3000
npm run build
node --experimental-strip-types lib/silabas.run-tests.ts   # 37 casos de silabeo
npx eslint .                                           # 11 errores preexistentes (§8.2)
```

**Variables de entorno** (en Vercel; sin ellas la app corre en modo local contra `localStorage`):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

**Supabase:** tabla `tablele_datos` (§4.3) y bucket público `fotos`.
**Deploy:** push a `main` → Vercel.
**Repo:** `github.com/esarabia1972/tablele`
