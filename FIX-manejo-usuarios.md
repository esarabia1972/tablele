# Tablele — Manejo de usuarios: diagnóstico y arreglos

> Diagnóstico + arreglos ya aplicados. Rama `fix/manejo-usuarios`.
> Fecha: 2026-08-28 · Base: `c162dba` + el trabajo multiusuario que estaba sin commitear · App: v0.9.2
> Alcance: alta/acceso de usuario, aislamiento de datos por usuario, guardado de
> configuración (palabras/parámetros) y persistencia del informe.

## ✅ Estado: implementado

Los tres PRs del plan están aplicados en la rama `fix/manejo-usuarios`. Este
documento sigue siendo el diagnóstico completo — sirve para entender **por qué**
cada cambio está donde está.

| Bug | Estado | Dónde |
|---|---|---|
| BUG-01 `keepalive` rompe el guardado | ✅ | `lib/sync.ts` → `postDatos()`, `LIMITE_KEEPALIVE` |
| BUG-02 push atribuido al usuario nuevo | ✅ | `lib/sync.ts` → `Pendiente.username`, `cerrarSesionSync()` |
| BUG-03 se sube `stars`/`stats`/`config` vacíos | ✅ | `lib/sync.ts` → `estaHidratado()`; `app/api/datos` merge |
| BUG-04 clave compartida sin sesión | ✅ | `lib/storage.ts` → `userKey()` devuelve `null`; guardias en `/config` y `/config/informe` |
| BUG-05 migración hardcodeada a `manu` | ✅ | `lib/storage.ts` → `migrarLegacy(username)` |
| BUG-06 el pull pisa lo local | ✅ | `lib/sync.ts` → `syncFromServer()` con merge; `lib/eventos.ts` |
| BUG-07 `sendBeacon` sin chequear cuota | ✅ | `lib/sync.ts` → `flushBeacon()` con degradado parcial |
| BUG-08 errores invisibles | ✅ | `app/api/datos` status HTTP real; aviso en `/config` |
| BUG-09 `PALABRAS_DEFAULT` por referencia | ✅ | `data/palabras-default.ts` → `Object.freeze` + `palabrasDefault()` |
| BUG-10 typo crea usuario en silencio | ✅ | `app/api/acceso` en dos pasos; confirmación + chips en el login |
| BUG-11 salir no flushea ni limpia | ✅ | Diálogo de salida en `/config` + `cerrarSesionSync()` |
| m1–m6 menores | ✅ | ver §3 FIX-11 |
| §5 falta de autenticación | ⛔ **pendiente** | fuera de alcance, decisión de producto |

**Archivos nuevos:** `lib/claves.ts` (claves y helpers puros), `lib/eventos.ts`
(merge de métricas, compartido entre cliente y servidor),
`lib/datos.run-tests.ts` y `lib/sync.run-tests.ts` (89 casos), `lib/test/`
(hook para resolver el alias `@/` al correr los tests con Node).

**Verificación:** `npm test` (89 casos), `npx tsc --noEmit`, `npm run build`.
Los 11 errores de eslint que quedan son preexistentes, en `components/GameEngine.tsx`
y `lib/audio.ts`, archivos que este trabajo no toca.

### Sobre los datos de `manu`

Nada de esto borra la fila `username = 'manu'` de `tablele_datos` ni las claves
`tablele.*_manu` del navegador. Al contrario, tres cambios existen justamente
para que no se pueda pisar:

- El servidor **fusiona** el informe en vez de sobrescribirlo: un push viejo o un
  segundo dispositivo ya no pueden vaciarlo (`app/api/datos/route.ts`).
- Un dispositivo que todavía no bajó la fila de un usuario **no le sube ni la
  config ni el informe**, así que entrar como `manu` en una tablet nueva no puede
  reemplazar sus palabras por las de fábrica.
- Vaciar `stats` sólo se acepta con `forzarBorrado: true`, que manda únicamente el
  candado adulto del informe.

La `migrarLegacy()` nueva, además, **ya no borra** las claves legacy: las archiva
bajo `tablele.legacy.*`.

Aparte: el cambio multiusuario que estaba sin commitear despersonalizó los
defaults (`india`→`iguana`, `manuel`→`mono`, `papá`→`pato`). Eso está bien y se
mantiene — las palabras de Manu viven en **su** config guardada, no en el default
de fábrica.

---

## 0. Resumen ejecutivo

Los síntomas reportados por el usuario son tres:

1. Al entrar con un usuario nuevo, **no aparece el set de palabras por defecto**: quedan las de un usuario anterior.
2. **No se graban las palabras nuevas** por usuario (los cambios de Configuración "se revierten").
3. Los **informes no se persisten** por usuario.

No son tres bugs sueltos: son consecuencias de **un mismo defecto raíz** más cuatro
defectos secundarios que lo amplifican.

