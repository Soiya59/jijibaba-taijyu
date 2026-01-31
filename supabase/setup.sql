-- Supabase 初期設定 SQL（このままSQL Editorに貼り付けて実行OK）
--
-- 本アプリが参照するテーブル/カラム（.tsx と完全一致させることが重要）:
-- - profiles: "user"(PK), points, goal_weight, final_goal_weight
-- - weights: 体重記録（"user", weight, recorded_at）
-- - period_goals: 期間目標（"user", start_date, end_date, target_weight）
-- - quests / rewards / wishes: 共通（シェア）する「リスト」本体
-- - quest_history / reward_history: ポイント獲得/消費の履歴（"user" で個別管理）
--
-- 注意:
-- - uuid の自動生成に gen_random_uuid()（pgcrypto）を使用します。
-- - "user" はSQLキーワードに近いため、DDLでは "user" として明示します（カラム名自体は user です）。

create extension if not exists pgcrypto;

-- =========================================================
-- 既存テーブルとの衝突回避（重要）
-- =========================================================
-- Supabaseテンプレート等で public.profiles が別物（id など）として存在することがあります。
-- 本アプリは text の "user" カラムを前提にしているため、別定義の場合は *_legacy_* に退避します。
do $$
declare
  new_name text;
  has_user_col boolean;
begin
  -- profiles: "user" カラムが無ければ別物として退避
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'user'
    ) into has_user_col;

    if not has_user_col then
      new_name :=
        'profiles_legacy_' ||
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
        '_' ||
        floor(random() * 1000000)::int;
      execute format('alter table public.profiles rename to %I', new_name);
    end if;
  end if;

  -- weights: 必須カラムが無ければ別物として退避
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'weights'
  ) and (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weights'
      and column_name in ('user', 'weight', 'recorded_at')
  ) < 3 then
    new_name :=
      'weights_legacy_' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
      '_' ||
      floor(random() * 1000000)::int;
    execute format('alter table public.weights rename to %I', new_name);
  end if;
end $$;

-- =========================================================
-- profiles
-- =========================================================
create table if not exists public.profiles (
  "user" text not null,
  points integer not null default 0,
  goal_weight numeric,
  final_goal_weight numeric
);

-- 既存テーブルからの段階的アップグレード用（列が無い環境でも安全に追加）
alter table public.profiles add column if not exists points integer;
alter table public.profiles add column if not exists goal_weight numeric;
alter table public.profiles add column if not exists final_goal_weight numeric;

-- points のデフォルト/チェック（既存環境でもできるだけ安全に）
update public.profiles set points = 0 where points is null;
alter table public.profiles alter column points set default 0;
alter table public.profiles alter column points set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_points_nonnegative'
  ) then
    alter table public.profiles
      add constraint profiles_points_nonnegative check (points >= 0);
  end if;
end $$;

-- "user"（text / PK）: upsert(onConflict: "user") のために必須
do $$
declare
  idx_oid oid;
begin
  select c.oid into idx_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jijibaba_profiles_user_pk_idx'
    and c.relkind = 'i';

  if idx_oid is not null and not exists (
    select 1
    from pg_index i
    where i.indexrelid = idx_oid
      and i.indrelid = 'public.profiles'::regclass
  ) then
    alter index public.jijibaba_profiles_user_pk_idx rename to jijibaba_profiles_user_pk_idx_legacy;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_profiles_user_pk_idx on public.profiles ("user");
    alter table public.profiles
      add constraint jijibaba_profiles_user_pkey primary key using index jijibaba_profiles_user_pk_idx;
  end if;
end $$;

-- 初期データ（じぃじ・ばぁば）
insert into public.profiles ("user", points, goal_weight, final_goal_weight)
values
  ('じぃじ', 0, 68, null),
  ('ばぁば', 0, 68, null)
on conflict ("user") do update
set
  -- 既に運用している場合に points を 0 に戻さない
  points = public.profiles.points,
  goal_weight = coalesce(public.profiles.goal_weight, excluded.goal_weight),
  final_goal_weight = coalesce(public.profiles.final_goal_weight, excluded.final_goal_weight);

