# Tablele Fichas v3 — biblioteca de conductas y "trabajando ahora"

> Base: `ffb7635` (v2 en producción). Continúa `SPEC-fichas-v2.md`; manda donde difieren.
> Estado: **implementado**. SQL en `web/sql/fichas-v3.sql` (correr antes de desplegar).
> Origen: revisión de Esteban (2026-11-19).

## 1. El cambio

En v2 quien daba la ficha elegía el **tipo** (⭐ o ⭐⭐) y después el **por qué**.
En v3 el centro es la **conducta**: hay una biblioteca, la familia **activa** las
que se trabajan ahora, y quien da la ficha **toca directamente la conducta**. Cuánto
vale lo define la conducta: 1 ⭐, o 2 si está marcada como **Vale Doble** (resaltada).

## 2. Decisiones (de Esteban)

| Tema | Decisión |
|---|---|
| Biblioteca | **Genérica** (catálogo de la app, igual para todos) **y ajustable**: se pueden agregar conductas propias y editar texto e imagen. |
| Activación | **Permanece** hasta que alguien la cambie. Título: "Trabajando ahora". |
| Máximo activas | **6** por chico. |
| Vale Doble | **Por chico**, se decide al activar y se puede cambiar cuando se quiera. |
| Quién administra | **Las dos administradoras** (titular y tutor). |
| Caritas | Siguen aparte, libres, con texto. |

## 3. Modelo

- El **catálogo genérico** vive en el código (`lib/catalogo-conductas.ts`): texto
  + pictograma ARASAAC. No hay tabla: cambia con un deploy.
- `fichas_conductas` sigue siendo **por chico** y gana `doble` y `catalogo`
  (la clave del ítem del catálogo del que salió, o null si es propia).
- Activar una conducta del catálogo crea la copia para ese chico (o reactiva la
  que ya existía). Editar el texto o la imagen cambia sólo la copia de ese chico.
- La **biblioteca de un chico** = catálogo genérico que todavía no usó + sus
  conductas propias o del catálogo que están desactivadas.

```sql
alter table fichas_conductas add column if not exists doble boolean not null default false;
alter table fichas_conductas add column if not exists catalogo text;
create unique index if not exists fichas_conductas_catalogo
  on fichas_conductas (account_id, username, catalogo) where catalogo is not null;
```

## 4. Reglas

1. Al dar una ficha con conducta, **el servidor** fija el tipo: `doble` si la
   conducta está marcada Vale Doble, `estrella` si no. El cliente no decide el valor.
2. La ficha **congela** texto y valor: cambiar después el Vale Doble no toca lo ganado.
3. Activar falla con `409` si ya hay 6 activas.
4. Desactivar no borra: la conducta vuelve a la biblioteca y las fichas viejas
   la siguen mostrando.
5. Las conductas que ya existían (v2) quedan como propias, con su estado actual.
   Si un chico tenía más de 6 activas, siguen activas; sólo no se puede activar
   otra hasta bajar de 6.

## 5. Pantallas

- **Dar ficha**: "Hoy trabajamos" con la grilla de conductas activas. Las Vale
  Doble con borde naranja y etiqueta "⭐⭐ Vale doble". Tocar una → comentario
  opcional → Dar. Debajo, aparte: 🙂 Contento y 🙁 Triste.
- **Conductas y premios**:
  - *Trabajando ahora (n/6)*: cada una con interruptor Vale Doble, editar,
    ordenar y "Quitar".
  - *Biblioteca*: catálogo + desactivadas, con "Activar" (y "Activar como Vale
    Doble"). Abajo, "Agregar una conducta propia".
  - *Tienda de premios*: sin cambios.
