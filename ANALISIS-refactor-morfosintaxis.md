# Tablele v2 — Análisis del refactor hacia el módulo de morfosintaxis

*Documento de trabajo · primer análisis · comparación entre Tablele actual y el concepto de Leticia*

---

## 1. Resumen en una línea

Tablele hoy es, en los términos del documento de Leticia, **una sola columna de su matriz**: el área de *léxico / denominación* (leer y reconocer palabras sueltas). El concepto de Leticia es mucho más amplio: un **motor único con contenido configurable por objetivo**, tres modos de uso, y un **perfil cognitivo transversal** medido dentro de la actividad. La buena noticia es que la arquitectura de base de Tablele ya está sorprendentemente alineada con esa visión. El salto no es empezar de cero: es **generalizar** lo que ya existe.

---

## 2. Qué es Tablele hoy

**Stack:** Next.js 16 + React 19 + Tailwind 4, PWA (tiene manifest), datos en Supabase con localStorage como fuente inmediata (funciona offline, sincroniza con debounce).

**Modelo mental actual:** una app *por chico*. El acceso es por usuario (sin contraseña, se autocrea), y cada usuario tiene **una** configuración: nombre, método (SELEC, fijo), etapa (Global, fija), nivel (inicial/intermedio) y una lista de palabras — una por letra del abecedario, cada una con emoji o **foto real subida** y un flag "usar".

**Motor de juego (un solo `GameEngine`, 526 líneas):** cinco modos sobre el mismo contenido.

| Modo | Qué hace | Equivalente en Leticia |
|---|---|---|
| `show` (Conocer) | Presenta la palabra + imagen + audio | Exposición / modelado |
| `wp` (Leo y Busco) | Palabra → tocar la imagen correcta | Comprensión, mecánica "tocar la imagen" |
| `pw` (Miro y Busco) | Imagen → tocar la palabra correcta | Comprensión, "elegir entre opciones" |
| `listen` (El Loro Dice) | Audio → tocar la palabra | Comprensión auditiva |
| `memo` (Memotest) | Aparear palabra ↔ imagen | Memoria |

**Lo que ya registra por cada respuesta (`Evento`):** timestamp, juego, palabra objetivo, qué eligió, acierto sí/no, número de intento, **latencia en ms** desde que apareció la ronda, y flag de ayuda (si la correcta ya estaba resaltada).

**Selección inteligente (`seleccion.ts`):** muestreo ponderado que hace aparecer más las palabras con bajo acierto o lentas, y menos las dominadas (últimos 3 primeros intentos OK y rápidas). Es, de hecho, un embrión de repaso adaptativo.

**Informe (para el adulto, detrás de un candado de suma):** tiempo de uso (hoy / 7 / 30 días), % correcto al primer intento y mediana de tiempo por palabra, **confusiones** (qué eligió cuando erró), y % por juego.

**Principios de diseño ya presentes:** el error no castiga (la opción vuelve, se ofrece pista a los 2 errores), audio siempre disponible, barra de progreso, refuerzo con estrellas y confeti, áreas táctiles grandes. Coinciden casi punto por punto con la sección 11 de Leticia.

---

## 3. Qué pide el concepto de Leticia

1. **Un motor, muchos contenidos configurables.** Armar un "plan" por paciente eligiendo objetivos; la app genera las actividades. (Tablele ya es config-driven, pero con un catálogo de un solo tipo.)
2. **Tres puertas de entrada:** Modo Terapeuta (trastienda con clave), Modo Sesión (pantalla del chico + registro de nivel de ayuda), Modo Casa (autónomo, sesiones cortas, sin config).
3. **Modelo multi-paciente:** un terapeuta con varios pacientes, cada uno con su ficha, su banco de vocabulario y su nivel **por objetivo** (no un nivel global).
4. **Catálogo morfosintáctico** ordenado por complejidad: estructura de la oración, morfología flexiva, pronombres y referencia — cada bloque con 3-4 niveles.
5. **8 mecánicas reutilizables:** arrastrar y soltar, completar el hueco, elegir opción, tocar imagen, encontrar el error, grabar voz, ruleta generativa, unir con flecha.
6. **Perfil cognitivo transversal:** atención, velocidad de procesamiento, memoria y control inhibitorio, medidos *dentro* del lenguaje, sin tests aparte.
7. **Panel del terapeuta:** % por objetivo, curva de evolución, cuadro de errores frecuentes, radar cognitivo, y una lectura sugerida para la próxima sesión.
8. **Marco ético/legal:** datos de salud de menores → consentimiento, cifrado, exportar/borrar, y la advertencia visible de que **no es una evaluación neuropsicológica**.

---

## 4. Alineación y brechas

### 4.1. Lo que ya tenés y hay que conservar (es tu ventaja de arranque)

- **Arquitectura de motor único config-driven.** Exactamente la idea de Leticia. Hoy el "contenido" son palabras; mañana serán objetivos con ítems.
- **Banco de vocabulario propio con fotos reales.** Leticia lo marca como *"probablemente el diferencial más grande frente a las apps que existen"* — y vos ya lo tenés funcionando (subida, compresión a 512px, persistencia).
- **Registro de eventos + selección adaptativa.** Es el cimiento del perfil cognitivo y del repaso espaciado. Hay que enriquecerlo, no reemplazarlo.
- **Offline-first + sync a Supabase.** Sirve tal cual para Modo Casa y Modo Sesión.
- **Principios de diseño infantil** ya implementados (error barato, audio permanente, progreso visible, refuerzo).
- **Informe con métricas por ítem y confusiones.** Es el esqueleto del panel del terapeuta.

### 4.2. Las brechas reales (lo nuevo del v2)

