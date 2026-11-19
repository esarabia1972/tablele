-- Tablele Fichas — tablas (SPEC-fichas.md §4)
-- Correr una vez en el editor SQL de Supabase. Es idempotente: se puede volver a correr.
-- No toca tablele_datos ni accounts.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- Personas invitadas a dar fichas a un chico
create table if not exists fichas_vinculos (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id),
  username     text not null,
  nombre       text not null check (char_length(nombre) between 1 and 40),
  token_hash   text not null unique,          -- sha256 hex del token; el token no se guarda
  creado_por   citext not null,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  revocado_at  timestamptz,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index if not exists fichas_vinculos_chico on fichas_vinculos (account_id, username);

-- Cada ficha o carita dada. Append-only: sólo se escribe la anulación.
create table if not exists fichas (
  id              uuid primary key,           -- lo genera el cliente
  account_id      uuid not null,
  username        text not null,
  tipo            text not null check (tipo in ('estrella', 'doble', 'feliz', 'triste')),
  valor           smallint not null check (valor in (0, 1, 2)),
  comentario      text check (comentario is null or char_length(comentario) <= 200),
  dada_por        text not null,              -- 'admin:<correo>' o 'vinculo:<uuid>'
  dada_por_nombre text not null,
  created_at      timestamptz not null default now(),
  anulada_at      timestamptz,
  anulada_por     text,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create index if not exists fichas_chico_fecha on fichas (account_id, username, created_at desc);
create index if not exists fichas_dada_por on fichas (dada_por, created_at desc);

-- Objetivos: uno activo por chico
create table if not exists fichas_objetivos (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  username     text not null,
  meta         smallint not null check (meta > 0 and meta <= 1000),
  premio       text not null check (char_length(premio) between 1 and 120),
  inicio       date not null,
  fin          date not null check (fin >= inicio),
  creado_por   citext not null,
  created_at   timestamptz not null default now(),
  cerrado_at   timestamptz,
  cumplido     boolean,
  foreign key (account_id, username) references tablele_datos(account_id, username)
);
create unique index if not exists fichas_objetivo_activo
  on fichas_objetivos (account_id, username) where cerrado_at is null;

-- Sólo el servidor (service key) lee y escribe.
alter table fichas_vinculos  enable row level security;
alter table fichas           enable row level security;
alter table fichas_objetivos enable row level security;
