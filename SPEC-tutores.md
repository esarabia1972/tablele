# Tablele — Tutores (adulto a cargo)

> Base: `e0236e7` (v0.10.0). Continúa `SPEC-cuentas.md` §14.
> Estado: **implementado** en la rama `feat/tutores`.
>
> Diferencias con lo escrito acá, decididas al implementar:
> - Los tutores se leen por `GET /api/tutores` (sólo titular) en vez de venir en
>   el payload de `/api/datos`: a un tutor no le aporta nada saber quién más
>   tiene acceso al chico, y es dato de terceros. La escritura sí va por
>   `POST /api/datos` con el campo `tutores`, como estaba previsto.
> - `§8 origen del evento`: **descartado por decisión de Esteban** — esa historia
>   queda en el paciente y no hace falta separarla.

---

## 1. El caso

Jessica es la mamá de pacientes de Leticia. Necesita que sus hijos jueguen en
casa desde su propio dispositivo, y que lo que juegan ahí aparezca en el informe
que Leticia mira en el consultorio. Hoy no se puede: un chico pertenece a una
sola cuenta, y la única salida era compartir el correo de Leticia — lo que le
mostraría a Jessica **todos** los pacientes de Leticia (`SPEC-cuentas.md` §14.2).

## 2. Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Cuántos tutores por chico | **Dos**, en dos columnas. Un `alter table` y listo. |
| Qué puede hacer un tutor | **Jugar y mirar.** Ver el nombre, ver las palabras, ver el informe. |
| Qué NO puede hacer | Cambiar palabras, nombre, método, etapa o nivel. Borrar el informe. Crear chicos. Tocar los tutores. |
| Quién crea chicos | Sólo el titular. |

De ahí sale la regla que ordena toda la implementación:

> **Un tutor nunca escribe `config`.** Escribe `stars` y `stats` —que es jugar— y
> nada más.

Eso se enforcea en un solo punto del servidor, no campo por campo sobre un blob
jsonb, que era la parte cara del planteo original.

---

## 3. Modelo de datos

```sql
alter table tablele_datos
  add column tutor1 citext,
  add column tutor2 citext;

create index on tablele_datos (tutor1);
create index on tablele_datos (tutor2);
```

`citext` por la misma razón que `accounts.email`: que `Yesi@Gmail.com` y
`yesi@gmail.com` sean el mismo correo.

No hay tabla nueva, no hay clave que cambie, y **las claves de localStorage no se
tocan**: el chico sigue perteneciendo a la cuenta del titular, así que
`tablele.config_<accountId>_<username>` es la misma clave la mire Leticia o la
mire Jessica. **No hace falta migración de dispositivo.**

---

## 4. Cómo se determina el rol

Esto es lo único delicado de la spec, así que va explícito.

Un tutor y el titular mandan **exactamente el mismo par** `(accountId, username)`
—el chico es el mismo— así que el servidor no puede distinguirlos por el par. El
rol se deriva del **correo del adulto**, server-side:

```
resolverRol(email, fila) ->
  si  email == (select email from accounts where id = fila.account_id)  -> 'titular'
  si  email == fila.tutor1 o email == fila.tutor2                       -> 'tutor'
  si no                                                                  -> null  (403)
```

Es tan fuerte como el resto del modelo de acceso de la app (conocer el correo es
ser esa persona, §9 de `SPEC-cuentas.md`), y no agrega una debilidad nueva: el
rol no se puede falsificar sin conocer el correo del titular.

**Consecuencia: `email` pasa a ser obligatorio en TODA llamada a `/api/datos`,
GET y POST.** Hoy alcanza con `(accountId, username)`, y eso deja un agujero que
esta función abriría: un tutor conoce el `accountId` de Leticia (se lo devuelve
su propio login) y podría leer o escribir el informe de **otro** paciente de
Leticia adivinando el nombre. Con el correo obligatorio y el rol resuelto contra
la fila, ese caso da 403.

El costo es un `select` extra en los push que sólo llevan `stars`. A este volumen
—unas pocas escrituras por minuto por chico— no es un problema.

