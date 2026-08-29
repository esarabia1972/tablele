# Tablele — Cuentas: un adulto, varios chicos

> Base: `2f1feb2` (v0.9.2, ya desplegado). Decisiones: sin PIN, un chico por cuenta.
> Estado: **implementado** en la rama `feat/cuentas` (v0.10.0).

## ✅ Estado

| Sección | Estado | Dónde |
|---|---|---|
| §3 Esquema (`accounts`, `account_id`, PK compuesta) | ✅ hecho por Esteban en Supabase | — |
| §4 Migración de datos (`manuel` borrado, `manu` a Leticia) | ✅ hecho por Esteban | — |
| §5 Fotos con la cuenta en el path | ✅ | `app/api/foto/route.ts` |
| §6.1 `POST /api/cuenta` | ✅ | `app/api/cuenta/route.ts` |
| §6.2–6.4 `accountId` en acceso / datos / foto | ✅ | `app/api/*/route.ts`, `lib/supabase.ts` (nuevo) |
| §6.5 `EMAIL_RE`, `ACCOUNT_ID_RE`, `normalizarEmail` | ✅ | `lib/claves.ts` |
| §7 Cliente por `(cuenta, chico)` + migración de dispositivo | ✅ | `lib/storage.ts`, `lib/sync.ts` |
| §8 Login en dos pasos, alta de un campo, cambiar de cuenta | ✅ | `app/page.tsx`, `app/config/page.tsx` |
| §11 Tests | ✅ 116 casos (`npm test`) | `lib/*.run-tests.ts` |
| §9 PIN / auth | ⛔ fuera de alcance, por decisión | `accounts.pin_hash` creado y vacío |

Dos cosas que aparecieron al implementar y no estaban en la spec:

- **`lib/supabase.ts`** (nuevo): la URL, las cabeceras y el manejo de errores de
  Supabase estaban copiados en las tres rutas. Con una cuarta ruta era momento de
  centralizarlos. `SupabaseError` lleva el status real, que es lo que permite
  devolver 502 en vez de un 200 mentiroso.
- **`salirDeCuenta()` recorre localStorage con `key(i)`/`length`**, no con
  `Object.keys(localStorage)`. Lo encontró un test: `Object.keys` sobre `Storage`
  depende de que las claves sean enumerables, y no es la API que hay que usar.

---

## 1. Qué problema resuelve

Hoy el nombre del chico es una **identidad global**: `manu` es `manu` para toda
la app, y quien escriba ese nombre entra a esos datos. Eso produce tres cosas
que ya pasaron o van a pasar:

- **Colisión de nombres.** Dos chicos que se llaman Agus no pueden convivir.
  Ya se vio en chico: `manu` y `manuel` terminaron siendo el mismo chico con
  dos filas, porque la única forma de "separar" era inventar otro nombre.
- **Sin dueño.** Nada dice de quién es un chico. No se puede listar "los
  pacientes de Leti", ni entregarle la app a otro profesional sin mezclarlo todo.
- **El adulto tiene que recordar nombres exactos.** Un typo entra a otro lado
  o crea un chico nuevo.

La cuenta arriba convierte el nombre del chico en lo que siempre debió ser: una
**etiqueta local**, única sólo dentro de una cuenta.

Es la limitación que el técnico-funcional marca como la más grande (§7.4).

---

## 2. Decisiones tomadas

| Decisión | Elegido | Consecuencia |
|---|---|---|
| Cómo se valida el adulto | **Sólo la lista de autorizados.** El mail tiene que existir en `accounts`. Sin PIN ni contraseña. | Ver §9: riesgo aceptado, y cómo queda preparado para cerrarlo. |
| Un chico en varias cuentas | **No.** Cada chico pertenece a una cuenta. | `account_id` como columna, sin tabla de vínculo. Si más adelante hace falta compartir, se agrega sin romper nada. |
| Identidad de la cuenta | **`account_id` (uuid)**, no el mail. | El mail pasa a ser un atributo cambiable. Cambiar de correo no obliga a reescribir filas. |

---

## 3. Modelo de datos

### 3.1. Tabla nueva: `accounts`

