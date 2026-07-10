-- Erweiterte Event-Typen für Shared Life Management
alter type public.event_type add value if not exists 'arbeit';
alter type public.event_type add value if not exists 'arzt';
alter type public.event_type add value if not exists 'haushalt';
alter type public.event_type add value if not exists 'freizeit';
alter type public.event_type add value if not exists 'kind';

-- color_code automatisch aus dem Profil des Erstellers setzen
create or replace function public.set_event_color_from_profile()
returns trigger
language plpgsql
as $$
begin
  select p.color_code
  into new.color_code
  from public.profiles p
  where p.id = new.creator_id;

  if new.color_code is null then
    new.color_code := '#6B4EAA';
  end if;

  return new;
end;
$$;

drop trigger if exists events_set_color_from_profile on public.events;

create trigger events_set_color_from_profile
before insert on public.events
for each row
execute function public.set_event_color_from_profile();