---

## 5. API

### 5.1. `POST /api/cuenta` — cambia

Hoy: busca en `accounts`; si no está, "no habilitada".
Ahora: busca en `accounts` **y** entre los tutores, y **une** los dos resultados.

```jsonc
// request
{ "email": "yesicandolfatti@gmail.com" }

// 200 — con acceso (como titular, como tutor, o como las dos cosas)
{
  "ok": true,
  "email": "yesicandolfatti@gmail.com",
  "titular": { "id": "uuid", "nombre": "Yesica" },   // null si no tiene cuenta propia
  "chicos": [
    { "accountId": "uuid-de-leticia", "username": "usain", "rol": "tutor" },
    { "accountId": "uuid-de-leticia", "username": "noah",  "rol": "tutor" }
  ]
}

// 200 — sin acceso por ningún lado
{ "ok": false, "motivo": "no-autorizada",
  "message": "Ese correo no está habilitado todavía." }
```

Dos cosas que el planteo original resolvía mal y hay que hacer así:

**Un correo puede ser titular Y tutor a la vez.** Un `else` entre las dos
búsquedas dejaría afuera el caso más probable: Esteban tiene cuenta propia y a la
vez es el adulto a cargo de Manu en la cuenta de Leticia. Se buscan los dos
lados siempre y se concatena.

**Cada chico viaja con SU `accountId`.** No existe "el accountId del tutor".
Si Jessica tuviera un hijo con Leticia y otro con otra profesional, agrupar todo
bajo el `account_id` del primero haría que el segundo escriba en las claves y en
la fila equivocadas. La lista es de pares, y la sesión toma el par del chico que
se elige.

**Consulta de los chicos como tutor:**

```
/rest/v1/tablele_datos?or=(tutor1.eq.<email>,tutor2.eq.<email>)&select=account_id,username&order=username.asc
```

> ⚠️ **Antes de usar el correo en ese filtro hay que endurecer `EMAIL_RE`.** El
> actual (`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`) acepta comillas, comas y paréntesis,
> que son justamente los metacaracteres de la sintaxis `or=(...)` de PostgREST.
> Cambiar a un charset conservador:
>
> ```ts
> export const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
> ```
>
> Y aun así, `encodeURIComponent` sobre el valor: un `+` sin escapar en una query
> string significa espacio, y `yesi+tablele@gmail.com` es un correo legítimo.

### 5.2. `POST /api/acceso` — cambia

- Recibe `email` además de `accountId` y `username`.
- Resuelve el rol (§4). Sin rol → `403`.
- **`crear: true` sólo para `titular`.** Un tutor que lo intente recibe
  `403 { motivo: "solo-titular" }`. No alcanza con esconder el botón: la API es
  la que manda.

### 5.3. `GET|POST /api/datos` — cambia

Ambos reciben `email` y resuelven el rol. Sin rol → `403`.

En el POST, si el rol es `tutor`:

```ts
// Un tutor nunca escribe config.
if (rol === "tutor") {
  delete row.config;              // se ignora en silencio, no es un error
  if (forzarBorrado) {
    return 403 { motivo: "solo-titular" };
  }
}
```

`stars` y `stats` se procesan igual que hoy para los dos roles — incluido el
merge del informe, que es lo que hace que lo de casa y lo del consultorio se
sumen en vez de pisarse.

`config` se ignora en silencio en vez de rechazar el request, porque el cliente
del tutor no debería mandarla nunca: si llega, es un bug o una manipulación, y en
ninguno de los dos casos conviene romperle el guardado de las estrellas al chico.

### 5.4. `POST /api/foto` — cambia

Las fotos viven en `config`, así que **un tutor no sube fotos**. Resuelve el rol
y devuelve `403 { motivo: "solo-titular" }` si no es titular.

### 5.5. Los tutores se editan sólo desde el titular

El alta y la baja de un tutor van por `/api/datos` como parte de un campo nuevo
del POST (no dentro de `config`):

```jsonc
{ "accountId": "...", "username": "usain", "email": "<titular>",
  "tutores": ["yesicandolfatti@gmail.com", ""] }
```

