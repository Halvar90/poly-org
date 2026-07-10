-- Trennung: entry_type (Termin/Aufgabe/Abwesenheit) vs. optionale category (Arbeit, Arzt, …)

create type public.entry_type as enum ('termin', 'aufgabe', 'abwesenheit');

create type public.event_category as enum (
  'arbeit',
  'arzt',
  'haushalt',
  'freizeit',
  'kind'
);

alter table public.events
add column if not exists entry_type public.entry_type;

alter table public.events
add column if not exists category public.event_category;

-- Bestehende type-Werte auf entry_type / category mappen
update public.events
set entry_type = case
  when type::text in ('aufgabe', 'erinnerung') then 'aufgabe'::public.entry_type
  when type::text = 'abwesenheit' then 'abwesenheit'::public.entry_type
  else 'termin'::public.entry_type
end
where entry_type is null;

update public.events
set category = type::text::public.event_category
where category is null
  and type::text in ('arbeit', 'arzt', 'haushalt', 'freizeit', 'kind');

alter table public.events
alter column entry_type set default 'termin';

update public.events
set entry_type = 'termin'
where entry_type is null;

alter table public.events
alter column entry_type set not null;

-- Aufgaben ohne Erinnerung dürfen kein Datum haben
alter table public.events
alter column start_time drop not null;

comment on column public.events.entry_type is 'Termin, Aufgabe oder Abwesenheit';
comment on column public.events.category is 'Optionale inhaltliche Kategorie (Arbeit, Arzt, …)';

-- View aktualisieren
create or replace view public.events_with_creator as
select
  e.id,
  e.title,
  e.description,
  e.start_time,
  e.end_time,
  e.entry_type,
  e.category,
  e.creator_id,
  e.color_code,
  e.is_ai_suggested,
  e.created_at,
  e.updated_at,
  p.username as creator_username,
  p.avatar_url as creator_avatar_url
from public.events e
join public.profiles p on p.id = e.creator_id;

revoke all on public.events_with_creator from public;
grant select on public.events_with_creator to authenticated;
