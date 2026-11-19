# Tablele Fichas v2 — conductas y tienda de premios

> Base: `05f0c2e` (Fichas v1 en producción). Continúa `SPEC-fichas.md`.
> Estado: **implementado** (pendiente de correr `web/sql/fichas-v2.sql` antes de desplegar).
> Origen: revisión con Leticia (2026-11-19). La v1 tenía dos huecos respecto
> de la economía de fichas clásica: no decía **por qué** se ganó cada estrella,
> y tenía **un** objetivo fijo en vez de un menú de premios que se canjean.

---

## 1. La técnica

Economía de fichas, en las cinco piezas que usa esta versión:

1. **Conductas objetivo**: pocas (3 a 5 activas), en positivo, con pictograma.
2. **Ficha inmediata + elogio descriptivo**: la ficha dice qué hizo bien
   ("¡Gracias por terminar la tarea!").
3. **Menú de premios** con precios distintos, elegidos con el chico.
4. **Canje**: el chico "compra" y las estrellas se gastan. La mamá decide
   cuándo, y puede **poner en cero**.
5. **Desvanecimiento**: con el tiempo se suben precios y se espacian fichas.
   La app lo permite (editar precios) pero no lo automatiza.

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Estrella y Vale Doble | **Llevan conducta obligatoria**, elegida de la lista del chico. Comentario opcional. |
| Caritas 🙂 / 🙁 | **Libres**: sin conducta, sólo texto. 🙁 con comentario obligatorio (como en v1). No suman ni restan. |
| Objetivo único | **Se reemplaza** por la tienda de premios. |
| Poner en cero | Lo decide la mamá (o la profesional) cuando quiere. Queda registrado. |
| Historial | Las fichas nunca se borran: el "por qué" de cada estrella sobrevive a canjes y reinicios. |

## 3. Conceptos

- **Conducta**: texto corto en positivo + pictograma. Se muestra al chico como
  agradecimiento: *"¡Gracias por {conducta}!"*. Ej.: "terminar la tarea",
  "hablar sin malas palabras", "ayudar a ordenar".
- **Premio**: nombre + precio en estrellas + pictograma. Ej.: "10 minutos de
  tablet" (5 ⭐), "ir a la plaza" (15 ⭐), "cine" (40 ⭐).
- **Saldo**: estrellas disponibles para canjear =
  `fichas ganadas desde el último "poner en cero"` − `canjes desde entonces`.
- **Movimiento**: un canje o un reinicio. Es lo que mueve el saldo sin tocar las
  fichas.

---

## 4. Modelo de datos

Tablas nuevas; `fichas` gana una columna. `fichas_objetivos` queda sin uso (no
se borra: es historia).

```sql
create table fichas_conductas (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  username    text not null,
  texto       text not null check (char_length(texto) between 1 and 60),
  picto       integer,                  -- id de ARASAAC, opcional
  orden       smallint not null default 0,
  activa      boolean not null default true,  -- se archiva, no se borra
  created_at  timestamptz not null default now(),
  foreign key (account_id, username) references tablele_datos(account_id, username)
);

create table fichas_premios (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  username    text not null,
  nombre      text not null check (char_length(nombre) between 1 and 60),
  precio      smallint not null check (precio between 1 and 1000),
  picto       integer,
  orden       smallint not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (account_id, username) references tablele_datos(account_id, username)
);

create table fichas_movimientos (
  id           uuid primary key,          -- de cliente: reintento idempotente
  account_id   uuid not null,
  username     text not null,
  tipo         text not null check (tipo in ('canje', 'cero')),
  premio_id    uuid references fichas_premios(id),
  premio_nombre text,                     -- congelado: si cambian el premio, el historial no cambia
  costo        smallint not null default 0 check (costo >= 0),
  saldo_antes  smallint not null,         -- para mostrar "tenía 23, canjeó 15"
  hecho_por    text not null,             -- 'admin:<correo>'
  hecho_por_nombre text not null,
  created_at   timestamptz not null default now(),
  anulado_at   timestamptz,               -- deshacer un canje equivocado
  foreign key (account_id, username) references tablele_datos(account_id, username)
);

alter table fichas
  add column conducta_id uuid references fichas_conductas(id),
  add column conducta_texto text;         -- congelado al dar

-- RLS activado y sin políticas en las tres tablas nuevas, como en v1.
```

**Saldo** (se calcula, no se guarda):

```
ultimoCero = created_at del último movimiento 'cero' no anulado (o -∞)
ganadas    = sum(valor) de fichas no anuladas con created_at > ultimoCero
gastadas   = sum(costo) de canjes no anulados con created_at > ultimoCero
saldo      = ganadas − gastadas
```

Las fichas de v1 sin conducta siguen contando para el saldo y aparecen en el
informe como "sin conducta".