Sólo se acepta con rol `titular`. Cada entrada se normaliza con
`normalizarEmail()` y se valida con `EMAIL_RE`; vacío o ausente borra esa
posición. Un tutor que mande `tutores` recibe `403`.

---

## 6. Cliente

### 6.1. Tipos

```ts
// lib/storage.ts
export type Rol = "titular" | "tutor";

export type ChicoDeCuenta = { accountId: string; username: string; rol: Rol };

export type Cuenta = {
  email: string;
  nombre?: string;
  /** id de la cuenta propia. null si sólo entra como tutor. */
  titularId?: string;
  chicos: ChicoDeCuenta[];
};

export type Sesion = { accountId: string; username: string; rol: Rol };
```

`Cuenta` **deja de tener `accountId`**. Hay que revisar los dos lugares que hoy
lo asumen:

- `getCuenta()` valida `ACCOUNT_ID_RE.test(parsed.accountId)` → pasa a validar
  que haya `email` y que `chicos` sea un array.
- `salirDeCuenta()` borra las claves con prefijo `<base>_<accountId>_` → pasa a
  recorrer `cuenta.chicos` y borrar las de cada par.

`getSessionData()` devuelve `rol: "titular"` cuando la sesión guardada no lo
trae, que es el caso de las sesiones abiertas antes de este cambio.

### 6.2. Sincronización

`lib/sync.ts` agrega el correo al payload y a la query, tomándolo de
`tablele.cuenta`. **Los cuatro invariantes no cambian** y siguen siendo por
`(cuenta, chico)`.

Un cambio sí hace falta: `schedulePush("config")` **no debe programarse nunca
desde una sesión de tutor**. Con la config en modo lectura no debería ocurrir,
pero conviene el guard en `saveConfig()` —`if (sesion.rol !== "titular") return;`—
para que un bug de UI no genere pushes que el servidor va a descartar.

---

## 7. Pantallas

### 7.1. Login

Sin cambios visibles para el titular. Para el tutor, la misma pantalla de pills
con los chicos a su cargo, y **sin el botón `+`**.

El `+` se muestra si y sólo si `cuenta.titularId` existe. Ojo: si alguien es
titular *y* tutor, el `+` va, y crea el chico en **su** cuenta.

### 7.2. `/config` en modo tutor

Hoy es un formulario. Para un tutor pasa a ser una **vista de lectura**, no un
formulario con doce inputs deshabilitados: se lee mucho mejor y es imposible que
se escape un campo editable.

```
                  Configuración
                 Usuario: usain

  Nombre del niño/a        Usain
  Etapa                    Global
  Nivel                    Intermedio

  Palabras
  a  auto 🚗      b  bebé 👶      c  casa 🏠   …
  (las no activas, en gris)

  [        Ver Informe        ]
  [   Salir (cambiar usuario) ]
  Cambiar de cuenta
```

Sin "Guardar", sin cámara, sin quitar foto, sin "Restaurar las palabras por
defecto", sin checkbox de "usar". El aviso de sincronización tampoco aplica.

### 7.3. `/config/informe` en modo tutor

Idéntico, **sin el botón "Borrar historial"** ni su diálogo del candado.

### 7.4. Alta y baja de tutores (titular)

En `/config`, debajo del nombre del chico, dos campos:

```
  Adulto a cargo (opcional)      [ yesicandolfatti@gmail.com ]
  Otro adulto (opcional)         [                          ]
```

Con una línea abajo, en gris: *"Pueden jugar y ver el informe. No pueden cambiar
las palabras ni el plan."* — que es lo que el titular necesita saber para
decidir si lo pone.

---

## 8. Recomendado en el mismo movimiento: de dónde vino el evento

**No está en el pedido, pero es lo único de esta spec que no se puede agregar
después.**

Cuando Usain juegue en casa con Jessica y en el consultorio con Leticia, los dos
flujos escriben en el mismo informe. El técnico-funcional dice explícitamente que
sesión controlada y sesión de casa **no se promedian**. Sin marcar el origen, el
informe que mira Leticia mezcla las dos y sus lecturas clínicas se diluyen.