```sql
create extension if not exists citext;

create table accounts (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null unique,          -- citext: Mail@x = mail@x
  nombre     text,                            -- "Esteban", "Leticia" (para saludar)
  pin_hash   text,                            -- SIN USO todavía. Ver §9.
  activo     boolean not null default true,   -- dar de baja sin borrar
  created_at timestamptz not null default now()
);
```

`pin_hash` y `activo` se crean ahora aunque no se usen: agregar una columna
después obliga a una migración con la app en producción, y crearla vacía no
cuesta nada. `activo = false` es la forma de sacar a alguien sin perder sus
chicos.

### 3.2. Tabla existente: `tablele_datos`

```sql
alter table tablele_datos add column account_id uuid references accounts(id);

-- ANTES de crear el unique nuevo: asignar lo que ya existe (ver §4)

alter table tablele_datos alter column account_id set not null;
alter table tablele_datos drop constraint tablele_datos_pkey;      -- era (username)
alter table tablele_datos add primary key (account_id, username);
```

Queda:

| Columna | Tipo | Notas |
|---|---|---|
| `account_id` | uuid, FK → accounts.id | **nuevo** |
| `username` | text | ya no es único global |
| `config` | jsonb | sin cambios |
| `stars` | numeric | sin cambios |
| `stats` | jsonb | sin cambios |
| `updated_at` | timestamptz | sin cambios |
| | | **PK (account_id, username)** |

Nada de la lógica de sincronización cambia: sigue siendo una fila por chico,
sólo que ahora la fila se direcciona con dos valores en vez de uno.

### 3.3. Semillas iniciales

```sql
insert into accounts (email, nombre) values
  ('letialberti@hotmail.com', 'Leticia'),
  ('esteban@sarabia.com',     'Esteban');
  -- agregar acá los que hagan falta
```

> `manu`, el único chico que existe hoy, **es de la cuenta de Leticia** — no de
> la de Esteban. Ver §4.
>
> El mail de Esteban es `esteban@sarabia.com` (con b), no `esarabia@q4tech.com`,
> que es la cuenta de trabajo y no va acá.

**Por qué una tabla y no una variable de entorno.** Para tres correos,
`ADULTOS_AUTORIZADOS=a@x,b@y` en Vercel sería más barato. Pero sin tabla no hay
`account_id`, y las filas de `tablele_datos` tendrían que colgar del texto del
mail — justo la fragilidad que §2 evita. La tabla además permite dar de baja a
alguien (`activo`) y sumar profesionales con un `insert`, sin deploy.

---

## 4. Migración de lo que ya existe

Hay **una** fila viva (`manu`, de la cuenta de Leticia) y, si todavía no se
borró, `manuel`.

```sql
-- 1. Borrar el duplicado, si sigue estando (39 eventos de una prueba de 4 min)
delete from tablele_datos where username = 'manuel';

-- 2. Asignar lo que queda a su cuenta.
--    OJO: manu es de Leticia, no de Esteban.
update tablele_datos
   set account_id = (select id from accounts where email = 'letialberti@hotmail.com')
 where username = 'manu';

-- Verificar que no quedó nada suelto antes del paso 3
select username, account_id from tablele_datos where account_id is null;

-- 3. Recién ahora, el not null y la PK nueva de §3.2
```

**Backup previo obligatorio.** Ya existe el export `tablele_datos_rows.json`
con las dos filas; regenerarlo antes de tocar nada.

---

## 5. Fotos (Supabase Storage)

Hoy el path es `fotos/${username}/<timestamp>-<rand>.jpg` en un bucket
**público**. Con dos Manu de dos cuentas distintas, los paths se pisan.

**Cambio:** `fotos/${account_id}/${username}/<timestamp>-<rand>.jpg`.

Las 3 fotos existentes de Manu (kiosco, manuel, papá) están referenciadas por
URL absoluta dentro de su `config`, así que **siguen funcionando sin tocarlas**.
Se pueden mover después, o dejarlas donde están: el path viejo no colisiona con
el nuevo esquema porque el nuevo siempre empieza con un uuid.

> Aparte y fuera del alcance de esta spec: el bucket es público. Son fotos de la
> casa de chicos accesibles por URL a cualquiera que la tenga. Vale hacerlo
> privado con URLs firmadas, pero es un trabajo aparte con su propia migración.

---

## 6. API

