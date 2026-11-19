-- Tablele Fichas v3 — biblioteca de conductas y Vale Doble por conducta (SPEC-fichas-v3.md §3)
-- Correr una vez en el editor SQL de Supabase, DESPUÉS de fichas-v2.sql. Idempotente.

alter table fichas_conductas add column if not exists doble boolean not null default false;
alter table fichas_conductas add column if not exists catalogo text;
create unique index if not exists fichas_conductas_catalogo
  on fichas_conductas (account_id, username, catalogo) where catalogo is not null;