```ts
export type Evento = {
  id?: string;
  origen?: "titular" | "tutor";   // ← nuevo; ausente = titular (eventos viejos)
  t: number;
  …
};
```

`recordEvento()` lo completa con el rol de la sesión. Cuesta una línea hoy.
Mañana, los eventos ya guardados quedan sin atribución **para siempre**.

Con el campo puesto, el informe puede separar las dos columnas cuando haga falta
— y mientras tanto no cambia nada de lo que se ve hoy.

---

## 9. Casos borde

| Caso | Qué debe pasar |
|---|---|
| El titular se pone a sí mismo como tutor de su chico | `resolverRol` devuelve `titular` (se evalúa primero). Sin efecto. |
| Leticia borra un tutor mientras Jessica está jugando | Jessica sigue jugando; el próximo push da 403 y los datos quedan locales. Aceptable: no se pierde nada, y al reentrar el login le dice que no está habilitada. |
| El mismo correo en `tutor1` y `tutor2` | Se normaliza y se deduplica al guardar. |
| Jessica tiene chicos con dos profesionales distintas | Funciona: la lista lleva pares `(accountId, username)` y cada uno rutea a su fila. |
| Un tutor con `crear: true` | `403 solo-titular`, tanto en la UI como en la API. |
| Sesión vieja sin `rol` | Se asume `titular`, que es lo que era antes de este cambio. |
| El correo del tutor no está en `accounts` | Correcto y esperado: **un tutor no necesita cuenta propia.** |

---

## 10. Plan de implementación

1. **Base.** El `alter table` y los dos índices. No toca la app: las columnas
   quedan nulas y todo sigue funcionando.
2. **`EMAIL_RE` conservador** en `lib/claves.ts` (§5.1) — antes de tocar la API.
3. **API.** `resolverRol()` en `lib/supabase.ts`; `email` obligatorio en
   `/api/datos` (GET y POST); unión titular+tutor en `/api/cuenta`; guards en
   `/api/acceso` y `/api/foto`; campo `tutores` en el POST de datos.
4. **Cliente.** Tipos, `getCuenta()`, `salirDeCuenta()`, `rol` en la sesión,
   `email` en el payload y en la query, guard en `saveConfig()`.
5. **Pantallas.** `+` condicional, `/config` en modo lectura, informe sin borrar,
   los dos campos de tutor para el titular.
6. **`origen` en el `Evento`** (§8), si entra.
7. **Tests** (§11).

Los pasos 3 a 5 van juntos en un deploy: el cliente viejo no manda `email` y el
nuevo lo necesita.

---

## 11. Tests

En `lib/datos.run-tests.ts`:

- `EMAIL_RE` rechaza comillas, comas y paréntesis (el vector de `or=()`).
- `normalizarEmail` + `EMAIL_RE` sobre los correos reales del caso.

En `lib/sync.run-tests.ts`:

- Un tutor **no** programa push de `config` (guard de `saveConfig`).
- Un tutor sí sube `stars` y `stats`.
- El payload lleva el correo de la cuenta validada, no el del titular del chico.
- Dos chicos de cuentas distintas en la lista de un tutor rutean cada uno a su
  par, sin mezclar claves.
- `salirDeCuenta()` borra las claves de todos los chicos de la lista del tutor y
  no toca las de otra cuenta.
- Una sesión sin `rol` se lee como `titular`.

Verificación manual, en este orden:

1. Con Leticia, asignarle `yesicandolfatti@gmail.com` a un chico. Guardar.
2. Salir y entrar con ese correo → entra, ve **sólo** ese chico, sin `+`.
3. `/config` es de lectura: no hay Guardar, ni cámara, ni checkboxes.
4. El informe se ve, sin "Borrar historial".
5. Jugar una ronda; volver con Leticia y confirmar que las estrellas y los
   eventos de esa ronda están.
6. Con Leticia, borrar el tutor. Jessica ya no entra.