### 6.1. `POST /api/cuenta` — nuevo

Valida el mail del adulto y devuelve sus chicos.

```jsonc
// request
{ "email": "esteban@sarabia.com" }

// 200 — cuenta válida
{
  "ok": true,
  "account": { "id": "uuid", "nombre": "Esteban" },
  "chicos": ["manu", "agus"]          // usernames de esa cuenta, ordenados
}

// 200 — no autorizada (mismo shape que el resto de la app)
{ "ok": false, "motivo": "no-autorizada",
  "message": "Ese correo no está habilitado todavía." }

// 502 — Supabase caído
{ "ok": false, "motivo": "storage", "sbStatus": 500, "sbError": "..." }
```

Notas:
- **Nunca** devolver el `account_id` de una cuenta inexistente ni distinguir
  "no existe" de "inactiva": un solo mensaje para los dos casos.
- El `id` viaja al cliente porque es la clave de todo lo demás. Es un uuid, no
  un secreto — pero tampoco es adivinable, que es más de lo que hay hoy.

### 6.2. `POST /api/acceso` — cambia

Pasa a recibir la cuenta. Mantiene el alta en dos pasos que ya existe.

```jsonc
{ "accountId": "uuid", "username": "manu", "crear": false }
```

- Valida que `accountId` exista y esté activo. Si no: `403`.
- Busca `(account_id, username)`. Si existe → `{ ok: true, username }`.
- Si no existe y `crear` es falso → `{ ok:false, motivo:"no-existe", ... }`.
- Si `crear` es verdadero → inserta con `on_conflict=account_id,username`.
- **Nuevo error:** si ya hay un chico con ese nombre en esa cuenta, el alta no
  puede pisarlo. El upsert por PK lo evita solo, pero el mensaje importa
  (ver §8).

### 6.3. `GET|POST /api/datos` — cambia

Todas las consultas pasan a filtrar por los dos campos:

```
GET  /api/datos?accountId=<uuid>&username=manu
POST /api/datos   body: { accountId, username, config?, stars?, stats?, forzarBorrado? }
```

- `?account_id=eq.<uuid>&username=eq.<u>` en el filtro de PostgREST.
- El upsert pasa a `?on_conflict=account_id,username`.
- **Todo lo demás queda igual**: updates parciales, merge server-side del
  informe, `forzarBorrado`, status HTTP real. Esa lógica no se toca.

### 6.4. `POST /api/foto` — cambia

Recibe `accountId` además de `username`, valida que el chico pertenezca a esa
cuenta, y arma el path nuevo de §5.

### 6.5. Validación compartida

`USERNAME_RE` sigue igual (`/^[a-z0-9_]{3,20}$/`). Se agrega en `lib/claves.ts`:

```ts
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizarEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
```

Toda ruta que reciba un `accountId` lo valida contra `ACCOUNT_ID_RE` **antes**
de mandarlo a PostgREST.

---

## 7. Cliente

### 7.1. Sesión

```ts
// tablele.session
{ accountId: string; email: string; nombreCuenta?: string; username: string }
```

Se agrega una clave nueva, independiente de la sesión, que sobrevive al
"Salir": es la que hace que el chico pueda entrar solo (§8).

```ts
// tablele.cuenta  — la cuenta validada en ESTE dispositivo
{ accountId: string; email: string; nombre?: string }
```

### 7.2. Claves por chico

`claveDe()` pasa a llevar los dos valores:

```ts
export function claveDe(base: string, accountId: string, username: string): string {
  return `${base}_${accountId}_${username}`;
}
```

Todo lo que hoy resuelve la clave a partir de la sesión (`userKey()` en
`storage.ts`, `collectPayload()` y `syncFromServer()` en `sync.ts`) toma
`accountId` del mismo lugar de donde ya toma `username`. **La forma de los
módulos no cambia**, sólo se agrega un valor al par.

Los cuatro invariantes del fix anterior siguen valiendo tal cual, ahora por
`(cuenta, chico)` en vez de por `chico`:

1. Un push pertenece al chico que lo generó (username **y** cuenta capturados
   al programarlo).
2. Un dispositivo que no bajó la fila de ese chico no le sube nada.
3. Ningún payload con `keepalive`/`sendBeacon` pasa los 64 KiB.
4. El informe se fusiona, nunca se sobrescribe.

