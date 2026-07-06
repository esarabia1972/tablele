# Tablele — Especificación de desarrollo (v1)

> Spec para implementar con Antigravity. **Tablele** es una app web para practicar lectura con tableros de palabras, basada en el método SELEC. Parte de un prototipo funcional (`reference/JuegosManu_v2.html`) cuyo **estilo visual y funcionalidad de juego deben conservarse tal cual**, salvo los cambios indicados en §7.

**Deploy:** Vercel (`tablele.vercel.app`) · **Fecha:** 2026-07-05

---

## 1. Alcance de la v1

- Acceso por email contra una lista blanca guardada en un JSON del repo.
- Los 5 juegos existentes del prototipo, sin cambios de mecánica.
- Configuración (pantalla de adulto): editar la lista de palabras (una por letra del abecedario) con emoji sugerido y editable; selector de Método y Nivel.
- Funciona en teléfonos (responsive + touch), tablets y desktop.
- Sin base de datos: allowlist en JSON, configuración y progreso en `localStorage`.

Fuera de alcance v1: cuentas con contraseña, backend/DB, fotos subidas, nivel Silábica (solo visible, deshabilitado).

## 2. Stack y estructura

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS.** Deploy en Vercel.
- El juego es 100 % client-side. Única lógica de servidor: validación del email (API route), para no exponer la lista completa de emails en el cliente.

```
/app
  /page.tsx              → Login (email)
  /jugar/page.tsx        → Menú de juegos (pantalla del niño)
  /config/page.tsx       → Configuración (pantalla del adulto)
  /api/acceso/route.ts   → POST { email } → { ok: boolean, nombre?: string }
/data/allowlist.json     → lista blanca de emails
/data/palabras-default.ts→ palabras iniciales (una por letra) + emojis sugeridos
/lib/                    → TTS, sonidos, stats, storage
/reference/JuegosManu_v2.html  → prototipo original (solo referencia visual/funcional)
```

## 3. Acceso por email

**Flujo:** el usuario entra a `tablele.vercel.app` → pantalla con campo de email y botón grande "Entrar" → si el email (case-insensitive, trim) está en `data/allowlist.json`, entra al menú de juegos; si no, mensaje amable "Este email no tiene acceso todavía".

- `allowlist.json`: `[{ "email": "esarabia@q4tech.com", "nombre": "Manu" }]` — el `nombre` es el del niño asociado, usado en frases de aliento y pantallas ("¡muy bien, manu!"). Editar la lista = editar el JSON y redeploy.
- La validación se hace en la API route (server-side). Si `ok`, se guarda `{ email, nombre }` en `localStorage` y no se vuelve a pedir en ese dispositivo.
- Botón discreto "salir" (en Configuración) para cambiar de email.
- No es autenticación de seguridad real ni pretende serlo: es un filtro de acceso para uso familiar.

## 4. Configuración (pantalla del adulto)

Accesible desde un botón ⚙️ en la barra superior del menú. Contiene:

**a) Método:** selector con única opción **SELEC** (preseleccionada). Preparado para agregar métodos a futuro.

**b) Nivel:** dos opciones — **Global** (seleccionada, son los juegos actuales) y **Silábica** (visible pero deshabilitada, con etiqueta "próximamente").

**c) Lista de palabras:** tabla de 27 filas, una por letra del abecedario (a–z + ñ), cada una con:

- **Letra** (fija, solo lectura).
- **Palabra** (input de texto, minúsculas con acentos). Debe empezar con la letra de la fila (validar; si no, aviso).
- **Emoji**: al escribir la palabra se **sugiere automáticamente** un emoji desde un diccionario local palabra→emoji (ej.: gato→🐱, sol→☀️, casa→🏠; con fallback por categoría/keyword). El adulto puede **cambiarlo** tocándolo (picker simple de emojis o input libre).
- Checkbox "usar" para excluir una letra difícil (ej. w, x) sin borrar la palabra.

Valores iniciales: las palabras del prototipo (`auto, bebé, casa, dedo, elefante, fideos, gato, helado, india, jugo, kiosco, luna, manuel, nene, oso, papá, queso, ratón, sol, tractor, uva, yogur, zapato`) completando las letras faltantes (ñ, v, w, x) con sugerencias (ñoqui 🍝, vaca 🐄, wifi 📶, xilofón 🎼).

- Botones "guardar" y "restaurar palabras originales".
- Todo se persiste en `localStorage` (clave `tablele.config`).
- El botón "borrar historial" de estadísticas se mantiene con la pulsación larga de 2 s del prototipo.

