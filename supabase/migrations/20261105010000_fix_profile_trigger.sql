create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = case
          when public.profiles.full_name = '' then excluded.full_name
          else public.profiles.full_name
        end,
        phone = coalesce(public.profiles.phone, excluded.phone),
        updated_at = now();
  return new;
end;
$$;

insert into public.profiles (id, email, full_name, phone)
select
  users.id,
  coalesce(users.email, ''),
  coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name', ''),
  users.raw_user_meta_data ->> 'phone'
from auth.users as users
on conflict (id) do update
  set email = excluded.email,
      full_name = case
        when public.profiles.full_name = '' then excluded.full_name
        else public.profiles.full_name
      end,
      phone = coalesce(public.profiles.phone, excluded.phone),
      updated_at = now();