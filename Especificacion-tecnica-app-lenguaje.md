# Especificación técnica — App de estimulación del lenguaje (módulo de morfosintaxis)

*Documento para arrancar el proyecto de cero (Antigravity)*

> **Qué es este documento.** La spec completa de producto y arquitectura, pensada para construir desde el primer commit. Está basada en el documento de trabajo de Leticia (*App de estimulación del lenguaje · Módulo de morfosintaxis*). Es un producto nuevo y autónomo, enfocado en el lenguaje (morfosintaxis), no en la alfabetización.
>
> **Nombre:** a definir.

---

## 1. Identidad del producto

**Objetivo terapéutico:** construir y reparar los **parámetros del lenguaje** (morfosintaxis: estructura de la oración, morfología flexiva, pronombres y referencia). No enseña a leer. La población son chicos con trastorno o retraso del lenguaje, aproximadamente 4 a 11 años, que trabajan en consultorio y en casa.

**Plataforma:** Web PWA. Dispositivo primario **tablet en horizontal** (es donde mejor funciona el arrastrar). Debe funcionar offline y sincronizar cuando hay red.

**Idioma:** español rioplatense (voseo). Todas las consignas y feedback en segunda persona ("armá", "decilo", "muy bien").

---

## 2. Arquitectura general

### 2.1. Principio rector: un motor, muchos contenidos

La app **no es una colección de juegos**. Es un motor de actividades que recibe *ítems* (datos) y los renderiza con una de las mecánicas reutilizables. El terapeuta arma el "plan" de cada paciente eligiendo objetivos; el motor genera las actividades con el vocabulario, las fotos y el nivel de ese chico. El contenido es dato, no código.

Corolario de diseño (de la nota de Leticia): **toda actividad existe en dos consignas — comprensión (elegí/tocá) y producción (armá/completá/grabá).** El mismo ítem sirve para las dos; cambia solo la consigna. Esto duplica el banco sin duplicar el trabajo. La consigna es un parámetro del ítem, no una mecánica aparte.

### 2.2. Tres modos (puertas de entrada al mismo contenido)

| Modo | Quién | Qué permite | Auth |
|---|---|---|---|
| **Terapeuta** | profesional | Crear pacientes, definir objetivos, armar planes, editar vocabulario, ver panel y perfil cognitivo, exportar informes | Login real (Supabase Auth) |
| **Sesión** | chico + terapeuta al lado | Actividad a pantalla completa. Barra para marcar **nivel de ayuda** (sin ayuda / con modelo / no logrado), saltear, repetir. Registra latencia y tipo de error | Lanzado desde Modo Terapeuta |
| **Casa** | chico solo o con familia | Sesiones cortas (5-8 min), autocorrección amable, recompensas, sin acceso a configuración. Datos marcados como "no controlado" | Enlace/código por paciente, sin config |

Regla dura: los datos de **Modo Casa** se etiquetan `controlled = false` y **no se promedian** con los de Sesión para el perfil cognitivo (§7). Casa alimenta adherencia y repaso espaciado, no los indicadores cognitivos.

### 2.3. Stack

- **Framework:** Next.js (App Router) + React + TypeScript.
- **Estilos:** Tailwind, con un sistema de diseño propio (tokens de color, botones con sombra "física", tipografía grande).
- **Datos:** Supabase — Postgres + Auth + Storage (fotos) + **Row Level Security** (un terapeuta solo ve sus pacientes).
- **Persistencia local / offline-first:** **IndexedDB** (vía un wrapper tipo Dexie), no localStorage. El volumen y la riqueza de eventos (t0/t1/t2 por ítem) supera lo que localStorage tolera bien. Local es la fuente inmediata; una capa de sync sube con debounce y baja al entrar.
- **PWA:** manifest + service worker para uso offline en tablet.

### 2.4. Capas del sistema

