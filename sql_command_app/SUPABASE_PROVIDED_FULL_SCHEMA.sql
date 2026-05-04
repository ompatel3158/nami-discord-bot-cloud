create table if not exists public.guild_settings (
  guild_id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id bigserial primary key,
  guild_id text not null,
  user_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_guild_user_created_idx
  on public.conversations (guild_id, user_id, created_at desc);

create table if not exists public.tts_usage_daily (
  usage_date date not null,
  scope text not null check (scope in ('global', 'guild', 'user')),
  scope_id text not null,
  request_count integer not null default 0,
  character_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usage_date, scope, scope_id)
);

create index if not exists tts_usage_daily_scope_idx
  on public.tts_usage_daily (scope, scope_id, usage_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists guild_settings_set_updated_at on public.guild_settings;
create trigger guild_settings_set_updated_at
before update on public.guild_settings
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

drop trigger if exists tts_usage_daily_set_updated_at on public.tts_usage_daily;
create trigger tts_usage_daily_set_updated_at
before update on public.tts_usage_daily
for each row execute function public.set_updated_at();

create or replace function public.track_tts_usage_limit(
  p_usage_date date,
  p_user_id text,
  p_guild_id text,
  p_characters integer,
  p_user_request_limit integer default null,
  p_user_character_limit integer default null,
  p_guild_request_limit integer default null,
  p_guild_character_limit integer default null,
  p_global_request_limit integer default null,
  p_global_character_limit integer default null
)
returns table (
  allowed boolean,
  reason text,
  usage_date text,
  user_request_count integer,
  user_character_count integer,
  guild_request_count integer,
  guild_character_count integer,
  global_request_count integer,
  global_character_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_date date := coalesce(p_usage_date, (now() at time zone 'utc')::date);
  v_characters integer := greatest(coalesce(p_characters, 0), 0);
  v_user public.tts_usage_daily%rowtype;
  v_guild public.tts_usage_daily%rowtype;
  v_global public.tts_usage_daily%rowtype;
  v_user_next_requests integer;
  v_user_next_characters integer;
  v_guild_next_requests integer;
  v_guild_next_characters integer;
  v_global_next_requests integer;
  v_global_next_characters integer;
begin
  if p_user_id is null or btrim(p_user_id) = '' then
    raise exception 'track_tts_usage_limit requires p_user_id';
  end if;

  if p_guild_id is null or btrim(p_guild_id) = '' then
    raise exception 'track_tts_usage_limit requires p_guild_id';
  end if;

  insert into public.tts_usage_daily (usage_date, scope, scope_id)
  values (v_usage_date, 'user', p_user_id)
  on conflict do nothing;

  insert into public.tts_usage_daily (usage_date, scope, scope_id)
  values (v_usage_date, 'guild', p_guild_id)
  on conflict do nothing;

  insert into public.tts_usage_daily (usage_date, scope, scope_id)
  values (v_usage_date, 'global', 'global')
  on conflict do nothing;

  select *
  into v_user
  from public.tts_usage_daily as d
  where d.usage_date = v_usage_date and d.scope = 'user' and d.scope_id = p_user_id
  for update;

  select *
  into v_guild
  from public.tts_usage_daily as d
  where d.usage_date = v_usage_date and d.scope = 'guild' and d.scope_id = p_guild_id
  for update;

  select *
  into v_global
  from public.tts_usage_daily as d
  where d.usage_date = v_usage_date and d.scope = 'global' and d.scope_id = 'global'
  for update;

  v_user_next_requests := v_user.request_count + 1;
  v_user_next_characters := v_user.character_count + v_characters;
  v_guild_next_requests := v_guild.request_count + 1;
  v_guild_next_characters := v_guild.character_count + v_characters;
  v_global_next_requests := v_global.request_count + 1;
  v_global_next_characters := v_global.character_count + v_characters;

  if p_user_request_limit is not null and v_user_next_requests > p_user_request_limit then
    return query
    select false,
      format('Daily user request limit reached (%s).', p_user_request_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

  if p_user_character_limit is not null and v_user_next_characters > p_user_character_limit then
    return query
    select false,
      format('Daily user character limit reached (%s).', p_user_character_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

  if p_guild_request_limit is not null and v_guild_next_requests > p_guild_request_limit then
    return query
    select false,
      format('Daily guild request limit reached (%s).', p_guild_request_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

  if p_guild_character_limit is not null and v_guild_next_characters > p_guild_character_limit then
    return query
    select false,
      format('Daily guild character limit reached (%s).', p_guild_character_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

  if p_global_request_limit is not null and v_global_next_requests > p_global_request_limit then
    return query
    select false,
      format('Daily global request limit reached (%s).', p_global_request_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

  if p_global_character_limit is not null and v_global_next_characters > p_global_character_limit then
    return query
    select false,
      format('Daily global character limit reached (%s).', p_global_character_limit),
      v_usage_date::text,
      v_user.request_count,
      v_user.character_count,
      v_guild.request_count,
      v_guild.character_count,
      v_global.request_count,
      v_global.character_count;
    return;
  end if;

    update public.tts_usage_daily as d
  set request_count = v_user_next_requests,
      character_count = v_user_next_characters
    where d.usage_date = v_usage_date and d.scope = 'user' and d.scope_id = p_user_id;

    update public.tts_usage_daily as d
  set request_count = v_guild_next_requests,
      character_count = v_guild_next_characters
    where d.usage_date = v_usage_date and d.scope = 'guild' and d.scope_id = p_guild_id;

    update public.tts_usage_daily as d
  set request_count = v_global_next_requests,
      character_count = v_global_next_characters
    where d.usage_date = v_usage_date and d.scope = 'global' and d.scope_id = 'global';

  return query
  select true,
    null::text,
    v_usage_date::text,
    v_user_next_requests,
    v_user_next_characters,
    v_guild_next_requests,
    v_guild_next_characters,
    v_global_next_requests,
    v_global_next_characters;
end;
$$;

alter table public.guild_settings enable row level security;
alter table public.user_preferences enable row level security;
alter table public.conversations enable row level security;
alter table public.tts_usage_daily enable row level security;