-- =========================================================
-- weights（体重記録）
-- =========================================================
create table if not exists public.weights (
  id uuid not null default gen_random_uuid(),
  "user" text not null references public.profiles ("user") on delete cascade,
  weight numeric not null,
  recorded_at date not null
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weights'::regclass
      and conname = 'weights_weight_positive'
  ) then
    alter table public.weights
      add constraint weights_weight_positive check (weight > 0);
  end if;
end $$;

-- id（uuid / PK）
do $$
declare
  idx_oid oid;
begin
  select c.oid into idx_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jijibaba_weights_id_pk_idx'
    and c.relkind = 'i';

  if idx_oid is not null and not exists (
    select 1
    from pg_index i
    where i.indexrelid = idx_oid
      and i.indrelid = 'public.weights'::regclass
  ) then
    alter index public.jijibaba_weights_id_pk_idx rename to jijibaba_weights_id_pk_idx_legacy;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.weights'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_weights_id_pk_idx on public.weights (id);
    alter table public.weights
      add constraint jijibaba_weights_id_pkey primary key using index jijibaba_weights_id_pk_idx;
  end if;
end $$;

-- upsert 用 UNIQUE（同一 user + 同一 recorded_at を一意にする）
do $$
declare
  idx_oid oid;
begin
  select c.oid into idx_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jijibaba_weights_user_recorded_at_uk_idx'
    and c.relkind = 'i';

  if idx_oid is not null and not exists (
    select 1
    from pg_index i
    where i.indexrelid = idx_oid
      and i.indrelid = 'public.weights'::regclass
  ) then
    alter index public.jijibaba_weights_user_recorded_at_uk_idx rename to jijibaba_weights_user_recorded_at_uk_idx_legacy;
  end if;

  create unique index if not exists jijibaba_weights_user_recorded_at_uk_idx
    on public.weights ("user", recorded_at);
end $$;

-- よく使う検索（user + 日付）
create index if not exists weights_user_recorded_at_idx on public.weights ("user", recorded_at);

-- =========================================================
-- period_goals（期間目標）
-- =========================================================
-- 「いつから（start_date）いつまで（end_date）」の期間と、その期間の目標体重（target_weight）を保存します。
create table if not exists public.period_goals (
  id uuid not null default gen_random_uuid(),
  "user" text not null references public.profiles ("user") on delete cascade,
  start_date date not null,
  end_date date not null,
  target_weight numeric,
  created_at timestamptz not null default now()
);

-- =========================================================
-- quests（クエスト一覧・共通）
-- =========================================================
-- じぃじ/ばぁばで「リスト」は共通（シェア）し、獲得ポイントは quest_history / profiles に "user" で個別に反映します。
do $$
declare
  new_name text;
  has_user_col boolean;
begin
  -- 既存の quests が user 依存の定義なら退避（共通テーブルとして再定義するため）
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'quests'
  ) then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'quests' and column_name = 'user'
    ) into has_user_col;

    if has_user_col then
      new_name :=
        'quests_legacy_' ||
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
        '_' ||
        floor(random() * 1000000)::int;
      execute format('alter table public.quests rename to %I', new_name);
    end if;
  end if;
end $$;

