-- PolyOrg: Initiales Datenbankschema
-- Ausführen im Supabase SQL Editor (Dashboard → SQL → New query)

-- ---------------------------------------------------------------------------
-- Enum für Event-Typen
-- ---------------------------------------------------------------------------
create type public.event_type as enum (
  'termin',
  'aufgabe',
  'erinnerung',
  'abwesenheit'
);

-- ---------------------------------------------------------------------------
-- profiles – ein Datensatz pro eingeloggtem User (1:1 zu auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  profile_icon text not null default 'bear',
  color_code text not null default '#6B4EAA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_username_not_empty check (char_length(trim(username)) > 0),
  constraint profiles_color_code_format check (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.profiles is 'Benutzerprofile für PolyOrg (Uwe, Fuchs, …)';
comment on column public.profiles.color_code is 'Hex-Farbe für Kalender-Einträge dieses Users, z. B. #E07A5F';

create index profiles_username_idx on public.profiles (username);

-- ---------------------------------------------------------------------------
-- events – Kalender-Einträge mit Ersteller-Referenz
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  start_time timestamptz not null,
  end_time timestamptz,
  type public.event_type not null default 'termin',
  creator_id uuid not null references public.profiles (id) on delete cascade,
  color_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_title_not_empty check (char_length(trim(title)) > 0),
  constraint events_end_after_start check (end_time is null or end_time >= start_time),
  constraint events_color_code_format check (color_code ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.events is 'Termine, Aufgaben, Erinnerungen und Abwesenheiten';
comment on column public.events.creator_id is 'Wer den Eintrag erstellt hat (→ profiles.username)';
comment on column public.events.color_code is 'Farbe zum Anzeigezeitpunkt – kopiert aus dem Profil des Erstellers';

create index events_start_time_idx on public.events (start_time);
create index events_creator_id_idx on public.events (creator_id);
create index events_type_idx on public.events (type);

-- ---------------------------------------------------------------------------
-- updated_at automatisch setzen
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil automatisch anlegen, wenn sich ein User registriert
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, profile_icon, color_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'Neuer User'),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'profile_icon', 'bear'),
    coalesce(new.raw_user_meta_data ->> 'color_code', '#6B4EAA')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.events enable row level security;

-- Profile: jeder eingeloggte User sieht alle Profile (gemeinsamer Kalender),
-- darf aber nur das eigene bearbeiten.
create policy "Profile lesen (eingeloggt)"
on public.profiles for select
to authenticated
using (true);

create policy "Eigenes Profil bearbeiten"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Eigenes Profil anlegen"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

-- Events: alle sehen, nur Ersteller darf ändern/löschen
create policy "Events lesen (eingeloggt)"
on public.events for select
to authenticated
using (true);

create policy "Events anlegen"
on public.events for insert
to authenticated
with check (auth.uid() = creator_id);

create policy "Eigene Events bearbeiten"
on public.events for update
to authenticated
using (auth.uid() = creator_id)
with check (auth.uid() = creator_id);

create policy "Eigene Events löschen"
on public.events for delete
to authenticated
using (auth.uid() = creator_id);

-- ---------------------------------------------------------------------------
-- Hilfs-View: Events inkl. Ersteller-Name (für Kalender-Anzeige)
-- ---------------------------------------------------------------------------
create or replace view public.events_with_creator as
select
  e.id,
  e.title,
  e.description,
  e.start_time,
  e.end_time,
  e.type,
  e.creator_id,
  e.color_code,
  e.created_at,
  e.updated_at,
  p.username as creator_username,
  p.avatar_url as creator_avatar_url
from public.events e
join public.profiles p on p.id = e.creator_id;

revoke all on public.events_with_creator from public;
grant select on public.events_with_creator to authenticated;

comment on view public.events_with_creator is
  'Events mit Ersteller-Infos – z. B. ob Uwe oder Fuchs den Termin angelegt hat';
