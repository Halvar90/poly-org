-- is_ai_suggested für KI-Vorschläge in der Kalender-Ansicht
alter table public.events
add column if not exists is_ai_suggested boolean not null default false;

comment on column public.events.is_ai_suggested is
  'True, wenn der Termin von der KI vorgeschlagen wurde';

-- View aktualisieren
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
  e.is_ai_suggested,
  e.created_at,
  e.updated_at,
  p.username as creator_username,
  p.avatar_url as creator_avatar_url
from public.events e
join public.profiles p on p.id = e.creator_id;

revoke all on public.events_with_creator from public;
grant select on public.events_with_creator to authenticated;