```
┌─────────────────────────────────────────────────────────┐
│  UI por modo:  Terapeuta · Sesión · Casa                 │
├─────────────────────────────────────────────────────────┤
│  Motor de actividades  (elige mecánica, arma ítem)       │
│  8 mecánicas reutilizables (componentes)                 │
├─────────────────────────────────────────────────────────┤
│  Instrumentación:  captura t0/t1/t2, trampa, ayuda       │
│  Selección adaptativa · Repaso espaciado                 │
│  Motor de perfil cognitivo (4 reglas · 4 dominios)       │
├─────────────────────────────────────────────────────────┤
│  Dominio:  Terapeuta · Paciente · Plan · Objetivo · Ítem │
│  Persistencia local (IndexedDB) ↔ Sync ↔ Supabase        │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de datos

El modelo es el corazón del proyecto. Si esto queda bien, el resto es contenido. Cuatro decisiones no negociables:

1. **Separar identidad de configuración.** Nada de un único objeto "config" por usuario (un anti-patrón a evitar). Entidades explícitas.
2. **Nivel por objetivo, no global.** Un chico puede estar en nivel 3 de *ordenar frases* y en nivel 1 de *verbos*.
3. **Anatomía temporal del ítem desde el día uno.** Registrar t₀ / t₁ / t₂ + base motora + distractor elegido, aunque todavía no se muestre nada. Es gratis ahora e irrecuperable después.
4. **Etiquetar cada ítem con nivel, longitud y frecuencia léxica desde el diseño** (Regla 4), no después.

### 3.1. Entidades

**`therapist`** — usuario autenticado (Supabase Auth).
`id`, `email`, `display_name`, `created_at`.

**`patient`** — la ficha del paciente. Datos de salud de un menor → mínimos y cifrados.
`id`, `therapist_id (FK)`, `display_name`, `birthdate` (para edad; sensible), `sensory_prefs (jsonb)`, `supports_config (jsonb)`, `consent (jsonb: otorgado_por, fecha)`, `created_at`, `archived`.

**`vocabulary_item`** — banco de vocabulario, propio del paciente o global. **El diferencial más grande frente a otras apps** (fotos reales de su casa, su perro, su mamá).
`id`, `patient_id (FK, nullable = global)`, `lemma`, `image_url (Supabase Storage)`, `emoji (fallback)`, `semantic_category`, `gender (m/f)`, `number (sg/pl)`, `frequency_band (alta/media/baja)`, `created_at`.

**`objective`** — catálogo, global (seed). Define QUÉ se trabaja.
`id`, `area (morfosintaxis | lexico | fonologia | discurso | pragmatica)`, `block (estructura_oracion | morfologia | pronombres)`, `name`, `description`, `levels (jsonb: [{level, descripcion, criterios}])`, `priority`.

**`patient_objective`** — **el plan.** Une paciente ↔ objetivo con su nivel propio.
`id`, `patient_id (FK)`, `objective_id (FK)`, `current_level`, `status (activo | pausado | logrado)`, `created_at`, `last_practiced_at`.

**`item`** — instancia concreta de una actividad. Generado o autoreado.
`id`, `objective_id (FK)`, `level`, `mechanic (drag | fill | choose | touch_image | find_error | record | roulette | arrow)`, `consigna (comprension | produccion)`, `payload (jsonb: estímulo, huecos, opciones, respuesta correcta)`, **`length` (nº palabras)**, **`frequency_band`**, `trap_option_id` (cuál de las incorrectas es la respuesta prepotente), **`computable_for_profile (bool)`** — `false` para ruleta generativa y cualquier ítem de dificultad no emparejable.

**`session`** — una sesión de trabajo.
`id`, `patient_id (FK)`, `mode (sesion | casa)`, `area`, `started_at`, `ended_at`, **`motor_baseline_ms`** (medida al inicio), `device_info`, `controlled (bool)`.

**`event`** — LA tabla central. Un registro por intento de respuesta.
`id`, `session_id (FK)`, `patient_id (FK)`, `item_id (FK)`, `objective_id (FK)`, `area`, `mode`, `controlled (bool)`,
**`t0`** (aparece el ítem / termina la consigna), **`t1`** (primer toque), **`t2`** (respuesta final),
`latency_initiation_ms` (= t1−t0, derivable), `latency_execution_ms` (= t2−t1, derivable),
`motor_baseline_ms` (denormalizado de la sesión, para latencia neta),
`correct (bool)`, `attempt`, `chosen_option_id`, **`was_trap (bool)`** (eligió el distractor prepotente),
`error_type (omision | sustitucion | orden | concordancia | null)`, `omission_position (inicio | medio | final | null)`,
`help_level (sin_ayuda | con_modelo | no_logrado | null)` (marcado por el terapeuta en Sesión),
`self_corrections (int)` (toques entre t1 y t2 que van de incorrecta a correcta),
`premature (bool)` (t1 < base motora + 0.4 s),
`item_length`, `item_frequency_band`, `item_level` (snapshot denormalizado para comparación de dificultad emparejada).

**`review_schedule`** — repaso espaciado.
`id`, `patient_id`, `item_id (o objective_id)`, `due_at`, `interval_stage (1 | 7 | 21 días)`, `last_result`.

### 3.2. Base motora (Regla 1)

Al inicio de cada sesión: 30 s de *"tocá el globo apenas aparezca"*. Se calcula la **mediana** del tiempo de reacción motor de ese chico, ese día, en ese dispositivo, y se guarda en `session.motor_baseline_ms`. Todas las latencias cognitivas se informan **netas**: `latencia_neta = latencia − base_motora`. Sin esto no se pueden comparar un chico de 5 con uno de 10, ni al mismo chico con y sin sueño.

### 3.3. Anatomía temporal de un ítem

Separar **iniciación** de **ejecución** es la decisión técnica más importante del módulo:

- `latencia_iniciación = t1 − t0` → procesamiento + enganche atencional.
- `latencia_ejecución = t2 − t1` → planificación, decisión y motricidad.

Señales que se derivan de los tiempos:
- `t1 < base_motora + 0.4s` → respuesta prematura (inhibición).
- `t1 > 8s` sin ningún toque → pausa / pérdida de foco.
- toques entre t1 y t2 → autocorrección (monitorización, señal favorable).

Un chico lento en iniciación y rápido en ejecución tiene un problema de procesamiento o enganche; uno rápido en iniciación y lento en ejecución tiene un problema de planificación o motor. Con una sola latencia global no se distinguen — por eso se guardan los tres tiempos.

### 3.4. Privacidad en el modelo

Son datos de salud de menores. RLS en Supabase para que cada terapeuta acceda solo a sus pacientes. Cifrado en reposo. Export y borrado por paciente disponibles desde el día uno (ver §10). Auth real desde la Etapa 1 — **descartar** cualquier esquema de usuario sin contraseña.

---

## 4. Catálogo de actividades morfosintácticas

Ordenado por complejidad creciente. Cada objetivo tiene 3-5 niveles internos. Todos existen en versión comprensión y producción.

### A. Estructura de la oración

| Objetivo | Actividad | Niveles |
|---|---|---|
| Ordenar frases | Arrastrar tarjetas-palabra a casilleros, con imagen de apoyo | 1) SVO 3 palabras · 2) +artículo y adjetivo · 3) +circunstancial · 4) subordinadas / 8+ palabras |
| Expansión de sintagma | Partir de "El perro corre" y agregar de a una: ¿cuál? ¿cómo? ¿dónde? ¿cuándo? | 1) +adjetivo · 2) +adverbio · 3) +circunstancial lugar · 4) los cuatro |
| Nexos y conectores | Unir dos viñetas con el conector correcto | 1) y · 2) pero/porque · 3) entonces/así que · 4) aunque/mientras/para que |
| Negación | Pasar afirmativa ↔ negativa | 1) no simple · 2) nunca/nadie/nada · 3) doble negación |
| Interrogativas | Dada la respuesta, armar la pregunta / elegir el interrogativo | 1) qué/quién · 2) dónde/cuándo · 3) cómo/cuánto · 4) por qué/para qué |
| Reversibles y pasiva | Escuchar la frase y tocar la imagen correcta | 1) activa reversible · 2) pasiva · 3) relativas |

### B. Morfología flexiva

| Objetivo | Actividad | Niveles |
|---|---|---|
| Conjugación verbal | Rueda de tiempo (ayer/ahora/mañana) + rueda de persona; completa el hueco | 1) presente reg · 2) pasado reg · 3) futuro y perífrasis · 4) irregulares frecuentes · 5) subjuntivo simple |
| Singular / plural | Máquina de duplicar: entra una imagen, salen varias | 1) +s · 2) +es · 3) cambios (lápiz/lápices) · 4) plural en toda la frase |
| Concordancia género y número | Arrastrar artículo + adjetivo correctos al sustantivo | 1) artículo–sustantivo · 2) sustantivo–adjetivo · 3) frase completa · 4) detectar el error |
| Derivación | Fábrica de palabras: raíz + sufijo | 1) -ito/-ita · 2) -ón/-azo · 3) oficios y lugares · 4) prefijos |
| Ser / estar / haber | Completar el copulativo según contexto | 1) ser vs. estar con adjetivos · 2) hay/está · 3) mixto en texto corto |

### C. Pronombres y referencia — *prioridad*

| Objetivo | Actividad | Niveles |
|---|---|---|
| Clíticos OD (lo/la/los/las) | Dos viñetas: frase completa arriba, con pronombre abajo | 1) sustitución con palabra subrayada · 2) sin subrayado · 3) producción oral |
| Clíticos OI (le/les) | Misma mecánica, foco en a quién | 1) le/les aislado · 2) contraste OD vs. OI · 3) combinados ("se la dio") |
| Correferencia / anáfora | Texto corto; tocar el pronombre y arrastrar flecha al personaje | 1) dos personajes distinto género · 2) mismo género · 3) referencia a distancia |
| Pronombres sujeto y posesivos | Elegir yo/vos/él/nosotros o mi/tu/su/nuestro según la escena | 1) sujeto singular · 2) plural · 3) posesivos · 4) mixto |
| Reflexivos | "El nene lava el auto" vs. "El nene se lava" | 1) se · 2) me/te/se/nos · 3) verbos de rutina |

El área se elige al abrir la sesión. La misma instrumentación sirve para las otras áreas (léxico, fonología, discurso, pragmática); morfosintaxis es el primer módulo, el resto se agrega como más objetivos en el catálogo.

---

## 5. Las 8 mecánicas de interacción

Ocho formatos cubren todo el catálogo. Cada uno es un **componente React que respeta un contrato común**: recibe un `Item`, captura t0/t1/t2 y el distractor elegido, y emite un `Event` estandarizado (§3.1). El motor decide qué mecánica usar según `item.mechanic`.

1. **Arrastrar y soltar** (`drag`) — ordenar frases, concordancia. La ficha correcta encastra y se pone verde; la incorrecta vuelve sola, sin sonido de error.
2. **Completar el hueco** (`fill`) — conjugación, clíticos.
3. **Elegir entre opciones** (`choose`) — la mayoría de los objetivos; una opción incorrecta es siempre el distractor-trampa.
4. **Tocar la imagen correcta** (`touch_image`) — comprensión, reversibles/pasiva.
5. **Encontrar el error** (`find_error`) — concordancia nivel 4.
6. **Grabar la voz** (`record`) — producción. *No autocorrige*: requiere escucha humana → reservar para Modo Sesión / Etapa tardía.
7. **Ruleta generativa** (`roulette`) — tres ruedas (persona·verbo·tiempo o sujeto·verbo·objeto); el chico gira y dice la frase. Genera ítems infinitos. **`computable_for_profile = false`** (dificultad no emparejable → contamina las latencias).
8. **Unir con flecha** (`arrow`) — correferencia/anáfora, nexos.

**Contrato del componente (TypeScript, orientativo):**

```ts
interface MechanicProps {
  item: Item;
  supports: SupportsConfig;      // apoyos activados (§8)
  onEvent: (e: EventInput) => void;   // emite el evento con t0/t1/t2
  onComplete: (result: RoundResult) => void;
}
```

El componente arranca el reloj en `t0` (cuando termina de leerse/mostrarse la consigna), marca `t1` en el primer toque y `t2` en la confirmación. No conoce el modo ni la persistencia: solo emite eventos.

---

## 6. Feedback y refuerzo

- El error **no castiga**: sin sonido de fallo, sin cruz roja, sin perder vidas. La ficha vuelve suavemente y se ofrece una pista *que da el criterio, no la respuesta* (ej. "'las plantas' son muchas y femeninas → buscá la palabrita que también sea femenina y plural").
- **Siempre se puede escuchar**: botón de audio permanente en toda pantalla con texto (habilita prelectores).
- El feedback de producción **siempre pide reproducción oral** ("decilo en voz alta").
- Refuerzo cada 3-5 ítems: micro-animación breve, no un minijuego largo (cortar la actividad cuesta retomarla).
- Sesión corta con **final visible**: barra de progreso "6/9" arriba a la derecha.

---

## 7. Perfil cognitivo transversal

Atención, velocidad de procesamiento, memoria y control inhibitorio, medidos **dentro** de las actividades de lenguaje, sin batería aparte. Cada toque ya dice qué respondió, cuándo, cuánto tardó y qué error eligió: de esos cuatro datos salen los cuatro dominios.

### 7.1. Las cuatro reglas (sin esto, los números mienten)

1. **Línea de base motora.** Latencias netas = latencia − base motora de la sesión (§3.2).
2. **Medir cognición solo en ítems dominados.** Los indicadores cognitivos se calculan **únicamente sobre ítems con >90% de acierto histórico**, donde la demanda lingüística es mínima y queda procesamiento puro. Tardar en un ítem que se está aprendiendo es carga lingüística, no atención.
3. **Comparación intra-sujeto.** Nunca contra una norma poblacional. El chico contra sí mismo: su base, su media, su mes anterior. Importan los cambios, no los valores absolutos.
4. **Dificultad emparejada.** Para comparar latencias, los ítems deben ser del mismo nivel, longitud y frecuencia léxica (por eso se etiquetan desde el diseño, §3.1).

### 7.2. Indicadores por dominio

**Atención:** variabilidad intraindividual (CV = desvío ÷ media, *el más sensible*), sostenimiento (primer vs. último tercio), atención selectiva (fondo liso vs. con distractores), atención alternante (costo de cambio de consigna), pausas y abandonos.

**Velocidad de procesamiento:** latencia neta (mediana t0→t1 en ítems dominados), **automatización de la regla** (curva de latencia con acierto ya estable en 100% — *el hallazgo más útil*: si ya acierta hace un mes pero sigue tardando, la regla no está automatizada), costo de complejidad (pendiente según longitud), denominación (bloque corto de nombrar imágenes).

**Memoria:** punto de quiebre por longitud ("hasta 5 palabras lo sostiene, en 6 se rompe"), patrón de omisión (omitir el medio = sobrecarga de memoria de trabajo, no desconocimiento), efecto de la demora, dependencia del apoyo visual, retención inter-sesión (repaso a 1/7/21 días), ensayos hasta criterio, **transferencia** (% en ítems nunca vistos — separa "aprendió la regla" de "memorizó los ítems"), span de pseudopalabras (mini-juego opcional de 90 s).

**Control inhibitorio:** se mide con **el distractor-trampa** — en cada ítem una opción incorrecta es la respuesta prepotente (el irregular regularizado "ponió", el clítico que concuerda con el sustantivo más cercano en vez del núcleo, el coordinado semántico "tenedor" por "cuchillo"). Indicadores: tasa de error en trampas ÷ neutros (*el central*), respuestas prematuras, perseveración (repetir la regla anterior tras un cambio), ítems "no va" (1 de cada 8, consigna de no responder), autocorrección (señal favorable).

### 7.3. La matriz por área (el corazón operativo)

Los cuatro dominios no se ven igual en cada área. Al abrir la sesión se elige el área y el panel **muestra primero los indicadores de esa columna**:

| Área | Atención | Velocidad | Memoria | Inhibición |
|---|---|---|---|---|
| **Morfosintaxis** | caída de aciertos en la 2ª mitad de la frase | latencia en flexiones dominadas → automatización | longitud donde se rompe el orden; omisión del medio | regularización de irregulares; concordancia con el más cercano |
| Léxico y semántica | variabilidad entre palabras de igual frecuencia | latencia de denominación pura | recuperación a 7/21 días; pista fonológica | coordinado semántico; perseverar en categoría |
| Fonología | errores que crecen con la longitud del bloque | tiempo en rima/sílaba inicial | span de pseudopalabras | palabra entera cuando se pide un segmento |
| Comprensión de discurso | pendiente de aciertos a lo largo del texto; relecturas | tiempo hasta la 1ª respuesta | detalle vs. idea global; principio vs. final | elegir la frase literal cuando se pide inferencia |
| Pragmática | sostenimiento a lo largo de turnos | tiempo de toma de turno | recordar lo dicho 2 turnos atrás | responder antes de que termine la consigna |

Así el perfil no es una pantalla más de números: es información aplicable a la sesión de hoy.

### 7.4. Umbrales de cálculo (defensivos)

- No mostrar ningún indicador cognitivo con **< 40 ítems válidos y < 3 sesiones**. Antes de eso, ruido.
- Usar **mediana**, no media (una distracción de 20 s arruina el promedio).
- Ítems con `computable_for_profile = false` (ruleta) y datos de Modo Casa (`controlled = false`) **no entran** en los cálculos cognitivos.

---

## 8. Personalización por paciente

Cuatro capas, de la más simple a la más específica:

1. **Nivel por objetivo** (no global) — `patient_objective.current_level`. Criterio sugerido para subir: 80% en 3 sesiones seguidas.
2. **Banco de vocabulario propio** — fotos de su perro, su mamá, su mochila. La misma actividad con vocabulario significativo rinde mucho más. Pipeline: comprimir a 512px, JPEG, subir a Supabase Storage, fallback a emoji.
3. **Apoyos activables** (`supports_config`) — consigna en audio, resaltado del hueco, pictogramas, teclado de letras vs. opciones cerradas, tiempo sin límite.
4. **Preferencias sensoriales** (`sensory_prefs`) — sonido on/off, animaciones reducidas, fondo liso, tipografía más grande. Importante para chicos del espectro.

---

## 9. Panel del terapeuta e informes

Lista de pacientes (buscador, "nuevo paciente"). Por paciente:

- **Objetivos en curso** con % por objetivo, nivel, cantidad de ítems, última práctica.
- **Curva de evolución** (últimas 8 semanas) — para mostrar a la familia.
- **Cuadro de errores frecuentes** — lo que orienta la próxima sesión (ej. "confunde le/lo ×14", "omite el artículo ×9", "regulariza ponió ×7").
- **Perfil cognitivo**: radar de los 4 dominios + lista de indicadores con dirección de cambio + una **lectura sugerida** en lenguaje natural ("velocidad conservada, consistencia baja → bloques de 6 min en vez de 12"). *La recomendación es lo que se usa; el radar es lo que se malinterpreta — priorizar la primera.*
- **Memoria y aprendizaje**: acierto según longitud de frase (punto de quiebre), retención por repaso espaciado, ensayos hasta criterio, transferencia, dependencia del apoyo visual.
- Acciones: asignar tarea a casa, editar vocabulario, **exportar informe PDF**.

### Datos que se registran y para qué

| Dato | Para qué sirve |
|---|---|
| % de aciertos por objetivo | decidir cuándo subir de nivel |
| Nivel de ayuda | distinguir "lo logra solo" de "con modelo" — *el dato clínico más valioso* |
| Tipo de error | omisión/sustitución/orden/concordancia → cuadro de errores |
| Latencia de respuesta | detectar automatización (mismo acierto, menos tiempo = consolidación) |
| Adherencia en casa | días y minutos de práctica → conversar con la familia con datos |

---

## 10. Límites, ética y datos de menores

**Dejar esto escrito desde el principio**, porque en cuanto la app muestre un radar de 4 dominios alguien lo va a leer como diagnóstico.

- **No es una evaluación neuropsicológica.** No hay baremos, muestra normativa ni condiciones controladas. Es monitoreo intra-sujeto. **Nunca** mostrar percentiles ni etiquetas diagnósticas. Mostrar siempre una frase visible: *"seguimiento del desempeño en la actividad, no evaluación cognitiva."*
- **El lenguaje contamina todo** → Regla 2 (medir solo en ítems dominados) no es un detalle, es lo que separa un indicador interpretable de un número engañoso.
- **El contexto contamina el resto** → datos de Casa marcados "no controlado", no promediados con Sesión.
- **Cantidad mínima de datos** → sin indicadores cognitivos por debajo de 40 ítems válidos y 3 sesiones.
- **Los indicadores orientan, no deciden** → sugieren una hipótesis, eventualmente fundamentan una derivación a neuropsicología. Nunca la reemplazan.
- **Datos de menores** → consentimiento informado de la familia, almacenamiento cifrado, exportar y borrar. Resolver en la arquitectura de la Etapa 1, no después. RLS para aislar pacientes por terapeuta.

---

## 11. Principios de diseño visual

- **Una sola tarea por pantalla.** Sin menús laterales ni distractores durante la actividad: consigna, estímulo, opciones. Nada más.
- **Áreas táctiles grandes.** Mínimo 60×60 px (muchos chicos tienen dificultades motrices asociadas; un target chico genera errores que no son de lenguaje).
- **El error no castiga** (ver §6).
- **Siempre se puede escuchar** (ver §6).
- **Refuerzo cada 3-5 ítems**, micro-animación breve.
- **Sesión corta con final visible** (barra "6/9").
- Formato **tablet horizontal**; los mockups del documento de Leticia definen jerarquía y flujo, no colores ni tipografía definitivos.

---

## 12. Núcleo común y patrones de base

La capa horizontal (sin color terapéutico) que conviene construir como un `core/` reutilizable, separado del contenido morfosintáctico:

- **Motor único config-driven** (elige mecánica, arma ítem, orquesta la ronda).
- **Pipeline de vocabulario con fotos** (compresión 512px, Storage, fallback a emoji).
- **Registro de eventos** con anatomía temporal (t0/t1/t2 + trampa + nivel de ayuda).
- **Sync offline-first** sobre IndexedDB (local como fuente inmediata, sube con debounce, baja al entrar).
- **Sistema de diseño infantil** (tokens, botones "físicos", feedback, refuerzos, progreso).
- **Selección adaptativa** (muestreo ponderado por objetivo: aparecen más los objetivos/ítems flojos, menos los dominados).

**Anti-patrones a evitar explícitamente:**
- Un objeto `config` monolítico por usuario (usar el modelo de §3).
- Auth por usuario sin contraseña (se manejan datos de salud de menores → Auth real + RLS).
- Guardar una única latencia global por ítem (perder la separación iniciación/ejecución es irreversible).

---

## 13. Roadmap (MVP realista)

Instrumentación cognitiva (t0/t1/t2 + trampa) **desde el día uno en todas las etapas**, aunque no se muestre.

**Etapa 0 — Fundaciones.** Modelo de datos de §3, Auth + RLS, política de datos de menores (consentimiento, cifrado, export/borrar), esquema de `event` completo, IndexedDB + sync. Núcleo común construido.

**Etapa 1 — Prueba.** Una actividad de punta a punta: **ordenar frases** (mecánica `drag`), 3 niveles, uso solo en Sesión. Usa el banco de vocabulario con fotos. Registra t0/t1/t2 y distractor aunque no muestre nada.

**Etapa 2a — Núcleo de actividades.** Ordenar frases + preposiciones + pronombres (prioridad) + verbos. Ficha de paciente, nivel por objetivo, apoyos y preferencias sensoriales.

**Etapa 2b — Núcleo cognitivo.** Panel del terapeuta con los 4 indicadores base (base motora, latencia neta, variabilidad, sostenimiento). Distractores-trampa etiquetados. **Mostrar lecturas sugeridas en lenguaje natural antes que el radar numérico.**

**Etapa 3 — Completo.** Modo Casa formal, informes PDF exportables, repaso espaciado, transferencia, ítems "no va", radar cognitivo, matriz por área, grabación de voz. Recién acá tiene sentido pensarlo como producto para otros profesionales.

> Nota crítica de arranque: el catálogo describe el producto terminado. Construir el **motor y la instrumentación completos**, pero **mostrar poco y con humildad**. El valor está en la recomendación de la próxima sesión, no en el tablero de números.

---

## 14. Decisiones no negociables (checklist para Antigravity)

- [ ] Registrar **t₀ / t₁ / t₂ + base motora + distractor elegido** desde el primer ítem.
- [ ] Etiquetar cada ítem con **nivel, longitud y frecuencia léxica** desde el diseño (Regla 4).
- [ ] **Auth real + RLS** desde la Etapa 1 (datos de salud de menores).
- [ ] **IndexedDB** para el volumen de eventos, no localStorage.
- [ ] **Nivel por objetivo**, nunca global.
- [ ] Consigna **comprensión/producción** como parámetro del ítem, no como mecánica.
- [ ] Datos de **Casa** (`controlled=false`) y de **ruleta** (`computable_for_profile=false`) fuera de los cálculos cognitivos.
- [ ] Frase visible **"no es evaluación cognitiva"**; nunca percentiles ni etiquetas.
- [ ] Export y borrado por paciente disponibles desde el día uno.
- [ ] Umbral **40 ítems válidos / 3 sesiones** antes de mostrar cualquier indicador cognitivo.