**Causa raíz (BUG-01):** `lib/sync.ts` sube TODO el estado del usuario
(`config` + `stars` + los hasta 2000 eventos del informe) en un solo POST hecho con
`fetch(..., { keepalive: true })`. El estándar Fetch **rechaza con error de red
cualquier request con `keepalive: true` y body > 64 KiB**. Con historial acumulado el
payload pasa ese límite, **todos los POST empiezan a fallar en silencio** (el error se
traga un `catch {}` vacío), y como `syncFromServer()` **sí** funciona, en el siguiente
montaje de pantalla el servidor devuelve la config vieja y **pisa el localStorage con
las palabras anteriores**. De ahí los tres síntomas a la vez.

Los demás defectos (BUG-02 a BUG-05) hacen que además se **atribuyan escrituras al
usuario equivocado** y se **borren datos del servidor** al cambiar de usuario.

**Orden de ataque sugerido:** BUG-01 → BUG-02 → BUG-03 → BUG-04 → BUG-05 → resto.
Con BUG-01 y BUG-02 arreglados los tres síntomas reportados desaparecen.

---

## 1. Cómo funciona hoy el manejo de usuarios (estado actual)

Mapa real del código, para que Antigravity no tenga que reconstruirlo:

### 1.1. Alta y acceso — `app/page.tsx` + `app/api/acceso/route.ts`

- No hay contraseña. El adulto escribe un **username** (`/^[a-z0-9_]{3,20}$/`).
- `POST /api/acceso` hace un upsert en Supabase `tablele_datos` con `{ username }`
  y `Prefer: resolution=merge-duplicates` → si no existe lo crea, si existe no pisa nada.
