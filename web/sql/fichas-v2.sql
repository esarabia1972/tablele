-- Tablele Fichas v2 — conductas y tienda de premios (SPEC-fichas-v2.md §4)
-- Correr una vez en el editor SQL de Supabase, DESPUÉS de fichas.sql.
-- Idempotente: se puede volver a correr. No toca tablele_datos ni accounts.

create table if not exists fichas_conductas (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null,
  username    text not null,
  texto       text not null check (char_length(texto) between 1 and 60),
  picto       integer,
  orden       smallint not null default 0,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index if not exists fichas_conductas_chico on fichas_conductas (account_id, username);

create table if not exists fichas_premios (
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
create index if not exists fichas_premios_chico on fichas_premios (account_id, username);

create table if not exists fichas_movimientos (
  id               uuid primary key,
  account_id       uuid not null,
  username         text not null,
  tipo             text not null check (tipo in ('canje', 'cero')),
  premio_id        uuid references fichas_premios(id),
  premio_nombre    text,
  costo            smallint not null default 0 check (costo >= 0),
  saldo_antes      integer not null,
  hecho_por        text not null,
  hecho_por_nombre text not null,
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      text,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index if not exists fichas_movimientos_chico on fichas_movimientos (account_id, username, created_at desc);

alter table fichas add column if not exists conducta_id uuid references fichas_conductas(id);
alter table fichas add column if not exists conducta_texto text;

alter table fichas_conductas   enable row level security;
alter table fichas_premios     enable row level security;
alter table fichas_movimientos enable row level security;
