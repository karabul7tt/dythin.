-- ============================================================
-- DYTHIN. — Kurulum, Güvenlik, Ad Soyad & Tam Hesap Silme SQL (V9)
-- Supabase Dashboard > SQL Editor'de yapıştırıp "RUN" yapın.
-- ============================================================

-- ── 1. ÖNCE TABLOLARI OLUŞTUR VEYA KONTROL ET ─────────────────

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text,
  full_name text,
  avatar_url text,
  push_token text,
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

create table if not exists public.reports (
  id           uuid default gen_random_uuid() primary key,
  reporter_id  uuid references auth.users on delete cascade not null,
  post_id      uuid references posts on delete cascade,
  reason       text not null,
  created_at   timestamptz default now()
);

create table if not exists public.blocked_users (
  id          uuid default gen_random_uuid() primary key,
  blocker_id  uuid references auth.users on delete cascade not null,
  blocked_id  uuid references auth.users on delete cascade not null,
  created_at  timestamptz default now(),
  unique(blocker_id, blocked_id)
);


-- ── 2. MEVCUT TABLOLARA YENİ KOLONLAR VE BENZERSİZLİK ─────────

alter table if exists public.profiles add column if not exists full_name text;
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists role text default 'user';
alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles add constraint profiles_role_check check (role in ('user', 'admin', 'banned'));
alter table if exists public.profiles add column if not exists updated_at timestamptz default now();

-- Reports tablosundaki post_id zorunluluğunu ve benzersizlik kısıtlamasını kaldır
alter table if exists public.reports alter column post_id drop not null;
alter table if exists public.reports drop constraint if exists reports_reporter_id_post_id_key;

alter table if exists public.posts add column if not exists image_b_url text;
alter table if exists public.posts add column if not exists expires_at timestamptz;
alter table if exists public.posts add column if not exists category text default 'kombin';

alter table if exists public.votes add column if not exists selected_option text check (selected_option in ('A', 'B'));
alter table if exists public.votes add column if not exists comment text;

-- Çift oy kullanmayı engelleyen kısıtlama
alter table public.votes drop constraint if exists unique_voter_post;
alter table public.votes add constraint unique_voter_post unique (voter_id, post_id);


-- ── 3. ADMİN YARDIMCI FONKSİYONU ──────────────────────────────

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id and (
      role = 'admin'
      or lower(coalesce(username, '')) = 'mehmetkarabul7tt'
      or lower(coalesce(email, '')) = 'mehmetkarabul7tt@gmail.com'
    )
  );
$$;


-- ── 4. RLS (ROW LEVEL SECURITY) SUNUCU İZİN KURALLARI ─────────

alter table public.posts enable row level security;
alter table public.votes enable row level security;
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;

-- Posts İzin Kuralları
drop policy if exists "Herkes gönderileri görebilir" on public.posts;
create policy "Herkes gönderileri görebilir"
  on public.posts for select using (true);

drop policy if exists "Kullanıcılar gönderi oluşturabilir" on public.posts;
create policy "Kullanıcılar gönderi oluşturabilir"
  on public.posts for insert with check (auth.uid() = user_id);

drop policy if exists "Kullanıcı kendi gönderisini silebilir" on public.posts;
create policy "Kullanıcı kendi gönderisini silebilir"
  on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "Admin tüm gönderileri silebilir" on public.posts;
create policy "Admin tüm gönderileri silebilir"
  on public.posts for delete using (public.is_admin(auth.uid()));

-- Votes İzin Kuralları
drop policy if exists "Herkes oyları görebilir" on public.votes;
create policy "Herkes oyları görebilir"
  on public.votes for select using (true);

drop policy if exists "Kullanıcılar oy verebilir" on public.votes;
create policy "Kullanıcılar oy verebilir"
  on public.votes for insert with check (auth.uid() = voter_id);

drop policy if exists "Kullanıcılar oylarını güncelleyebilir" on public.votes;
create policy "Kullanıcılar oylarını güncelleyebilir"
  on public.votes for update using (auth.uid() = voter_id);

-- Profiles İzin Kuralları
drop policy if exists "Herkes profilleri görebilir" on public.profiles;
create policy "Herkes profilleri görebilir"
  on public.profiles for select using (true);

drop policy if exists "Kullanıcı kendi profilini güncelleyebilir" on public.profiles;
create policy "Kullanıcı kendi profilini güncelleyebilir"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Admin profilleri güncelleyebilir" on public.profiles;
create policy "Admin profilleri güncelleyebilir"
  on public.profiles for update using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.profiles where id = auth.uid() and lower(username) = 'mehmetkarabul7tt'
    )
  );

drop policy if exists "Kullanıcı profil ekleyebilir" on public.profiles;
create policy "Kullanıcı profil ekleyebilir"
  on public.profiles for insert with check (true);

-- Reports İzin Kuralları
drop policy if exists "Kullanıcılar şikayet oluşturabilir" on public.reports;
create policy "Kullanıcılar şikayet oluşturabilir"
  on public.reports for insert with check (auth.uid() = reporter_id);

drop policy if exists "Kullanıcılar kendi şikayetlerini görebilir" on public.reports;
create policy "Kullanıcılar kendi şikayetlerini görebilir"
  on public.reports for select using (true);

drop policy if exists "Admin tüm şikayetleri görebilir" on public.reports;
create policy "Admin tüm şikayetleri görebilir"
  on public.reports for select using (true);

