-- ============================================================
-- DYTHIN. — Dinamik ve Gerçekçi Bot Üretici & Kalıcı Silici (V2)
-- Supabase Dashboard > SQL Editor alanına yapıştırıp "RUN" yapın.
-- ============================================================

-- ── 1. HER SEFERİNDE FARKLI VE DOĞAL BOTLAR / GÖNDERİLER ÜRETEN FONKSİYON ──
create or replace function public.seed_bots_and_posts()
returns text
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  v_dummy_pw text := crypt('DythinBotPass2026!', gen_salt('bf'));
  v_bot_record record;
  v_post_record record;
  v_post_id uuid;
  v_bot_ids uuid[] := '{}';
  v_voter_id uuid;
  v_option text;
  v_comment text;
  v_post_idx integer := 0;
begin
  -- 1. Gerçekçi, Doğal Portre ve İsim Havuzundan Rastgele 8-12 Yeni Bot Seç ve Oluştur
  create temp table tmp_bot_pool (
    username text,
    full_name text,
    avatar_url text
  ) on commit drop;

  insert into tmp_bot_pool (username, full_name, avatar_url) values
    ('mina.style', 'Mina Yılmaz', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80'),
    ('arda_kombin', 'Arda Şahin', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&auto=format&fit=crop&q=80'),
    ('selin.look', 'Selin Kaya', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80'),
    ('kaan_fits', 'Kaan Çelik', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80'),
    ('ceren_vogue', 'Ceren Aksoy', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'),
    ('emre_urban', 'Emre Demir', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80'),
    ('buse.wear', 'Buse Kurt', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=80'),
    ('yigit.fits', 'Yiğit Arslan', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80'),
    ('damla_look', 'Damla Aydın', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&auto=format&fit=crop&q=80'),
    ('tolga_st', 'Tolga Yıldız', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80'),
    ('oyku.style', 'Öykü Koç', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=80'),
    ('alp_fits', 'Alp Özdemir', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&auto=format&fit=crop&q=80'),
    ('melis.outfit', 'Melis Tan', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=500&auto=format&fit=crop&q=80'),
    ('berk_wear', 'Berk Güneş', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=500&auto=format&fit=crop&q=80'),
    ('hazal.style', 'Hazal Erdem', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=500&auto=format&fit=crop&q=80');

  -- Rastgele 8 bot seçip veritabanına ekle
  for v_bot_record in (
    select username, full_name, avatar_url 
    from tmp_bot_pool 
    order by random() 
    limit 8
  ) loop
    declare
      v_new_id uuid := gen_random_uuid();
      v_unique_username text := v_bot_record.username || '_' || floor(random() * 900 + 100)::int;
      v_bot_email text := v_unique_username || '@dythin.internal';
    begin
      -- 1. auth.users kaydı
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
        v_bot_email, v_dummy_pw, now(),
        '{"provider":"email","providers":["email"]}',
        json_build_object('username', v_unique_username, 'full_name', v_bot_record.full_name),
        now(), now()
      );

      -- 2. profiles kaydı
      insert into public.profiles (id, username, full_name, avatar_url, role, created_at)
      values (
        v_new_id, v_unique_username, v_bot_record.full_name, v_bot_record.avatar_url, 'user', now()
      )
      on conflict (id) do update set
        username = excluded.username,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url;

      v_bot_ids := array_append(v_bot_ids, v_new_id);
    end;
  end loop;

  -- 2. Doğal Sokak & Günlük Kombin Gönderileri Havuzu
  create temp table tmp_outfit_pool (
    title text,
    description text,
    image_a text,
    image_b text
  ) on commit drop;

  insert into tmp_outfit_pool (title, description, image_a, image_b) values
    (
      'Akşam kahveye hangisi?',
      'Oversize bomber ceket mi yoksa siyah deri mont mu?',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Ayna selfiesi 1 mi 2 mi?',
      'Krem triko pantolon kombini vs siyah blazer tarzı',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Casual cuma kombini',
      'Beyaz sneaker & jean mi, keten pantolon & gömlek mi?',
      'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Konser için hangisi?',
      'Deri ceket sokak tarzı mı yoksa crop ceket mi?',
      'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Hafta sonu gezisi için hangisi?',
      'Rahat jogger kombini vs oversize trençkot',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Sneakers mı Loafers mı?',
      'Gün boyu ayakta olacağım hangisi daha tarz durur?',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Ofis için casual şık hangisi?',
      'Bej kumaş pantolon & blazer vs camel kaban',
      'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800&auto=format&fit=crop&q=80'
    ),
    (
      'Sokak tarzı 1 mi 2 mi?',
      'Kargo pantolon & hoodie vs vintage ceket',
      'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&auto=format&fit=crop&q=80'
    );

  -- Rastgele 4-6 farklı gönderi oluştur
  for v_post_record in (
    select title, description, image_a, image_b 
    from tmp_outfit_pool 
    order by random() 
    limit 5
  ) loop
    v_post_idx := v_post_idx + 1;
    v_post_id := gen_random_uuid();
    
    -- Gönderiyi rastgele bir botun adına oluştur
    insert into public.posts (
      id, user_id, title, description, image_url, image_a_url, image_b_url,
      category, audience, is_active, voter_count, created_at, expires_at
    )
    values (
      v_post_id,
      v_bot_ids[(v_post_idx % array_length(v_bot_ids, 1)) + 1],
      v_post_record.title,
      v_post_record.description,
      v_post_record.image_a,
      v_post_record.image_a,
      v_post_record.image_b,
      'outfit',
      'public',
      true,
      floor(random() * 10 + 5)::int,
      now() - (v_post_idx * interval '15 minutes'),
      now() + interval '30 days'
    );

    -- Bu gönderiye diğer botların gerçekçi oylar ve yorumlar bırakması
    for i in 1..array_length(v_bot_ids, 1) loop
      v_voter_id := v_bot_ids[i];
      -- Kendi gönderisine oy vermemesi kontrolü
      if v_voter_id != v_bot_ids[(v_post_idx % array_length(v_bot_ids, 1)) + 1] and random() > 0.3 then
        v_option := case when random() > 0.5 then 'A' else 'B' end;
        v_comment := case (floor(random() * 7)::int)
          when 0 then 'A seçeneği çok daha temiz ve tarz durmuş.'
          when 1 then 'Kesinlikle B diyorum, renk uyumu harika.'
          when 2 then '1 numara çok daha modern duruyor.'
          when 3 then 'B kombinindeki detaylar çok şık.'
          when 4 then 'A bence her ortama yakışır.'
          when 5 then 'Net 2 numara!'
          else null
        end;

        insert into public.votes (post_id, voter_id, value, selected_option, comment, created_at)
        values (
          v_post_id,
          v_voter_id,
          true,
          v_option,
          v_comment,
          now() - (floor(random() * 20 + 2)::int * interval '1 minute')
        )
        on conflict (voter_id, post_id) do nothing;
      end if;
    end loop;
  end loop;

  return 'Başarıyla yeni ve benzersiz botlar, gerçekçi kombin gönderileri ve yorumlar oluşturuldu.';
end;
$$;


-- ── 2. TÜM BOTLARI VE VERİLERİNİ SIFIRLAYIP YER AÇAN FONKSİYON ──
create or replace function public.clear_all_bots()
returns text
language plpgsql
security definer set search_path = public, auth
as $$
declare
  v_deleted_count integer := 0;
begin
  -- 1. Botların verdiği oyları ve bot gönderilerine gelen tüm oyları sil
  delete from public.votes 
  where voter_id in (select id from auth.users where email like '%@dythin.internal')
     or post_id in (select id from public.posts where user_id in (select id from auth.users where email like '%@dythin.internal'))
     or voter_id::text like 'b0000000%'
     or post_id::text like 'c0000000%';

  -- 2. Botlara ait tüm gönderileri sil
  delete from public.posts 
  where user_id in (select id from auth.users where email like '%@dythin.internal')
     or user_id::text like 'b0000000%'
     or id::text like 'c0000000%';

  -- 3. Bot profillerini sil
  delete from public.profiles 
  where id in (select id from auth.users where email like '%@dythin.internal')
     or id::text like 'b0000000%';

  -- 4. Bot auth kullanıcılarını tamamen sil
  delete from auth.users 
  where email like '%@dythin.internal'
     or id::text like 'b0000000%';

  get diagnostics v_deleted_count = row_count;

  return 'Tüm botlar, profilleri, gönderileri ve oyları veritabanından kalıcı olarak silindi. Sıfır alan kaplamaktadır.';
end;
$$;

-- ── 3. GÜVENLİ VE HİYERARŞİK ADMİN / KULLANICI ROL YÖNETİMİ ──
create or replace function public.admin_set_user_role(target_user_id uuid, new_role text)
returns jsonb
language plpgsql
security definer set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  caller_user text;
  target_user text;
begin
  if caller_id is null then
    return jsonb_build_object('success', false, 'error', 'Yetkisiz erişim');
  end if;

  select coalesce(role, 'user'), lower(coalesce(username, '')) into caller_role, caller_user
  from public.profiles where id = caller_id;

  select lower(coalesce(username, '')) into target_user
  from public.profiles where id = target_user_id;

  -- Yalnızca mehmetkarabul7tt veya admin rolündeki kullanıcılar işlem yapabilir
  if caller_user <> 'mehmetkarabul7tt' and caller_role <> 'admin' then
    return jsonb_build_object('success', false, 'error', 'Yönetici yetkisi gerekli');
  end if;

  -- Ana kurucu yöneticinin yetkisi kaldırılamaz veya banlanamaz
  if target_user = 'mehmetkarabul7tt' then
    return jsonb_build_object('success', false, 'error', 'Ana yöneticinin rolü değiştirilemez veya banlanamaz');
  end if;

  -- Başka bir kullanıcıya admin yetkisi vermeyi veya admin yetkisini kaldırmayı yalnızca kurucu yönetici (mehmetkarabul7tt) yapabilir
  if (new_role = 'admin' or target_user_id in (select id from public.profiles where role = 'admin')) and caller_user <> 'mehmetkarabul7tt' then
    return jsonb_build_object('success', false, 'error', 'Yalnızca kurucu ana yönetici admin yetkilerini değiştirebilir');
  end if;

  -- Hedef kullanıcının rolünü güncelle
  update public.profiles set role = new_role where id = target_user_id;

  -- Eğer banlandıysa gönderilerini inaktif et
  if new_role = 'banned' then
    update public.posts set is_active = false where user_id = target_user_id;
  end if;

  return jsonb_build_object('success', true, 'new_role', new_role);
end;
$$;

-- RLS: Adminlerin diğer profilleri güncellemesine izin ver
drop policy if exists "Admin profilleri güncelleyebilir" on public.profiles;
create policy "Admin profilleri güncelleyebilir"
  on public.profiles for update using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.profiles where id = auth.uid() and lower(username) = 'mehmetkarabul7tt'
    )
  );

-- Botları hemen içeri bas:
select public.seed_bots_and_posts();