- Si no hay `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, devuelve `ok:true` igual y la
  app corre 100% local.
- El cliente hace `setSessionData({ username })` → `localStorage["tablele.session"]`
  y luego `await syncFromServer(username)` antes de ir a `/jugar`.
- **No hay verificación de identidad**: quien escriba un username existente entra a esos datos.

### 1.2. Aislamiento por usuario — `lib/storage.ts`

Todo pasa por `userKey(base)`:

```ts
function userKey(base: string): string {
  const session = getSessionData();
  return session?.username ? `${base}_${session.username}` : base;   // ← fallback peligroso
}
```

Claves por usuario: `tablele.config_<user>`, `tablele.stars_<user>`,
`tablele.lastPlayed_<user>`, `tablele.eventos_<user>`, `tablele.uso_<user>`.
`tablele.session` es global (correcto).

### 1.3. Sincronización — `lib/sync.ts`

- `localStorage` es la fuente inmediata; Supabase es respaldo + sync entre dispositivos.
- `saveConfig()`, `setStars()`, `recordEvento()`, `addUso()` llaman a `schedulePush()`
  (debounce 600 ms).
- `pushNow()` arma el payload completo y hace `POST /api/datos` con `keepalive: true`.
- `syncFromServer(username)`: si hay push pendiente lo flushea, después hace
  `GET /api/datos?username=…` y **sobrescribe** las claves locales de ese usuario.
- Se llama en el login, y en el montaje de `/jugar`, `/config` y `/config/informe`.

### 1.4. Dónde se graban los informes

- Local: `tablele.eventos_<user>` (últimos 2000) y `tablele.uso_<user>` (últimos 90 días).
- Servidor: columna `stats` (jsonb) de `tablele_datos`, como `{ eventos, uso }`.
- El informe (`/config/informe`) **no guarda agregados**: recalcula todo al vuelo desde
  los eventos crudos. Eso está bien y hay que conservarlo.

---

## 2. Defectos encontrados

### 🔴 BUG-01 — `keepalive: true` rompe el guardado en cuanto hay historial

**Archivo:** `lib/sync.ts`, `pushNow()` (y `flushBeacon()`).

```ts
await fetch("/api/datos", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(collectPayload(username)),
  keepalive: true,          // ← límite duro de 64 KiB de body
});
```

**Por qué falla.** El Fetch Standard obliga al navegador a devolver *network error*
si `keepalive` está en `true` y el body supera **64 KiB** (Chrome, Safari y Firefox lo
aplican). El payload de Tablele incluye los eventos crudos:

| Contenido | Tamaño aproximado |
|---|---|
| Un `Evento` serializado | ~120 bytes |
| `config` con 27 palabras (+ URLs de fotos) | 2–5 KB |
| **Umbral de 64 KiB** | **≈ 500–550 eventos** |

Una sesión de un chico genera fácil 30–40 eventos (6 rondas × 5 juegos + reintentos).
**A las ~15 sesiones el usuario cruza el umbral y a partir de ahí NINGÚN push llega
al servidor.** Nunca más. Y el tope de `MAX_EVENTOS = 2000` garantiza que el payload
se queda arriba del límite para siempre.

**Por qué es silencioso.** El `fetch` rechaza con `TypeError`, que cae en:

```ts
} catch {}     // ← se traga el error, sin log, sin aviso al usuario
```

Y encima el server, cuando responde, puede devolver `{ ok:false, sbError }` con
**HTTP 200**: el cliente ni siquiera mira `res.ok` ni el body.

**Cadena completa que produce los 3 síntomas reportados:**

1. El adulto edita las palabras en `/config` y toca **Guardar**.
2. `saveConfig()` escribe bien en `tablele.config_<user>` → en pantalla se ve guardado.
3. `flushPush()` → POST → **falla en silencio por el límite de 64 KiB**.
4. `router.push("/jugar")` → `JugarPage` monta → `syncFromServer(user)` → **el GET sí funciona**
   → devuelve la `config` VIEJA del servidor → **pisa `tablele.config_<user>`**.
5. `GameEngine.initGame()` lee `getConfig()` → **el set de palabras anterior**. ✅ síntoma 1 y 2.
6. Los eventos nuevos tampoco suben nunca → el informe del servidor queda congelado, y en
   el próximo login el pull sobrescribe el local con esa versión vieja → **se pierde
   historial**. ✅ síntoma 3.

**Cómo verificarlo en 30 segundos** (consola del navegador, logueado con el usuario que falla):

```js
const u = JSON.parse(localStorage["tablele.session"]).username;
const size = new Blob([JSON.stringify({
  username: u,
  config: JSON.parse(localStorage[`tablele.config_${u}`] || "null"),
  stars: +(localStorage[`tablele.stars_${u}`] || 0),
  stats: {
    eventos: JSON.parse(localStorage[`tablele.eventos_${u}`] || "[]"),
    uso: JSON.parse(localStorage[`tablele.uso_${u}`] || "{}"),
  },
})]).size;
console.log(size, "bytes —", size > 65536 ? "❌ EXCEDE el límite de keepalive" : "✅ ok");
```

Si da > 65536 el bug está confirmado para ese usuario. También se ve en DevTools →
Network: el POST a `/api/datos` aparece como **failed / (blocked)**.

---

### 🔴 BUG-02 — El push pendiente se atribuye al usuario NUEVO al cambiar de usuario

**Archivo:** `lib/sync.ts`.

`schedulePush()` **no captura el username**; `pushNow()` lo lee recién al disparar:

```ts
async function pushNow() {
  const username = getUsername();          // ← se resuelve 600 ms después
  ...
}
```

Y `syncFromServer()` flushea lo pendiente **después** de que el login ya escribió la
nueva sesión:

```ts
export async function syncFromServer(username) {
  if (pushTimer) { await flushPush(); }    // ← usa el username NUEVO
  ...
}
```

**Secuencia reproducible:**

1. Juega `ana`. `addUso(15)` / `recordEvento()` dejan un `pushTimer` pendiente.
2. Adulto → `/config` → **Salir** → `clearSessionData()`.
   → si el timer dispara ahora, `getUsername()` es `null` y `pushNow()` **descarta el push**:
   **los últimos eventos y estrellas de `ana` nunca llegan al servidor.**
3. Login como `beto` → `setSessionData(beto)` → `syncFromServer(beto)` → hay `pushTimer`
   → `flushPush()` → `collectPayload("beto")`.
4. Como `beto` todavía no tiene claves locales, el payload sale con
   **`stars: 0` y `stats: { eventos: [], uso: {} }`**.
5. Ese POST **borra el historial de `beto` en el servidor**.
6. Recién después corre el GET, que devuelve la fila ya vaciada.

**Resultado:** cambiar de usuario destruye el informe del usuario que entra y pierde
el último tramo del usuario que sale. Es un bug de pérdida de datos, no cosmético.

---

### 🔴 BUG-03 — `collectPayload()` siempre manda `stars` y `stats`, aunque no haya nada local

**Archivos:** `lib/sync.ts` (`collectPayload`) + `app/api/datos/route.ts` (POST).

```ts
payload.stars = parseInt(localStorage.getItem(`tablele.stars_${username}`) || "0") || 0;
try {
  payload.stats = { eventos: JSON.parse(... || "[]"), uso: JSON.parse(... || "{}") };
} catch { payload.stats = { eventos: [], uso: {} }; }
```

`config` se omite si no existe (bien), pero **`stars` y `stats` siempre viajan**, con
`0` y vacío como valor por defecto. Y el server los escribe sin preguntar:

```ts
if (typeof body.stars === "number") row.stars = ...;   // 0 es number → pisa
if (body.stats !== undefined && body.stats !== null) row.stats = body.stats;  // {} pisa
```

Cualquier push disparado **antes** de que el usuario esté hidratado desde el servidor
(o desde un dispositivo nuevo, o tras limpiar el navegador) **vacía la fila remota**.
Combinado con BUG-02 se dispara en cada cambio de usuario.

---

### 🟠 BUG-04 — `userKey()` cae a una clave compartida sin usuario, y no hay guardia de sesión

**Archivos:** `lib/storage.ts`, `app/config/page.tsx`, `app/config/informe/page.tsx`.

```ts
return session?.username ? `${base}_${session.username}` : base;   // ← "tablele.config" pelado
```

`/config` y `/config/informe` **no redirigen si no hay sesión**:

```ts
const s = getSessionData();
(async () => {
  if (s) await syncFromServer(s.username);
  setConfig(getConfig());      // ← sin sesión lee/escribe la clave compartida
})();
```

Si se abre `/config` sin sesión (link directo, PWA que restauró la última URL, o
después de un "Salir"), la configuración se **lee y se guarda en el bucket global**,
que no es de nadie… hasta que interviene BUG-05.

---

### 🟠 BUG-05 — Migración legacy hardcodeada al usuario `manu`, y corre en cada carga

**Archivo:** `lib/storage.ts`, líneas 33–45 (nivel de módulo).

```ts
if (typeof window !== "undefined") {
  const bases = ["tablele.config", "tablele.stars", ...];
  bases.forEach(base => {
    const legacy = localStorage.getItem(base);
    if (legacy !== null) {
      const manuKey = `${base}_manu`;          // ← username hardcodeado
      if (localStorage.getItem(manuKey) === null) localStorage.setItem(manuKey, legacy);
      localStorage.removeItem(base);
    }
  });
}
```

Efecto combinado con BUG-04: **todo lo que se escriba sin sesión termina siendo del
usuario `manu`** en la siguiente carga de página. Ese es el único camino en el código
por el que la config de un usuario **salta a otro usuario** de verdad, y explica el
síntoma "entro con uno nuevo y me quedan palabras que ya había usado" cuando el usuario
nuevo se llama `manu` o cuando el bucket global quedó contaminado.

Además el bloque corre a nivel de módulo (side effect en el import), lo que lo hace
imposible de testear y lo ejecuta en cada page load.

---

### 🟠 BUG-06 — El pull sobrescribe siempre; no hay merge ni detección de "local más nuevo"

**Archivo:** `lib/sync.ts`, `syncFromServer()`.

```ts
if (config) localStorage.setItem(`tablele.config_${username}`, JSON.stringify(config));
if (typeof stars === "number") localStorage.setItem(...);
if (stats && typeof stats === "object") { ... }   // pisa eventos y uso enteros
```

No hay `updated_at` comparado, ni flag de "sucio local", ni merge de eventos. Cualquier
push que no haya llegado (offline, error de Supabase, BUG-01) se pierde definitivamente
en el próximo `syncFromServer()`, que corre en el montaje de **tres** pantallas.
El comentario del código dice "push antes de pull para no pisar cambios locales", pero
si el push falla, el pull pisa igual.

---

### 🟡 BUG-07 — `sendBeacon` tiene el mismo límite de 64 KiB y su resultado se ignora

**Archivo:** `lib/sync.ts`, `flushBeacon()`.

```ts
navigator.sendBeacon("/api/datos", new Blob([...]));   // devuelve false si no entra en la cuota
```

`sendBeacon` comparte la cuota de 64 KiB y **devuelve `false`** cuando el payload no
entra. El código no mira el retorno y además ya limpió `pushTimer`, así que el push
pendiente se descarta. En tablet —donde nadie "cierra" la app y el `pagehide` es la vía
habitual de guardado— esto es una pérdida de datos frecuente.

---

### 🟡 BUG-08 — Los errores del servidor son invisibles para el adulto

- `pushNow()` y `flushPush()`: `catch {}` vacío, sin mirar `res.ok` ni el body.
- `/api/datos` POST devuelve `{ ok:false, sbStatus, sbError }` con **HTTP 200** cuando
  Supabase falla → ni siquiera un `res.ok` lo detectaría.
- `handleSave()` en `/config` navega a `/jugar` como si hubiera guardado, pase lo que pase.

El adulto no tiene forma de saber que sus cambios no se guardaron.

---

### 🟡 BUG-09 — `PALABRAS_DEFAULT` se devuelve por referencia

**Archivos:** `lib/storage.ts` (`getConfig`), `app/config/page.tsx` (`handleRestore`).

```ts
return { ..., palabras: PALABRAS_DEFAULT };          // misma instancia del módulo
const newConfig = { ...config!, palabras: PALABRAS_DEFAULT };
```

Hoy no se rompe porque toda la UI usa `.map()` inmutable, pero es una **bomba de tiempo
exactamente del tipo del síntoma reportado**: una sola mutación in-place (`p.usar = x`)
en cualquier código futuro contamina el default del módulo para toda la sesión del
navegador, y el "usuario nuevo" arranca con las palabras del anterior.

---

### 🟡 BUG-10 — Un typo en el username crea un usuario nuevo en silencio

`/api/acceso` hace upsert sin distinguir alta de acceso, y la UI dice
*"Si el usuario no existe, se crea automáticamente"*. No hay listado de usuarios ni
selector. `ana` vs `anna` vs `ana_` son tres chicos distintos, con tres informes
distintos, y nadie se entera.

---

### 🟡 BUG-11 — Al cerrar sesión no se flushea ni se limpia nada

**Archivo:** `app/config/page.tsx`, `handleLogout()`.

```ts
const handleLogout = () => { clearSessionData(); router.push("/"); };
```

- No hace `await flushPush()` → se pierde lo pendiente (ver BUG-02, paso 2).
- No limpia los datos locales del usuario saliente → en una tablet compartida quedan
  los eventos y las fotos de todos los chicos en el mismo navegador.
- No resetea el estado de módulo de `lib/sync.ts` (`pushTimer`), que es global y
  sobrevive al cambio de usuario.

---

### 🔵 Observaciones menores

| # | Detalle |
|---|---|
| m1 | `/api/datos` acota `stars` a 0..20 pero el cliente usa `GOAL = 5` (residuo del esquema viejo). |
| m2 | `getStars()` hace `Math.min(parseInt(...), GOAL)`: con un valor corrupto devuelve `NaN`. Falta `|| 0`. |
| m3 | `clearMetricas()` borra `eventos`/`uso`/`stats` pero **no** `stars` ni `lastPlayed`. |
| m4 | `tablele.stats` sigue en la lista de claves a borrar aunque ya nunca se escribe (residuo). |
| m5 | El input de login acepta acentos (`ana peña` → `anapeña`) y después el regex del server lo rechaza con un mensaje genérico. Conviene normalizar en el cliente (quitar diacríticos) o explicitar el error. |
| m6 | `recordEvento()` dispara `schedulePush()` en **cada** intento; con debounce de 600 ms una ronda rápida igual serializa 2000 eventos varias veces por minuto. |
| m7 | Sin auth: `GET /api/datos?username=x` devuelve los datos de cualquier chico con solo adivinar el nombre, usando la `service_role` key. Ver §5. |

---

## 3. Los arreglos

### FIX-01 — Partir el payload y sacar `keepalive` (resuelve BUG-01, BUG-07)

**Regla:** `keepalive` solo para payloads chicos y garantizados < 64 KiB.
El informe (`stats`) viaja en un POST normal.

`lib/sync.ts`:

```ts
const KEEPALIVE_MAX = 60 * 1024;   // margen bajo el límite de 64 KiB del estándar

