# Tablele Fichas — estrellas y caritas que dan los adultos

> Base: `4a965e0` (v1.0.0). Usa el modelo de `SPEC-cuentas.md` y los roles de `SPEC-tutores.md`.
> Estado: **implementado** en la rama `feat/fichas`. SQL en `web/sql/fichas.sql`.
> Dominio: **fichas.tablele.com.ar**
>
> Diferencias con lo escrito acá, decididas al implementar:
> - Las llamadas de administradora van todas por **POST** con el correo en el
>   cuerpo (nunca en la URL), y se agruparon: `/api/fichas/vinculos` y
>   `/api/fichas/objetivo` reciben `accion`. El login reusa `/api/cuenta` de
>   Tablele tal cual: no hay `/api/fichas/cuenta`.
> - La administradora elige al entrar **cómo la ve el chico** ("Mamá", "Seño
>   Leti"): eso va en `dada_por_nombre`.
> - El chico no tiene foto propia en Tablele (las fotos son de las palabras):
>   la pantalla del vinculado muestra sólo el nombre.
> - Sin QR por ahora: el enlace se comparte por WhatsApp o se copia. El QR
>   necesita una dependencia o un generador propio; queda para después.
> - Sin cola offline: si no hay conexión, la ficha no se manda y se avisa. El id
>   de cliente ya está, así que agregar reintentos no cambia la API.
> - Todo Fichas es una sola página (`/fichas`) con pestañas, más
>   `/fichas/v/<token>` para entrar por invitación.

---

## 1. El caso

Un chico que usa Tablele trabaja también sobre su conducta. Varios adultos que
están con él —la mamá, la profesional, la maestra, la abuela, un acompañante—
quieren reconocerle lo que hace bien y dejar registrado lo que hace mal, en el
momento y desde su celular. El chico, junto con su mamá, ve lo que le fueron
dando, quién y por qué, y trabaja para llegar a un objetivo.

Va en un subdominio aparte para **no tocar la dinámica de Tablele**: otras
pantallas, otras tablas, otro público. Comparte con Tablele sólo la identidad
del chico `(account_id, username)` y el login de los adultos.

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Fichas que suman | **⭐ 1 estrella** y **⭐⭐ Vale Doble** (2 estrellas). Nada más. |
| Caritas | **🙂 feliz** y **🙁 triste**. **No suman ni restan estrellas.** Son informe. |
| ¿El chico ve las 🙁? | **Sí.** No restan, pero tiene que saber que también se registra lo que hace mal. |
| Quién administra | **Titular y tutores del chico, con los mismos permisos** (la mamá y la profesional "lo ven las dos"). |
| Quién más da fichas | Personas **invitadas** por una administradora, sin cuenta ni correo. |
| Objetivo | **Simple:** una cantidad de estrellas acumuladas al final de un período, y un premio. Uno activo a la vez. |
| Lista de quién dio | Siempre visible para las administradoras y el chico, para **repasarla juntos**. |

> Ojo con una diferencia respecto de Tablele: allá un tutor **sólo juega y mira**.
> Acá un tutor **administra** (invita, crea objetivos, anula). Es a propósito: en
> Fichas, la mamá es la protagonista.

## 3. Roles

| Rol | Cómo entra | Qué puede |
|---|---|---|
| **Administradora** (titular o tutor del chico en Tablele) | Con su correo, igual que en Tablele. El rol sale de `resolverRol()`. | Todo: dar fichas y caritas, invitar y revocar, crear objetivos, anular fichas, ver tablero, lista e informe, abrir el modo chico. |
| **Vinculado** (maestra, abuela, acompañante) | Abre un enlace o QR de invitación una vez; el dispositivo lo recuerda. | Dar ⭐, ⭐⭐, 🙂 y 🙁 a ese chico. Ver **sólo lo que dio él**. Anular lo suyo dentro de los 15 minutos. |
| **Chico** | No entra solo: una administradora abre el **modo chico** en su dispositivo. | Ver su visualizador y su lista, escucharla en voz alta. |

Un vinculado **no ve** el informe de Tablele, las palabras, las fichas de otros
adultos ni el objetivo. Un vinculado no necesita cuenta en `accounts`.

---

## 4. Modelo de datos

Tablas nuevas. No se toca `tablele_datos` ni `accounts`.

```sql
-- Personas invitadas a dar fichas a un chico
create table fichas_vinculos (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id),
  username     text not null,
  nombre       text not null,                 -- "Seño Ana", "Abuela Marta"
  token_hash   text not null unique,          -- sha256 del token del enlace; el token no se guarda
  creado_por   citext not null,               -- correo de la administradora que invitó
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  revocado_at  timestamptz,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index on fichas_vinculos (account_id, username);

-- Cada ficha o carita dada. Append-only: sólo se escribe la anulación.
create table fichas (
  id           uuid primary key,              -- lo genera el cliente: reintentos idempotentes
  account_id   uuid not null,
  username     text not null,
  tipo         text not null check (tipo in ('estrella', 'doble', 'feliz', 'triste')),
  valor        smallint not null,             -- 1, 2, 0, 0 (lo fija el servidor según tipo)
  comentario   text check (char_length(comentario) <= 200),
  dada_por     text not null,                 -- 'admin:<correo>' o 'vinculo:<uuid>'
  dada_por_nombre text not null,              -- congelado al dar: si renombran el vínculo, la historia no cambia
  created_at   timestamptz not null default now(),
  anulada_at   timestamptz,
  anulada_por  text,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index on fichas (account_id, username, created_at desc);

-- Objetivos: uno activo por chico
create table fichas_objetivos (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  username     text not null,
  meta         smallint not null check (meta > 0),   -- estrellas a juntar
  premio       text not null,                        -- "ir al cine"
  inicio       date not null,
  fin          date not null check (fin >= inicio),
  creado_por   citext not null,
  cerrado_at   timestamptz,
  cumplido     boolean,                              -- se fija al cerrar
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create unique index on fichas_objetivos (account_id, username) where cerrado_at is null;
```

Las tres tablas con **RLS activado y sin políticas**: sólo el servidor, con la
service key, las lee y escribe. Igual que el resto de Tablele.

**Las estrellas no se guardan como contador.** Se calculan:

```
acumuladas(objetivo) = sum(valor) de fichas del chico
                       donde anulada_at is null
                       y created_at (en hora de Argentina) entre objetivo.inicio y objetivo.fin
```

Así no hay un número que se desincronice, y anular una ficha corrige todo solo.
Las caritas tienen `valor = 0`: aunque alguien se equivoque en la suma, no cuentan.

---

## 5. Reglas

1. **Las caritas no suman ni restan.** Nunca tocan el objetivo.
2. **Comentario obligatorio** en ⭐⭐ Vale Doble y en 🙁. Opcional en ⭐ y 🙂.
   Si fue algo grande o algo malo, que quede escrito qué fue: es lo que después
   se repasa con el chico.
3. **Una ficha no se borra.** Se anula: queda tachada en la lista y deja de contar.
   - La administradora puede anular cualquiera, siempre.
   - El vinculado puede anular sólo las suyas y sólo dentro de los 15 minutos (para corregir un toque equivocado).
4. **Un objetivo activo por chico.** Al pasar la fecha de fin se cierra solo
   (`cumplido = acumuladas >= meta`) y queda en el historial. Las estrellas no
   pasan al objetivo siguiente.
5. **Llegar a la meta antes de tiempo** marca el objetivo como cumplido y dispara
   el festejo; las fichas siguen registrándose hasta el fin del período, pero el
   visualizador queda lleno.
6. **Revocar un vínculo** corta el acceso en la próxima llamada. Las fichas que
   dio quedan: son historia del chico.

---

## 6. API

Todo bajo `/api/fichas/*`. Las rutas de Tablele no cambian.

### 6.1. Administradoras

Todas llevan `email`, `accountId`, `username` y pasan por `resolverRol()`;
cualquier rol (`titular` o `tutor`) es administradora. `null` → `403`.

| Método y ruta | Qué hace |
|---|---|
| `POST /api/fichas/cuenta` | Igual que `/api/cuenta`: devuelve los chicos del correo (titular + tutor). Se reusa la lógica. |
| `GET  /api/fichas/tablero` | Objetivo activo + acumuladas + lista de fichas del período + caritas del período. |
| `POST /api/fichas/dar` | `{ id, tipo, comentario? }`. Valida comentario obligatorio. |
| `POST /api/fichas/anular` | `{ fichaId }`. |
| `GET  /api/fichas/vinculos` | Lista de vinculados del chico. |
| `POST /api/fichas/vinculos` | `{ nombre }` → crea el vínculo y devuelve **una sola vez** el enlace `https://fichas.tablele.com.ar/v/<token>`. |
| `POST /api/fichas/vinculos/revocar` | `{ vinculoId }`. |
| `POST /api/fichas/objetivo` | `{ meta, premio, inicio, fin }`. Falla si ya hay uno activo. |
| `POST /api/fichas/objetivo/cerrar` | Cierra antes de tiempo. |
| `GET  /api/fichas/historial` | Objetivos cerrados con su resultado. |

### 6.2. Vinculados

Llevan el **token** en un header (`X-Fichas-Token`), nunca en la query. El
servidor busca `token_hash = sha256(token)`, `activo = true`. Si no está → `401`
y el cliente borra el token guardado.

| Método y ruta | Qué hace |
|---|---|
| `GET  /api/fichas/v/yo` | Nombre del vínculo, nombre y foto del chico. |
| `POST /api/fichas/v/dar` | `{ id, tipo, comentario? }`. `dada_por = 'vinculo:<id>'`. |
| `GET  /api/fichas/v/mias` | Sólo las fichas que dio este vínculo, últimos 30 días. |
| `POST /api/fichas/v/anular` | Sólo las propias y dentro de los 15 minutos. |

El token: 32 bytes aleatorios en base64url. Va en el **path** del enlace de
invitación sólo para el primer acceso; la página lo pasa a `localStorage`
(`fichas.vinculo`) y hace `history.replaceState` a `/` para que no quede en el
historial ni en una captura de pantalla.

---

## 7. Pantallas

### 7.1. Administradora — Tablero (`/`)

- Selector de chico (si tiene más de uno).
- **Visualizador**: barra o frasco que se llena hacia la meta, con "faltan N
  estrellas" y "quedan N días". Premio escrito abajo.
- **Botones para dar**: ⭐ · ⭐⭐ · 🙂 · 🙁, con comentario.
- **Lista**: cada ficha con ícono, quién, cuándo y comentario. Filtros por persona
  y por semana. Las anuladas, tachadas.
- **Informe de caritas**: 🙂 y 🙁 del período, por persona y por día de la semana.
- Accesos a: Vinculados · Objetivo · Historial · **Modo chico**.

### 7.2. Administradora — Vinculados

Lista con nombre, fecha de alta, cuántas fichas dio, estado. Botón **Invitar**:
pide el nombre y muestra el enlace con QR y botón de compartir (WhatsApp). Se
avisa que el enlace se muestra una sola vez y que quien lo tenga puede dar fichas.

### 7.3. Modo chico

Pantalla grande, sin botones de administración:

- El visualizador, grande y festivo.
- La lista como tarjetas: "**Seño Ana** te dio ⭐⭐ — *ayudó a ordenar sin que se lo pidieran*".
  Al tocarla, la lee en voz alta (`lib/audio.ts` de Tablele).
- Las 🙁 aparecen igual, en tono neutro, sin animación ni sonido de error:
  "**Mamá** anotó 🙁 — *le pegó a su hermano*". Están para conversarlas, no para castigar.
- Al llegar a la meta: festejo y el premio.
- Salida con un gesto de adulto (mantener apretado), para que el chico no salga solo.

### 7.4. Vinculado (`/`)

Una sola pantalla: foto y nombre del chico, los cuatro botones, campo de
comentario, y debajo "Lo que diste" con la opción de anular lo reciente. Si el
token fue revocado: "Este enlace ya no está activo. Pedile uno nuevo a la familia."

---

## 8. Arquitectura del subdominio

**Recomendado:** la misma app Next de Tablele, con ruteo por host en `proxy.ts`
(el middleware de Next 16): si el host es `fichas.tablele.com.ar`, reescribe a
`/fichas/*`; si no, `/fichas/*` devuelve 404. Reusa `lib/supabase.ts`,
`resolverRol()`, `lib/claves.ts`, `lib/audio.ts` y la foto del chico, sin copiar
código. En Vercel, el subdominio se agrega al mismo proyecto.

**Alternativa:** un proyecto Next aparte en `fichas/` dentro del repo, con su
propio deploy. Aísla del todo los despliegues, pero duplica el código compartido
o obliga a extraerlo a un paquete. Conviene sólo si Fichas va a crecer como
producto propio (por ejemplo, usarse con chicos que no usan Tablele).

Las sesiones **no se comparten** entre dominios: la administradora vuelve a
poner su correo en fichas.tablele.com.ar la primera vez. Claves de
`localStorage` con prefijo `fichas.` para no chocar con las de Tablele.

---

## 9. Casos borde

| Caso | Qué debe pasar |
|---|---|
| La misma persona invitada dos veces | Son dos vínculos distintos. La lista muestra ambos; se puede revocar uno. |
| Un vinculado reenvía el enlace a otra persona | Esa persona da fichas a nombre del vínculo. Riesgo aceptado, igual que el modelo de correo. Mitigación: revocar y reinvitar. |
| Sin conexión al dar una ficha | El cliente la guarda con su `id` y reintenta; el servidor ignora un `id` repetido. |
| Ficha dada sin objetivo activo | Se registra igual y aparece en la lista; no suma a nada. |
| La administradora deja de ser tutora en Tablele | Pierde el acceso a Fichas en la próxima llamada. Sus fichas y los vínculos que creó quedan. |
| Cambia el nombre de un vínculo | Las fichas viejas muestran el nombre con que se dieron (`dada_por_nombre`). |
| Objetivo con fin en el pasado al crearlo | `400`. |
| El chico se borra en Tablele | Las FK lo impiden mientras tenga fichas. Decidir en ese momento (§11). |

---

## 10. Plan de implementación

1. **Base.** Las tres tablas, índices y RLS. No toca la app.
2. **Ruteo.** `proxy.ts` por host y el subdominio en Vercel con una página vacía.
3. **API administradoras** (§6.1) y **Tablero** (§7.1). Con esto la mamá y la
   profesional ya pueden usarlo entre ellas.
4. **Objetivo y visualizador.**
5. **Vínculos** (§6.2, §7.2, §7.4).
6. **Modo chico** (§7.3).
7. **Tests** (§12).

Cada paso se puede desplegar solo: Tablele no cambia en ninguno.

---

## 11. Decisiones abiertas

- **Tope diario por vinculado.** Con sólo 1 y 2 estrellas el riesgo de inflación
  es bajo; arrancar sin tope y mirar los datos.
- **¿Todos los vinculados pueden dar Vale Doble?** Propuesta: sí al arrancar; si
  hace falta, un flag `puede_doble` en el vínculo.
- **Notificar a la mamá** cuando un vinculado da una 🙁 (push o WhatsApp). Útil,
  pero es otra infraestructura: fuera de la primera versión.
- **Borrado de un chico con fichas:** anonimizar o borrar en cascada.

---

## 12. Tests

- `valor` lo fija el servidor según `tipo`: un cliente que mande `valor: 10` no cambia nada.
- ⭐⭐ y 🙁 sin comentario → `400`.
- Las caritas no cambian `acumuladas`.
- Una ficha anulada no cuenta; un vinculado no puede anular la de otro ni pasados los 15 minutos.
- Token revocado → `401`; token de un chico no sirve para otro.
- `id` repetido en `/dar` no duplica.
- Un vinculado no puede leer el tablero ni las fichas de otros.
- Una administradora de otro chico de la misma cuenta → `403` (lo cubre `resolverRol`).
- Cierre automático: el objetivo vencido queda `cumplido` según la suma al día de fin, en hora de Argentina.