## 5. Juegos (sin cambios de mecánica)

Portar 1:1 desde el prototipo, leyendo las palabras desde la configuración (solo las marcadas "usar"):

1. **👀 Conocer las palabras** — presentación con imagen + palabra + voz, sin evaluación.
2. **📖 Leo y busco el dibujo** — palabra escrita → elegir emoji entre 3.
3. **🔍 Miro y busco la palabra** — emoji → elegir palabra escrita entre 3.
4. **🃏 Memotest** — 6 parejas palabra–emoji.
5. **🦜 El loro dice** — audio → palabra escrita.

Conservar exactamente: aprendizaje sin error (al 2.º error la opción correcta brilla), estrellas (meta 20 → premio), confeti, sonidos, frases de aliento con TTS y nombre del niño, informe 📊 de aciertos por palabra, persistencia de estrellas y stats en `localStorage`, selección de voz masculina es-AR (portar `scoreVoice`/`bestVoice` tal cual).

## 6. Estilo visual

Mantener el look & feel del prototipo: misma paleta (celeste→amarillo, botones naranja/verde/violeta/rosa), mismas fuentes redondeadas, bordes redondeados grandes, sombras "3D" con `box-shadow` y efecto de hundido al tocar, animaciones pop/shake/confeti. Replicar con Tailwind + CSS propio; no rediseñar.

## 7. Cambios respecto al prototipo (los ÚNICOS)

1. **Botones más grandes en general**, especialmente los del menú principal: mínimo ~30 % más de área táctil, targets nunca menores a 72 px en móvil.
2. **No dar pistas por audio en los juegos de lectura:**
   - **📖 Leo y busco el dibujo:** eliminar el `speak(palabra)` automático al mostrar la ronda **y** el audio al tocar la tarjeta de la palabra (el niño debe leerla solo). Quitar la leyenda "🔊 tocá la palabra para escucharla".
   - **🔍 Miro y busco la palabra:** eliminar el audio al tocar la tarjeta del emoji (decir la palabra regala la respuesta).
   - El audio de la palabra se mantiene en 👀 (presentación) y 🦜 (es la consigna). Las frases de aliento por acierto se mantienen en todos los modos.
3. **Soporte teléfono:** el prototipo se pensó para tablet/PC. Ajustar: memotest en grilla 3×4 en pantallas angostas, opciones de emoji apiladas si no entran 3 en fila, tipografías con `clamp()`, `viewport-fit`, probar en 360×640. Todo con touch como interacción primaria.
4. Palabras dinámicas desde configuración (en vez del array `WORDS` hardcodeado) y textos con el nombre del niño desde el login (en vez de "manu" fijo).

## 8. Criterios de aceptación

- Email fuera de la lista → no entra; email de la lista → entra directo al menú y no vuelve a pedirse en ese dispositivo.
- En un teléfono de 360 px de ancho, los 5 juegos se juegan cómodamente sin scroll horizontal ni botones cortados.
- En 📖 y 🔍 no suena la palabra objetivo bajo ninguna interacción.
- Cambiar una palabra o su emoji en Configuración se refleja inmediatamente en todos los juegos.
- Nivel "Silábica" visible pero no seleccionable.
- Estrellas, premio, informe y borrar-historial funcionan igual que en el prototipo.
- Recargar la página o cerrar el navegador no pierde: acceso, configuración, estrellas ni estadísticas.

## 9. Setup de Git y deploy en Vercel

1. Crear repo GitHub `tablele` (privado). Incluir `reference/JuegosManu_v2.html` y esta spec como `docs/SPEC.md`.
2. Scaffold: `npx create-next-app@latest tablele --typescript --tailwind --app`.
3. Ramas: trabajar en `main` con previews; Vercel deploya cada push.
4. En vercel.com: "Add New Project" → importar el repo → framework Next.js autodetectado → deploy. URL resultante: `tablele.vercel.app` (los subdominios de Vercel son `.vercel.app`, no `.vercel.com`).
5. Sin variables de entorno en v1 (el allowlist viaja en el repo — por eso el repo debe ser **privado**).
6. Actualizar emails: editar `data/allowlist.json`, commit, push → redeploy automático.

## 10. Futuro (no implementar ahora)

Nivel Silábica (juegos de armar palabras con sílabas), fotos reales en lugar de emojis, múltiples perfiles por email, backend con DB para configuración compartida entre dispositivos, más métodos además de SELEC.