async function postDatos(payload: unknown, opts: { keepalive?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const usarKeepalive = !!opts.keepalive && body.length <= KEEPALIVE_MAX;
  const res = await fetch("/api/datos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: usarKeepalive,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(`push falló: ${res.status} ${JSON.stringify(json)}`);
  }
}
```

Y en `flushBeacon()`, chequear tamaño y retorno:

```ts
const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
if (blob.size > KEEPALIVE_MAX || !navigator.sendBeacon("/api/datos", blob)) {
  // no entró en la cuota: NO limpiar el pendiente, se reintenta en la próxima carga
  marcarPendiente(username);
}
```

> **Criterio de aceptación:** con un usuario que tenga 2000 eventos en localStorage,
> tocar Guardar en `/config` debe producir un POST 200 visible en DevTools → Network,
> y al volver a `/jugar` las palabras deben ser las nuevas.

---

### FIX-02 — Atar cada push a su username y flushear ANTES de cambiar de sesión (resuelve BUG-02)

`lib/sync.ts` — el pendiente pasa a ser un objeto con dueño:

```ts
type Pendiente = { username: string; config: boolean; stars: boolean; stats: boolean };
let pendiente: Pendiente | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePush(parte: "config" | "stars" | "stats") {
  if (typeof window === "undefined") return;
  const username = getUsername();
  if (!username) return;

  // Si había algo pendiente de OTRO usuario, se manda ya bajo SU nombre.
  if (pendiente && pendiente.username !== username) {
    const anterior = pendiente;
    pendiente = null;
    void pushNow(anterior);
  }

  pendiente = pendiente ?? { username, config: false, stars: false, stats: false };
  pendiente[parte] = true;

  installFlush();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const p = pendiente; pendiente = null; pushTimer = null; void pushNow(p); }, 600);
}
```

`pushNow(p)` recibe el pendiente **con su username** y arma el payload sólo con las
partes marcadas como sucias.

Añadir una función explícita para el logout:

```ts
/** Sube lo pendiente y resetea el estado del módulo. Llamar ANTES de clearSessionData(). */
export async function cerrarSesionSync(): Promise<void> {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  const p = pendiente; pendiente = null;
  if (p) { try { await pushNow(p); } catch {} }
}
```

`app/config/page.tsx`:

```ts
const handleLogout = async () => {
  await cerrarSesionSync();     // ← sube lo del chico que sale, con SU username
  clearSessionData();
  router.push("/");
};
```

Y en `syncFromServer()`, **eliminar el flush implícito**: ya no hace falta, y era el
que atribuía el push al usuario equivocado.

---

### FIX-03 — Nunca pushear partes no hidratadas (resuelve BUG-03)

Dos capas:

**Cliente** — `collectPayload()` solo incluye lo que existe y está marcado sucio:

```ts
function collectPayload(p: Pendiente) {
  const { username } = p;
  const payload: Record<string, unknown> = { username };

  if (p.config) {
    const raw = localStorage.getItem(`tablele.config_${username}`);
    if (raw) payload.config = JSON.parse(raw);
  }
  if (p.stars) {
    const raw = localStorage.getItem(`tablele.stars_${username}`);
    if (raw !== null) payload.stars = parseInt(raw) || 0;
  }
  if (p.stats && estaHidratado(username)) {          // ← clave
    payload.stats = {
      eventos: JSON.parse(localStorage.getItem(`tablele.eventos_${username}`) || "[]"),
      uso: JSON.parse(localStorage.getItem(`tablele.uso_${username}`) || "{}"),
    };
  }
  return payload;
}
```

`estaHidratado(username)` = existe `tablele.sync_<username>` (se escribe al final de
un `syncFromServer()` exitoso, con el `updated_at` que devolvió el server). Mientras un
usuario no haya sido bajado del servidor en este navegador, **no se le sube el informe**.

**Servidor** — `app/api/datos/route.ts`, defensa en profundidad: no aceptar un `stats`
que borre historial existente sin marca explícita.

```ts
// Rechazar un stats vacío si la fila ya tiene eventos, salvo body.forzarBorrado === true
if (body.stats && !body.forzarBorrado) {
  const nuevos = Array.isArray(body.stats.eventos) ? body.stats.eventos.length : 0;
  if (nuevos === 0) delete row.stats;   // no pisar con vacío
}
```

`clearMetricas()` (el botón "Borrar historial" con candado adulto) es el único que
manda `forzarBorrado: true`.

Además exponer `updated_at` en el `select` del GET, para FIX-06.

---

### FIX-04 — Guardia de sesión y `userKey()` sin fallback (resuelve BUG-04)

`lib/storage.ts`:

```ts
function userKey(base: string): string | null {
  const session = getSessionData();
  return session?.username ? `${base}_${session.username}` : null;
}
```

Todos los getters devuelven el default cuando `userKey()` es `null`; **todos los setters
hacen `return` sin escribir** (y opcionalmente `console.warn` en dev). Nunca más se
escribe en una clave compartida.

`app/config/page.tsx` y `app/config/informe/page.tsx` — guardia igual a la de `/jugar`:

```ts
useEffect(() => {
  const s = getSessionData();
  if (!s) { router.replace("/"); return; }
  (async () => { await syncFromServer(s.username); setConfig(getConfig()); })();
}, [router]);
```

---

### FIX-05 — Sacar la migración `_manu` (resuelve BUG-05)

Borrar el bloque de nivel de módulo de `lib/storage.ts` (líneas 33–45). Ya cumplió su
función y hoy solo hace daño. Si se quiere conservar la compatibilidad, convertirlo en
una función explícita que reciba el username y se llame **una sola vez desde el login**:

```ts
/** Adopta las claves legacy sin sufijo para el primer usuario que entre. Idempotente. */
export function migrarLegacy(username: string) {
  const flag = "tablele.migradoLegacy";
  if (localStorage.getItem(flag)) return;
  const bases = ["tablele.config", "tablele.stars", "tablele.lastPlayed", "tablele.eventos", "tablele.uso"];
  for (const base of bases) {
    const legacy = localStorage.getItem(base);
    if (legacy === null) continue;
    if (localStorage.getItem(`${base}_${username}`) === null) {
      localStorage.setItem(`${base}_${username}`, legacy);
    }
    localStorage.removeItem(base);
  }
  localStorage.setItem(flag, "1");
}
```

Aparte, **script de limpieza única** para las instalaciones ya contaminadas: si existe
`tablele.config_manu` y el usuario nunca fue `manu`, no tocarlo pero sí borrar cualquier
clave sin sufijo remanente.

---

### FIX-06 — Merge en el pull en vez de sobrescritura ciega (resuelve BUG-06)

`syncFromServer()`:

1. **`config` / `stars`:** comparar `updated_at` del servidor contra
   `tablele.dirtyAt_<user>` (timestamp de la última escritura local no confirmada).
   Si el local es más nuevo → **no pisar**, y encolar un push en su lugar.
2. **`eventos`:** unir en vez de reemplazar. Los eventos son append-only, así que el
   merge es trivial una vez que tengan identidad:

```ts
// data/palabras-default.ts / lib/storage.ts — agregar id de cliente al Evento
export type Evento = {
  id: string;      // ← nuevo: crypto.randomUUID() al registrar
  t: number; juego: string; palabra: string; elegida: string;
  ok: boolean; intento: number; ms: number; ayuda: boolean;
};