create table if not exists public.quests (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text not null default '',
  points integer not null,
  icon text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quests'::regclass
      and conname = 'quests_points_nonnegative'
  ) then
    alter table public.quests
      add constraint quests_points_nonnegative check (points >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quests'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_quests_id_pk_idx on public.quests (id);
    alter table public.quests
      add constraint jijibaba_quests_id_pkey primary key using index jijibaba_quests_id_pk_idx;
  end if;
end $$;

create index if not exists quests_created_at_idx on public.quests (created_at);

-- 初期データ（共通クエスト）
-- 冪等性のため、同一 (title, points, icon) が存在する場合は追加しません。
insert into public.quests (title, description, points, icon)
select v.title, v.description, v.points, v.icon
from (
  values
    ('朝の散歩', '30分以上歩く', 50, 'walk'),
    ('お酒を控えた', '今日はお酒なし', 100, 'alcohol'),
    ('野菜を食べた', '3種類以上の野菜', 30, 'food'),
    ('ストレッチ', '5分間のストレッチ', 20, 'exercise'),
    ('間食を控えた', 'おやつなしで過ごす', 80, 'food'),
    ('早寝', '22時前に就寝', 50, 'sleep')
) as v(title, description, points, icon)
where not exists (
  select 1
  from public.quests q
  where q.title = v.title and q.points = v.points and q.icon = v.icon
);

-- =========================================================
-- rewards（ご褒美一覧・共通）
-- =========================================================
-- じぃじ/ばぁばで「リスト」は共通（シェア）し、消費ポイントは reward_history / profiles に "user" で個別に反映します。
do $$
declare
  new_name text;
  has_user_col boolean;
begin
  -- 既存の rewards が user 依存の定義なら退避（共通テーブルとして再定義するため）
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'rewards'
  ) then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'rewards' and column_name = 'user'
    ) into has_user_col;

    if has_user_col then
      new_name :=
        'rewards_legacy_' ||
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
        '_' ||
        floor(random() * 1000000)::int;
      execute format('alter table public.rewards rename to %I', new_name);
    end if;
  end if;
end $$;

create table if not exists public.rewards (
  id uuid not null default gen_random_uuid(),
  title text not null,
  cost integer not null,
  icon text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rewards'::regclass
      and conname = 'rewards_cost_nonnegative'
  ) then
    alter table public.rewards
      add constraint rewards_cost_nonnegative check (cost >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.rewards'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_rewards_id_pk_idx on public.rewards (id);
    alter table public.rewards
      add constraint jijibaba_rewards_id_pkey primary key using index jijibaba_rewards_id_pk_idx;
  end if;
end $$;

create index if not exists rewards_created_at_idx on public.rewards (created_at);

-- 初期データ（共通ご褒美）
-- 冪等性のため、同一 (title, cost, icon) が存在する場合は追加しません。
insert into public.rewards (title, cost, icon)
select v.title, v.cost, v.icon
from (
  values
    ('ビール1本', 100, 'beer'),
    ('お菓子', 80, 'snack'),
    ('孫と電話', 50, 'call'),
    ('コーヒータイム', 30, 'coffee'),
    ('テレビ1時間', 60, 'tv'),
    ('お買い物', 200, 'shopping')
) as v(title, cost, icon)
where not exists (
  select 1
  from public.rewards r
  where r.title = v.title and r.cost = v.cost and r.icon = v.icon
);

-- 既存環境（start_at/end_at/goal_weight）からの移行
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'start_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'start_date'
  ) then
    execute 'alter table public.period_goals rename column start_at to start_date';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'end_at'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'end_date'
  ) then
    execute 'alter table public.period_goals rename column end_at to end_date';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'goal_weight'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'period_goals' and column_name = 'target_weight'
  ) then
    execute 'alter table public.period_goals rename column goal_weight to target_weight';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.period_goals'::regclass
      and conname = 'period_goals_start_before_end'
  ) then
    alter table public.period_goals
      add constraint period_goals_start_before_end check (start_date <= end_date);
  end if;
end $$;

-- period_goals.id（PK）
do $$
declare
  idx_oid oid;
begin
  select c.oid into idx_oid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jijibaba_period_goals_id_pk_idx'
    and c.relkind = 'i';

  if idx_oid is not null and not exists (
    select 1
    from pg_index i
    where i.indexrelid = idx_oid
      and i.indrelid = 'public.period_goals'::regclass
  ) then
    alter index public.jijibaba_period_goals_id_pk_idx rename to jijibaba_period_goals_id_pk_idx_legacy;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.period_goals'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_period_goals_id_pk_idx on public.period_goals (id);
    alter table public.period_goals
      add constraint jijibaba_period_goals_id_pkey primary key using index jijibaba_period_goals_id_pk_idx;
  end if;
end $$;

-- upsert 用 UNIQUE（同一 user + 同一 start_date + 同一 end_date を一意にする）
create unique index if not exists jijibaba_period_goals_user_range_uk_idx_v2
  on public.period_goals ("user", start_date, end_date);