## 5. Reglas

1. Estrella y Vale Doble **requieren** `conducta_id` de una conducta **activa**
   de ese chico. El servidor valida y congela `conducta_texto`.
2. Caritas: `conducta_id` siempre null. 🙁 con comentario obligatorio.
3. Vale Doble ya **no** exige comentario: la conducta dice el por qué.
4. **Canjear** sólo si `saldo ≥ precio`. Descuenta el precio.
5. **Poner en cero** deja el saldo en 0. Pide confirmación mostrando el saldo
   que se pierde.
6. Un canje o un cero se pueden **anular** (error de toque). Al anular un cero,
   vuelven las estrellas de antes.
7. Conductas y premios **se archivan, no se borran**: las fichas viejas siguen
   mostrando su conducta.
8. Máximo **8 conductas activas** por chico (la técnica recomienda 3 a 5; 8 da
   margen sin volver la pantalla de dar ilegible).

## 6. Quién ve qué

| | Administradora | Invitado | Chico (modo chico) |
|---|---|---|---|
| Elegir conducta al dar | ✅ | ✅ (sólo las activas) | — |
| Editar conductas y premios | ✅ | ❌ | ❌ |
| Saldo | ✅ | ❌ | ✅ grande |
| Tienda (premios y precios) | ✅ | ❌ | ✅ "te alcanza" / "te faltan N" |
| Canjear / poner en cero | ✅ | ❌ | ❌ |
| Lista de fichas con conducta | ✅ todas | sólo las suyas | ✅ todas |
| Informe por conducta | ✅ | ❌ | ❌ |

## 7. Pantallas

- **Dar ficha** (admin e invitado): primero ⭐ / ⭐⭐ / 🙂 / 🙁. Si es estrella,
  aparece la grilla de conductas con pictograma; tocar una es obligatorio.
  Comentario opcional. Confirmación: *"Le diste ⭐⭐ por terminar la tarea"*.
- **Tablero** (admin): saldo arriba, tienda con botón **Canjear** en cada
  premio que alcanza, botón **Poner en cero**, lista de fichas y movimientos
  intercalados por fecha.
- **Conductas y premios** (admin, pestaña nueva que reemplaza "Objetivo"):
  agregar, editar texto, precio y pictograma, reordenar, archivar. Buscador de
  pictogramas de ARASAAC (los mismos que usa MiraVoz).
- **Informe** (admin): estrellas por conducta por semana (últimas 8 semanas) y
  caritas con su texto.
- **Modo chico**: saldo grande, tienda con lo que le alcanza resaltado, y las
  fichas como tarjetas: *"Seño Ana: ¡Gracias por terminar la tarea! ⭐⭐"*,
  leídas en voz alta.

## 8. API (cambios)

| Ruta | Cambio |
|---|---|
| `POST /api/fichas/dar`, `/v/dar` | + `conductaId` (obligatorio para estrella/doble). |
| `POST /api/fichas/tablero` | Devuelve `conductas`, `premios`, `saldo`, `movimientos`; sin `objetivo`. |
| `GET /api/fichas/v/yo` | + `conductas` activas (para elegir). |
| `POST /api/fichas/conductas` | `accion`: crear / editar / archivar / ordenar. |
| `POST /api/fichas/premios` | `accion`: crear / editar / archivar / ordenar. |
| `POST /api/fichas/movimiento` | `accion`: canjear `{premioId}` / cero / anular `{movimientoId}`. |
| `POST /api/fichas/informe` | Estrellas por conducta y semana. |
| `/api/fichas/objetivo` | Se retira. |

## 9. Casos borde

| Caso | Qué pasa |
|---|---|
| Un invitado da una estrella con una conducta que la mamá archivó hace un segundo | `400 conducta-inactiva`; la pantalla recarga las conductas. |
| Dos administradoras canjean a la vez y el saldo no alcanza para las dos | El servidor recalcula el saldo al canjear; la segunda recibe `409 saldo-insuficiente`. |
| Chico sin conductas cargadas | El botón de estrella muestra "Primero cargá las conductas" (admin) o "Todavía no hay conductas, avisale a la familia" (invitado). Las caritas funcionan igual. |
| Fichas de v1 sin conducta | Cuentan para el saldo; en el informe, "sin conducta". |
| Se anula una ficha después de un canje | El saldo puede quedar negativo; se muestra como 0 y el próximo canje lo descuenta. |

## 10. Plan

1. SQL (`web/sql/fichas-v2.sql`), idempotente.
2. Lógica pura: saldo, validaciones, informe por semana + tests.
3. API.
4. Pantallas: dar con conducta, pestaña Conductas y premios con ARASAAC,
   tienda/canje/cero, informe, modo chico.
5. Retirar objetivo de la UI.