function mergeEventos(local: Evento[], remoto: Evento[]): Evento[] {
  const map = new Map<string, Evento>();
  for (const e of [...remoto, ...local]) map.set(e.id ?? `${e.t}|${e.juego}|${e.palabra}|${e.intento}`, e);
  return [...map.values()].sort((a, b) => a.t - b.t).slice(-MAX_EVENTOS);
}
```

3. **`uso`:** merge por día tomando el **máximo** de cada fecha (`Math.max(local[d], remoto[d])`),
   no la suma, para no duplicar al sincronizar dos veces.

Al terminar bien, escribir `tablele.sync_<user> = updated_at` y limpiar `dirtyAt`.

> Esto es lo que hace que el offline y los dos dispositivos dejen de perder datos.
> Es el fix más grande de la lista; si hay que dividir el trabajo, va en un segundo PR
> después de FIX-01…FIX-05.

---

### FIX-07 — Que los errores se vean (resuelve BUG-08)

- `/api/datos`: devolver el **status HTTP real** (500/502) cuando Supabase falla, no 200 con `ok:false`.
- `postDatos()` lanza en error (ya en FIX-01); `flushPush()` propaga.
- `handleSave()` en `/config`:

```ts
const handleSave = async () => {
  if (!config) return;
  saveConfig(config);
  try {
    await flushPush();
    router.push("/jugar");
  } catch {
    setAviso("Se guardó en este dispositivo, pero no se pudo sincronizar con el servidor. Revisá la conexión.");
  }
};
```

El texto importa: los datos **sí** quedaron locales, hay que decirlo así y no asustar.

---

### FIX-08 — Copia defensiva del default (resuelve BUG-09)

`data/palabras-default.ts`:

```ts
export const PALABRAS_DEFAULT: readonly PalabraDefault[] = Object.freeze([...]);
export const palabrasDefault = (): PalabraDefault[] =>
  PALABRAS_DEFAULT.map(p => ({ ...p }));