| Brecha | Hoy | v2 (Leticia) | Peso |
|---|---|---|---|
| **Multi-paciente** | 1 config por usuario | terapeuta → N pacientes, cada uno con ficha | Alto — cambia el modelo de datos |
| **Nivel por objetivo** | 1 nivel global | nivel independiente por objetivo | Alto |
| **Catálogo gramatical** | solo palabra↔imagen | oraciones, flexión, pronombres | Alto — es el corazón del módulo |
| **Mecánicas nuevas** | elegir 1 de 3 / aparear | arrastrar, completar hueco, unir flecha, ruleta, grabar voz | Alto |
| **Tres modos explícitos** | jugar + config (candado suma) | Terapeuta / Sesión / Casa | Medio |
| **Instrumentación cognitiva** | 1 latencia (`ms`) | t₀/t₁/t₂, base motora, distractor trampa | Alto — pero barato si se hace ya |
| **Perfil cognitivo + matriz por área** | no existe | radar, CV, sostenimiento, transferencia, repaso espaciado | Alto |
| **Privacidad datos de menores** | usuario sin auth real | consentimiento, cifrado, export/borrar | Alto — resolver en arquitectura, no después |
| **Advertencia "no es diagnóstico"** | no existe | frase visible, sin percentiles ni etiquetas | Bajo esfuerzo, alto valor legal |

---

## 5. Implicaciones de arquitectura

El refactor gira alrededor de **tres decisiones estructurales**. Si estas quedan bien, el resto es contenido.

**a) Del "config" al modelo de dominio.** Hoy `ConfigTablero` mezcla identidad del chico, ajustes y vocabulario en un solo objeto por usuario. En v2 conviene separar: **Terapeuta** → **Paciente** (ficha, apoyos, preferencias sensoriales, banco de vocabulario) → **PlanDeObjetivos** (cada objetivo con su nivel actual) → **Ítem** (instancia concreta de una actividad, etiquetada con nivel, longitud y frecuencia léxica desde el diseño, como pide la Regla 4).

**b) Del "modo de juego" al "tipo de actividad + consigna".** El `GameEngine` actual tiene los cinco modos hardcodeados en un solo componente con muchos `if`. En v2 conviene que cada una de las 8 mecánicas sea un componente que recibe un ítem y emite eventos estandarizados. La consigna (comprensión vs. producción) es un parámetro, no un modo aparte — tal como sugiere la "nota de diseño" de Leticia (el mismo ítem sirve para las dos).

**c) Del evento simple al evento con anatomía temporal.** Hoy se guarda un solo `ms`. La decisión técnica más importante del módulo, según Leticia, es **separar t₀ (aparece) → t₁ (primer toque) → t₂ (respuesta final)**, más la línea de base motora y la marca de si el distractor elegido era el "trampa". Esto es barato de agregar *ahora* e imposible de recuperar después. Aunque no se muestre nada todavía, hay que empezar a registrarlo desde el día uno.

---

## 6. Camino sugerido (mapeado a las etapas de Leticia)

No perder Tablele: la recomendación es **construir v2 como evolución del mismo código**, empezando por una actividad nueva y el modelo de datos nuevo, dejando las cinco actividades actuales funcionando en paralelo hasta migrarlas.

**Etapa 0 — Fundaciones (invisible para el usuario).**
Enriquecer el `Evento` a t₀/t₁/t₂ + base motora + distractor-trampa. Introducir el modelo Paciente/Objetivo/Ítem sin romper la config actual. Definir desde ya la política de datos de menores (consentimiento, cifrado, borrar/exportar).

**Etapa 1 — Prueba.**
Una actividad morfosintáctica nueva de punta a punta — *ordenar frases* (arrastrar y soltar) es la candidata natural, 3 niveles, uso solo en sesión. Reutiliza el vocabulario con fotos que ya existe.

**Etapa 2 — Núcleo.**
Ordenar frases + preposiciones + pronombres + verbos. Ficha de paciente, nivel por objetivo, panel del terapeuta con los 4 indicadores base (base motora, latencia neta, variabilidad, sostenimiento). Migrar acá las 5 actividades actuales como el área "Léxico".

**Etapa 3 — Completo.**
Modo Casa formal, informes exportables, repaso espaciado, transferencia, ítems "no va", radar cognitivo y matriz por área.

---

## 7. Riesgos y cosas para decidir

- **Migración de datos:** los usuarios actuales tienen su config y su historial en Supabase. Hay que decidir si migran a "paciente" o si v2 arranca limpio y v1 queda congelada.
- **Alcance del rol:** ¿Tablele v2 es para uso de Leticia sola, o producto para otros profesionales? Leticia sugiere que eso recién tiene sentido en Etapa 3.
- **Ética antes que features:** la advertencia de "no es diagnóstico" y el manejo de datos de salud de menores conviene resolverlos en la arquitectura de Etapa 0, no al final.
- **El perfil cognitivo miente sin las 4 reglas** (base motora, medir solo en ítems dominados, comparación intra-sujeto, dificultad emparejada). Si se muestran números sin respetarlas, es peor que no mostrarlos.

---

## 8. Conclusión

No es un rehacer: es un **generalizar**. Tablele ya acertó en lo difícil de copiar (motor único, vocabulario propio con fotos, registro por ítem, offline-first, diseño infantil respetuoso del error). Lo que falta es abrir el catálogo más allá del léxico, pasar de un chico a muchos pacientes con nivel por objetivo, y aprovechar cada toque de pantalla para el perfil cognitivo. La palanca de mayor retorno y menor costo hoy es **empezar a registrar la anatomía temporal del ítem (t₀/t₁/t₂) y el distractor-trampa desde ya**, aunque todavía no se muestre nada: es gratis ahora e irrecuperable después.