### 7.3. Migración de dispositivo

Igual que la anterior, con su propio flag (`tablele.migradoCuentas`), y corre
en `/jugar` cuando ya hay sesión:

```
tablele.config_manu   →   tablele.config_<accountId>_manu
```

Se adopta para la cuenta que acaba de validarse. **No borra**: archiva en
`tablele.legacy2.*`, igual que la migración anterior.

Caso a cubrir: un dispositivo que llega con sesión vieja (sin `accountId`).
`getSessionData()` debe devolver `null` si falta `accountId`, para que caiga al
login y valide la cuenta primero — como ya se hace con las sesiones por email
de la versión más vieja.

### 7.4. Lista de chicos

`tablele.usuarios` (las pills de hoy, guardadas por dispositivo) **se elimina**.
Los chicos ahora los devuelve `/api/cuenta`, que es la fuente de verdad y
funciona en cualquier dispositivo. Se puede cachear la última respuesta para
que el login abra instantáneo, pero se refresca en cada validación.

---

## 8. Flujo de pantallas

### 8.1. Login — primera vez en el dispositivo

```
                  ¡A leer! 🚀

            ┌─────────────────────────┐
            │  tu correo              │
            └─────────────────────────┘
            [        Validar          ]
```

- Un solo campo. Sin explicar qué es una cuenta ni quién es un profesional.
- Si el correo no está habilitado:
  *"Ese correo no está habilitado todavía."*
- Si valida: se guarda `tablele.cuenta` y se pasa al paso 2.

### 8.2. Login — con la cuenta ya validada (el caso normal)

Es la pantalla que ve el chico todos los días. **El correo no se vuelve a
pedir.**

```
                  ¡A leer! 🚀
             ¿Quién va a jugar?

           ( manu )  ( agus )  ( + )
```

- Las pills son los chicos de la cuenta. Tocar una entra directo.
- `( + )` abre el alta (§8.3).
- El correo validado **no se muestra en pantalla**: no le aporta nada al chico
  y es dato de un adulto.

### 8.3. Alta de un chico

Un solo campo: el nombre.

```
            ¿Cómo se llama?
            ┌─────────────────────────┐
            │                         │
            └─────────────────────────┘
            [        Empezar          ]
```

- El nombre se normaliza a username con `normalizarUsername()` (minúsculas,
  sin tildes ni espacios) y **también** se guarda tal cual en `config.nombre`,
  que es lo que usan los mensajes de aliento.
- Si ya existe en esa cuenta:
  *"Ya tenés un Agus. Agregale algo para distinguirlos."*
- Si queda con menos de 3 caracteres útiles:
  *"Poné al menos 3 letras."*

> Esto elimina la duplicación que hay hoy entre `username` y `config.nombre`
> ("manu"/"manu", "manuel"/"Manuel"): el adulto escribe una sola cosa.

### 8.4. Cambiar de cuenta

**No va en el login.** Va en Configuración, junto a "Salir", y conviene
protegerlo con el candado adulto que ya existe en el informe (la suma de dos
dígitos): es una acción rara y confusa si un chico la toca por accidente.

Al cambiar de cuenta se borran `tablele.cuenta` y todas las claves de los chicos
de la cuenta saliente en ese dispositivo — igual que hace hoy "Salir".

### 8.5. Salir (sin cambios de fondo)

Sigue como quedó: sube todo, borra los datos de ese chico en la tablet, vuelve
al login — que ahora muestra las pills, porque la cuenta sigue validada. Y sigue
sin borrar nada si la subida no se confirmó.

---

## 9. Seguridad: qué queda abierto

Decisión tomada: **el único control es que el mail esté en `accounts`.**

Hay que ser explícito sobre lo que eso significa, porque es fácil que suene a
más de lo que es. Un mail es un identificador **público**: cualquiera que lo
conozca —y los mails circulan— entra a la cuenta y ve todos sus chicos, sus
informes y las fotos de sus casas. La lista de autorizados **organiza** quién
tiene chicos; no **autentica** a nadie.

Comparado con hoy la superficie no mejora: antes había que adivinar el nombre
de un chico, ahora hay que conocer un mail. Lo que sí mejora es la
**contención**: quien entra a una cuenta ve sólo los chicos de esa cuenta, no
todos los de la app.