```

Usar `palabrasDefault()` en `getConfig()` y en `handleRestore()`. `Object.freeze` hace
que cualquier mutación futura explote en desarrollo en vez de contaminar en silencio.

---

### FIX-09 — Alta explícita y selector de usuarios (resuelve BUG-10)

Mínimo viable, sin backend nuevo:

1. `POST /api/acceso` acepta `{ username, crear?: boolean }`.
   - Sin `crear`: si el username **no existe**, devolver
     `{ ok:false, existe:false, message:"No existe el usuario «ana». ¿Querés crearlo?" }`.
   - Con `crear: true`: hace el upsert como hoy.
2. La UI de login muestra ese mensaje con un botón **"Crear usuario nuevo"**.
3. Guardar en `localStorage["tablele.usuarios"]` la lista de usuarios que ya entraron en
   ese dispositivo y mostrarlos como chips debajo del input, para que el adulto no tenga
   que tipear. (Es una conveniencia local, no una lista global — no filtra datos de otros.)

Esto elimina la creación accidental por typo, que es la otra manera de "perder" un informe.

---

### FIX-10 — Higiene del cambio de usuario (resuelve BUG-11)

Además de `cerrarSesionSync()` (FIX-02):

```ts
export function limpiarDatosLocales(username: string) {
  ["tablele.config", "tablele.stars", "tablele.lastPlayed",
   "tablele.eventos", "tablele.uso", "tablele.sync", "tablele.dirtyAt"]
    .forEach(b => localStorage.removeItem(`${b}_${username}`));
}
```

Ofrecerlo en el diálogo de "Salir" como opción **"Salir y borrar los datos de este
dispositivo"** (útil en tablet compartida / consultorio), no como comportamiento
automático: borrar sin avisar cuando el push falló sería pérdida de datos.

---

### FIX-11 — Menores

| Fix | Acción |
|---|---|
| m1 | En `/api/datos`, acotar `stars` a `0..5` con una constante compartida (`GOAL`), o dejar de acotar y validar en el cliente. |
| m2 | `getStars()`: `const n = parseInt(...); return Number.isFinite(n) ? Math.min(n, GOAL) : 0;` |
| m3 | `clearMetricas()` debe borrar también `stars` y `lastPlayed` (el candado adulto dice "Borrar todo el historial"). |
| m4 | Eliminar `tablele.stats` de la lista de claves. |
| m5 | Normalizar el username en el cliente: `.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9_]/g,"")` y mostrar el error real. |
| m6 | `recordEvento()`: subir el debounce del push de eventos a ~3 s (dejar 600 ms solo para `config`/`stars`). |

---

## 4. Plan de trabajo sugerido para Antigravity

**PR 1 — "Sync: dejar de perder datos" (bloqueante, resuelve los 3 síntomas)**
FIX-01, FIX-02, FIX-03, FIX-04, FIX-05, FIX-07, FIX-08.
Todo dentro de `lib/sync.ts`, `lib/storage.ts`, `app/api/datos/route.ts`,
`app/config/page.tsx`, `app/config/informe/page.tsx`. Sin cambios de esquema.

**PR 2 — "Sync incremental y merge"**
FIX-06 (incluye agregar `id` al `Evento` y la migración de los eventos ya guardados,
que se pueden identificar por `${t}|${juego}|${palabra}|${intento}`).

**PR 3 — "Alta explícita de usuarios"**
FIX-09, FIX-10, FIX-11.

---

## 5. Fuera de alcance pero hay que decirlo: no hay autenticación

`GET /api/datos?username=ana` devuelve la config y el informe completo de `ana` a
cualquiera que adivine el nombre, y el POST permite sobrescribirlos. El servidor usa la
`SUPABASE_SERVICE_ROLE_KEY`, que **bypassea Row Level Security**, con el username como
única credencial. Con datos de chicos —nombre, fotos reales de su casa subidas a un
bucket **público**, métricas de desempeño— esto no debería llegar a un uso real fuera
de una demo.

Camino mínimo, en orden de esfuerzo creciente:

1. **PIN de 4 dígitos por usuario** (hash en la tabla), pedido solo en el alta y en el
   primer acceso de cada dispositivo. Resuelve el 90% del riesgo con un día de trabajo.
2. **Bucket de fotos privado** + URLs firmadas con expiración, en vez de público.
3. **Supabase Auth + RLS** con login real del adulto y "modo casa" por enlace/código
   para el chico — que es exactamente lo que ya propone la spec del proyecto nuevo
   (ver `TABLELE-tecnico-funcional.md` §3 y §7.2).

---

## 6. Cómo verificar que quedó arreglado

Checklist de pruebas manuales, en este orden:

1. **Aislamiento en alta.** Con `ana` configurada con palabras propias, salir y entrar
   como `beto` (nuevo) → `/config` debe mostrar **las 27 palabras por defecto**.
2. **Guardado con historial grande.** Inyectar 2000 eventos falsos en
   `tablele.eventos_ana`, editar una palabra, Guardar, volver a `/jugar` y reentrar a
   `/config` → **la palabra editada sigue ahí** (antes volvía a la anterior).
   El POST a `/api/datos` debe verse 200 en Network.
3. **Cambio de usuario con push pendiente.** Jugar con `ana` una ronda, salir
   inmediatamente y entrar como `beto` → el informe de `beto` **no** debe quedar vacío,
   y el de `ana` debe incluir esa última ronda al volver a entrar.
4. **Persistencia cruzada de dispositivo.** Configurar `ana` en el navegador A, entrar
   como `ana` en el navegador B (perfil limpio) → deben aparecer las palabras del A y
   el informe del A.
5. **Offline.** Modo avión → editar palabras → Guardar → debe avisar que no sincronizó
   pero conservar el cambio local; al volver la conexión y reentrar, el cambio debe
   subir y **no** ser pisado por la versión vieja del servidor.
6. **Sin sesión.** Abrir `/config` directo en una pestaña limpia → debe redirigir a `/`,
   y no debe quedar ninguna clave `tablele.*` sin sufijo de usuario en localStorage.
7. **Borrar historial.** Candado adulto → borrar → el informe queda vacío local **y** en
   el servidor, y al reentrar sigue vacío (no "revive" desde el server).

Automático, antes de las pruebas manuales:

```bash
cd web && npm test
#  OK — 37/37 casos de silabeo
#  OK — 24/24 casos de datos/usuarios     (merge de eventos/uso, normalización de usernames)
#  OK — 28/28 casos de manejo de usuarios (aislamiento, atribución de pushes, pull sin pisar)
```

`lib/sync.run-tests.ts` reproduce con stubs de `localStorage` y `fetch` cada uno de
los escenarios de arriba: los puntos 1, 2, 3, 5, 6 y 7 de esta lista tienen su caso
correspondiente. Los casos están numerados con el mismo BUG-xx de §2, así que si
alguno vuelve a fallar, sabés exactamente qué regresión es.