-- Blocked Users İzin Kuralları
drop policy if exists "Kullanıcılar engelleme yapabilir" on public.blocked_users;
create policy "Kullanıcılar engelleme yapabilir"
  on blocked_users for insert with check (auth.uid() = blocker_id);

drop policy if exists "Kullanıcılar kendi engellediklerini görebilir" on public.blocked_users;
create policy "Kullanıcılar kendi engellediklerini görebilir"
  on blocked_users for select using (auth.uid() = blocker_id);

drop policy if exists "Kullanıcılar engeli kaldırabilir" on public.blocked_users;
create policy "Kullanıcılar engeli kaldırabilir"
  on blocked_users for delete using (auth.uid() = blocker_id);


-- ── 5. KULLANICI HESABINI KALICI VE TAMAMEN SİLME FONKSİYONU ───

create or replace function public.delete_user_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Oturum açmış kullanıcı bulunamadı.';
  end if;

  -- 1. Kullanıcının tüm oylarını sil
  delete from public.votes where voter_id = current_user_id;

  -- 2. Kullanıcının tüm gönderilerini sil
  delete from public.posts where user_id = current_user_id;

  -- 3. Kullanıcının tüm arkadaşlıklarını sil
  delete from public.friendships where requester_id = current_user_id or receiver_id = current_user_id;

  -- 4. Kullanıcının tüm şikayet ve engel kayıtlarını sil
  delete from public.reports where reporter_id = current_user_id;
  delete from public.blocked_users where blocker_id = current_user_id or blocked_id = current_user_id;

  -- 5. Profil verisini sil
  delete from public.profiles where id = current_user_id;

  -- 6. Supabase Auth kullanıcısını sistemden tamamen sil
  delete from auth.users where id = current_user_id;
end;
$$;


-- ── 6. SUNUCU TARAFLI YETKİLENDİRME (SERVER-SIDE AUTHORIZATION) ───

create or replace function public.check_vote_validity()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  post_owner uuid;
begin
  select user_id into post_owner from public.posts where id = new.post_id;
  if post_owner = new.voter_id then
    raise exception 'Kendi gönderinize oy veremezsiniz!';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_vote on public.votes;
create trigger prevent_self_vote
  before insert on public.votes
  for each row execute procedure public.check_vote_validity();


-- ── 7. YENİ KULLANICI OLUŞTURMA TETİKLEYİCİSİ ───────────────

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    null,
    'user'
  )
  on conflict (id) do update
  set username = coalesce(excluded.username, profiles.username),
      full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
exception
  when others then
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── 8. SÜRESİ DOLAN POSTLARI VE ENGELLERİ FİLTRELEYEN VİEW ───

create or replace view public.active_posts as
select *
from public.posts
where is_active = true
  and (expires_at is null or expires_at > now());


-- ── 9. GÜVENLİ VE HİYERARŞİK ADMİN / KULLANICI ROL YÖNETİMİ ──

create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns jsonb
language plpgsql
security definer set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_user text;
  caller_email text;
  target_user text;
  target_email text;
  is_caller_super boolean := false;
  is_caller_admin boolean := false;
begin
  if caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim');
  end if;

  select coalesce(role, 'user'), lower(coalesce(username, '')), lower(coalesce(email, ''))
  into caller_role, caller_user, caller_email
  from public.profiles where id = caller_id;

  select lower(coalesce(username, '')), lower(coalesce(email, ''))
  into target_user, target_email
  from public.profiles where id = target_user_id;

  -- Kurucu (Super Admin) kontrolü (kullanıcı adı veya email mehmetkarabul7tt)
  if caller_user = 'mehmetkarabul7tt' or caller_email = 'mehmetkarabul7tt@gmail.com' then
    is_caller_super := true;
    is_caller_admin := true;
  end if;

  -- Admin kontrolü (veritabanı rolü veya reports logundaki en son promote)
  if caller_role = 'admin' or exists (
    select 1 from public.reports 
    where reason like 'ADMIN_ACTION:PROMOTE_ADMIN:' || caller_id || ':%'
  ) then
    is_caller_admin := true;
  end if;

  -- Yalnızca kurucu veya admin yetkisine sahip kullanıcılar işlem yapabilir
  if not is_caller_admin then
    return jsonb_build_object('success', false, 'error', 'Yönetici yetkisi gerekli');
  end if;

  -- Ana kurucu yöneticinin yetkisi kaldırılamaz veya banlanamaz
  if target_user = 'mehmetkarabul7tt' or target_email = 'mehmetkarabul7tt@gmail.com' then
    return jsonb_build_object('success', false, 'error', 'Ana yöneticinin rolü değiştirilemez veya banlanamaz');
  end if;

  -- Başka bir kullanıcıya admin yetkisi vermeyi veya admin yetkisini kaldırmayı yalnızca kurucu yönetici (mehmetkarabul7tt) yapabilir
  if (new_role = 'admin' or target_user_id in (select id from public.profiles where role = 'admin')) and not is_caller_super then
    return jsonb_build_object('success', false, 'error', 'Yalnızca kurucu ana yönetici admin yetkilerini değiştirebilir');
  end if;

  -- Hedef kullanıcının rolünü güncelle
  update public.profiles set role = new_role where id = target_user_id;

  -- Eğer banlandıysa gönderilerini inaktif et, unban edildiyse aktif et
  if new_role = 'banned' then
    update public.posts set is_active = false where user_id = target_user_id;
  elsif new_role = 'user' then
    update public.posts set is_active = true where user_id = target_user_id;
  end if;

  return jsonb_build_object('success', true, 'new_role', new_role);
end;
$$;