La spec deja el camino abierto sin costo:

- `accounts.pin_hash` ya existe. Cerrar el acceso es: pedir 4 a 6 dígitos junto
  al correo en §8.1, hashear (bcrypt/argon2 server-side), comparar. Sin
  migración de tabla y sin tocar el resto del flujo.
- `accounts.activo` permite cortar el acceso de alguien en el acto.
- El paso siguiente, cuando haya datos de más chicos: Supabase Auth + RLS por
  `account_id`, que es lo que pide la spec del proyecto de lenguaje.

**Recomendación, aunque no sea lo elegido:** activar el PIN antes de que la app
la use alguien que no seas vos o Leti.

---

## 10. Plan de implementación

**Paso 1 — Base de datos.** Backup. `accounts` + semillas. `account_id` en
`tablele_datos`. Borrar `manuel`. Asignar `manu`. PK nueva. Nada de esto toca
la app: con la app vieja corriendo, `account_id` queda ignorado.

**Paso 2 — API.** `/api/cuenta` nuevo. `accountId` en `/api/acceso`,
`/api/datos` y `/api/foto`. `EMAIL_RE`, `ACCOUNT_ID_RE`, `normalizarEmail` en
`lib/claves.ts`.

**Paso 3 — Cliente.** `claveDe()` con los dos valores; propagar `accountId` por
`storage.ts` y `sync.ts`; `tablele.cuenta`; migración de dispositivo.

**Paso 4 — Pantallas.** Login en dos pasos, pills desde la API, alta con un solo
campo, cambiar de cuenta detrás del candado.

**Paso 5 — Tests.** Ver §11.

Los pasos 2 a 4 van juntos en un deploy: el cliente viejo no sabe mandar
`accountId` y el nuevo no funciona sin `/api/cuenta`.

---

## 11. Tests a agregar

En `lib/sync.run-tests.ts`, siguiendo la convención que ya existe:

- Dos chicos con el **mismo nombre** en cuentas distintas no comparten ninguna
  clave de localStorage.
- Cambiar de cuenta no arrastra datos de la cuenta anterior.
- Un push generado con una cuenta no puede subirse bajo otra (el invariante 1
  del fix anterior, ahora con el par completo).
- La migración `tablele.config_manu → tablele.config_<cuenta>_manu` corre una
  sola vez, no pisa un destino existente y archiva el original.
- Una sesión sin `accountId` (formato viejo) se considera inválida.

En `lib/datos.run-tests.ts`:

- `normalizarEmail` y `EMAIL_RE` con mayúsculas, espacios y basura alrededor.
- `claveDe` con dos cuentas y el mismo username.

---

## 12. Casos borde a resolver

| Caso | Qué debe pasar |
|---|---|
| Mail válido pero cuenta `activo = false` | Mismo mensaje que "no habilitado". No revelar que existe. |
| Se valida la cuenta sin internet | No se puede: el login del paso 1 necesita red. Si la cuenta ya está validada en el dispositivo, el paso 2 y el juego funcionan offline como hoy. |
| Dos pestañas con cuentas distintas | `tablele.cuenta` es por dispositivo, así que la última gana. Aceptable: es una tablet, no un escritorio. |
| El adulto se equivoca de cuenta y crea un chico | El alta pide confirmación (ya existe). Además, borrar un chico **no** está en esta spec — hoy no se puede desde la app, y hay que decidirlo aparte. |
| Chico con nombre repetido en la misma cuenta | Lo frena la PK. Mensaje humano (§8.3). |
| Cuenta sin chicos todavía | El paso 2 muestra sólo `( + )` y el texto *"Todavía no hay nadie. Creá el primero."* |

---

## 14. Compartir un chico entre dos adultos — decisión pendiente

**El caso.** Manu entra con el correo de su madre, y además la profesional que lo
atiende necesita entrar para ver el avance y **modificar las palabras**. Hoy no
se puede: un chico pertenece a una sola cuenta (§2).

No se desarrolla ahora. Esto es el análisis, para no tener que rehacerlo.

### 14.1. Opciones

**A. Un segundo correo en la fila del chico** (`account_id_2`).