create index if not exists period_goals_user_start_date_idx on public.period_goals ("user", start_date);

-- =========================================================
-- quest_history（クエスト履歴）
-- =========================================================
create table if not exists public.quest_history (
  id uuid not null default gen_random_uuid(),
  "user" text not null references public.profiles ("user") on delete cascade,
  title text not null,
  points integer not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.quest_history'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_quest_history_id_pk_idx on public.quest_history (id);
    alter table public.quest_history
      add constraint jijibaba_quest_history_id_pkey primary key using index jijibaba_quest_history_id_pk_idx;
  end if;
end $$;

create index if not exists quest_history_user_created_at_idx on public.quest_history ("user", created_at);

-- =========================================================
-- reward_history（ごほうび履歴）
-- =========================================================
create table if not exists public.reward_history (
  id uuid not null default gen_random_uuid(),
  "user" text not null references public.profiles ("user") on delete cascade,
  title text not null,
  cost integer not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reward_history'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_reward_history_id_pk_idx on public.reward_history (id);
    alter table public.reward_history
      add constraint jijibaba_reward_history_id_pkey primary key using index jijibaba_reward_history_id_pk_idx;
  end if;
end $$;

create index if not exists reward_history_user_created_at_idx on public.reward_history ("user", created_at);

-- =========================================================
-- wishes（やりたいことリスト）
-- =========================================================
-- じぃじ/ばぁばで「リスト」は共通（シェア）します（user 依存カラムは持ちません）。
do $$
declare
  new_name text;
  has_user_col boolean;
begin
  -- 既存 wishes が user 依存なら退避（共通テーブルとして再定義するため）
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wishes'
  ) then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public' and table_name = 'wishes' and column_name = 'user'
    ) into has_user_col;

    if has_user_col then
      new_name :=
        'wishes_legacy_' ||
        to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') ||
        '_' ||
        floor(random() * 1000000)::int;
      execute format('alter table public.wishes rename to %I', new_name);
    end if;
  end if;
end $$;

create table if not exists public.wishes (
  id uuid not null default gen_random_uuid(),
  icon text not null default '⭐',
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.wishes'::regclass
      and contype = 'p'
  ) then
    create unique index if not exists jijibaba_wishes_id_pk_idx on public.wishes (id);
    alter table public.wishes
      add constraint jijibaba_wishes_id_pkey primary key using index jijibaba_wishes_id_pk_idx;
  end if;
end $$;

create index if not exists wishes_created_at_idx on public.wishes (created_at);

-- 旧 wishes（user 依存）から可能な範囲で移行（2人分の重複を吸収）
do $$
declare
  legacy regclass;
begin
  -- 直近の wishes_legacy_* を探す（無ければ何もしない）
  select to_regclass(n.nspname || '.' || c.relname)
  into legacy
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname like 'wishes_legacy_%'
    and c.relkind = 'r'
  order by c.relname desc
  limit 1;

  if legacy is not null then
    execute format($sql$
      insert into public.wishes (icon, title, completed, created_at)
      select
        x.icon,
        x.title,
        x.completed,
        x.created_at
      from (
        select
          coalesce(nullif(icon, ''), '⭐') as icon,
          title,
          bool_or(coalesce(completed, false)) as completed,
          min(created_at) as created_at
        from %s
        where title is not null and length(trim(title)) > 0
        group by coalesce(nullif(icon, ''), '⭐'), title
      ) x
      where not exists (
        select 1 from public.wishes w
        where w.title = x.title and w.icon = x.icon
      )
    $sql$, legacy);
  end if;
end $$;

-- 初期データ（共通やりたいことリスト）
-- 冪等性のため、同一 (title, icon) が存在する場合は追加しません。
insert into public.wishes (icon, title, completed)
select v.icon, v.title, false
from (
  values
    ('👔', '昔のスーツを着る'),
    ('✈️', '旅行に行く'),
    ('📸', '家族写真を撮る'),
    ('⛰️', '山登りをする')
) as v(icon, title)
where not exists (
  select 1
  from public.wishes w
  where w.title = v.title and w.icon = v.icon
);