- 🟢 Cambio mínimo: una columna y una migración.
- 🔴 **Tope duro en dos.** El tercer adulto —padre y madre separados, dos
  terapeutas de una institución, la abuela de los martes— obliga a rehacerlo
  igual, pero ya con datos en producción.
- 🔴 Toda consulta pasa a `account_id=eq.X or account_id_2=eq.X` en las cuatro
  rutas, con peor historia de índices.
- 🔴 Aparece una pregunta que hoy no existe: quién es el dueño. Si la
  profesional deja de atender al chico, sacarla es un `update` con lógica en vez
  de borrar una fila.

**B. Tabla de accesos** `(account_id, nino_id, rol)`.

```sql
ninos     id uuid PK, created_at
accesos   account_id uuid FK, nino_id uuid FK, rol text, PK (account_id, nino_id)
-- tablele_datos pasa a colgar de nino_id en vez de (account_id, username)
```

- 🟢 Sin límite de adultos. Quitar un acceso es un DELETE.
- 🟢 `rol` distingue "ve el informe" de "edita las palabras", que es exactamente
  la diferencia entre una madre y una terapeuta.
- 🔴 El chico necesita un id propio: `username` deja de identificarlo. Se toca el
  cliente entero otra vez, incluidas las claves de localStorage.

**C. Modo casa por enlace o código.** El chico vive en la cuenta de la
profesional, y la familia entra por un enlace por paciente, sin cuenta propia.
Es lo que propone `TABLELE-tecnico-funcional.md` §3 para el proyecto de lenguaje.

**D. Compartir sólo el informe, de sólo lectura.** Mucho más barato, pero no
cubre "modificar las palabras", que es la mitad del pedido.

### 14.2. Mientras tanto: compartir el correo

Decisión operativa de 2026-08-29: **los dos adultos usan el mismo correo.** La
familia de Manu entra con `letialberti@hotmail.com` desde cualquier dispositivo.

Funciona sin tocar nada: el correo es la llave de la cuenta y no está atado a un
dispositivo, y el sync entre dos dispositivos ya está resuelto (los eventos se
fusionan, no se pisan — ver los invariantes de §7.2).

**Vence cuando Leticia cargue su segundo paciente.** A partir de ahí, la familia
de Manu ve el nombre de ese chico en "¿Quién va a jugar?", puede entrar,
cambiarle las palabras y borrarle el historial (el candado adulto es una suma de
dos dígitos). Eso es confidencialidad de pacientes, no una molestia de UX.

### 14.3. Recomendación

**B, y no ahora.** A es una tapa, no un modelo: el trabajo de sostenerla (las
consultas con `or`, la lógica de dueño) es casi el mismo que el de introducir la
tabla, y hay que hacerlo dos veces.

**El disparador es el segundo paciente de Leticia** (ver §14.2), o el primer
chico que necesite dos adultos con permisos distintos — lo que llegue antes.

### 14.4. Lo que hay que resolver ANTES de elegir

**¿De quién es el chico?** La spec de arriba asume que el dueño es quien lo crea.
Pero en terapia la profesional define el vocabulario, la etapa y el nivel, y la
familia ejecuta en casa: ahí el dueño natural es la profesional y el caso es C,
no B. Para Manu, en cambio, el dueño es la familia. **Cuál de los dos es el caso
principal decide el modelo**, y conviene contestarlo con un caso real enfrente.

**El informe compartido miente si no se sabe el contexto.** Dos adultos sobre un
mismo chico comparten el informe, y ese informe mezcla lo que el chico hizo en el
consultorio con lo que hizo en casa. El técnico-funcional ya marca que sesión
controlada y sesión de casa **no se promedian**. Compartir un chico no es sólo un
tema de permisos: obliga a agregar el contexto al `Evento`
(`controlled: boolean`, o de dónde vino la sesión) **en el mismo movimiento**, o
el informe compartido va a dar números que no significan nada.

---

## 13. Fuera de alcance

- Borrar o archivar un chico desde la app.
- Pantalla del adulto con todos sus chicos y sus métricas (el esquema ya lo
  permite; es la continuación natural).
- Bucket de fotos privado con URLs firmadas.
- PIN, magic link, Supabase Auth, RLS.
- Compartir un chico entre dos cuentas (analizado en §14).
