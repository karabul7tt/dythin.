-- ============================================================
-- DYTHIN. — Bot Kullanıcıları, Gönderileri ve Etkileşim Scripti
-- Supabase Dashboard > SQL Editor alanına yapıştırıp "RUN" yapın.
-- ============================================================

create or replace function public.seed_bots_and_posts()
returns text
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  v_dummy_pw text := crypt('DythinBotPass2026!', gen_salt('bf'));
begin
  -- ── 1. BOT KULLANICILARINI OLUŞTUR (auth.users) ─────────────
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ece_style@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"ece_style","full_name":"Ece Yılmaz"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'mert_demir@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"mert_demir","full_name":"Mert Demir"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'damla.look@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"damla.look","full_name":"Damla Kaya"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'can_fits@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"can_fits","full_name":"Can Öztürk"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'melisa_vogue@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"melisa_vogue","full_name":"Melisa Aydın"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'berk_street@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"berk_street","full_name":"Berk Çelik"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'zeynep.mod@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"zeynep.mod","full_name":"Zeynep Arslan"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'tolga_wear@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"tolga_wear","full_name":"Tolga Şahin"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'selin.look@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"selin.look","full_name":"Selin Koç"}', now(), now()),
    ('00000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'arda_urban@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"arda_urban","full_name":"Arda Yıldız"}', now(), now()),
    ('00000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'defne_glam@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"defne_glam","full_name":"Defne Kurt"}', now(), now()),
    ('00000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'burak_outfits@dythin.internal', v_dummy_pw, now(), '{"provider":"email","providers":["email"]}', '{"username":"burak_outfits","full_name":"Burak Aksoy"}', now(), now())
  on conflict (id) do nothing;

  -- ── 2. BOT PROFİLLERİNİ GÜNCELLE / OLUŞTUR (public.profiles) ──
  insert into public.profiles (id, username, full_name, avatar_url, role, created_at)
  values
    ('b0000000-0000-0000-0000-000000000001', 'ece_style', 'Ece Yılmaz', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000002', 'mert_demir', 'Mert Demir', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000003', 'damla.look', 'Damla Kaya', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000004', 'can_fits', 'Can Öztürk', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000005', 'melisa_vogue', 'Melisa Aydın', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000006', 'berk_street', 'Berk Çelik', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000007', 'zeynep.mod', 'Zeynep Arslan', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000008', 'tolga_wear', 'Tolga Şahin', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000009', 'selin.look', 'Selin Koç', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000010', 'arda_urban', 'Arda Yıldız', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000011', 'defne_glam', 'Defne Kurt', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400&auto=format&fit=crop&q=80', 'user', now()),
    ('b0000000-0000-0000-0000-000000000012', 'burak_outfits', 'Burak Aksoy', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80', 'user', now())
  on conflict (id) do update set
    username = excluded.username,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url;

  -- ── 3. BOT GÖNDERİLERİNİ OLUŞTUR (public.posts) ─────────────
  -- Gönderiler her çalıştırıldığında güncel saatle ve 30 günlük bitiş süresiyle yenilenir
  insert into public.posts (
    id,
    user_id,
    title,
    description,
    image_url,
    image_a_url,
    image_b_url,
    category,
    audience,
    is_active,
    voter_count,
    created_at,
    expires_at
  )
  values
    (
      'c0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000001',
      'Bugün ofise hangisi daha uygun?',
      'Bej blazer takım mı yoksa siyah trençkot mu?',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      8,
      now(),
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000002',
      'Hafta sonu kahvesi için 1 mi 2 mi?',
      'Oversize bomber ceket mi deri mont mu?',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      11,
      now() - interval '20 minutes',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000003',
      'b0000000-0000-0000-0000-000000000003',
      'Akşam yemeği kombini hangisi olsun?',
      'Siyah saten elbise vs bordo zarafet',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      9,
      now() - interval '45 minutes',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000004',
      'b0000000-0000-0000-0000-000000000004',
      'Casual cuma kombini',
      'Beyaz sneaker ve jean mi, keten pantolon ve gömlek mi?',
      'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      7,
      now() - interval '1 hour',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000005',
      'b0000000-0000-0000-0000-000000000005',
      'Konser için hangisi daha tarz?',
      'Rock chic mi retro sokak modası mı?',
      'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      12,
      now() - interval '2 hours',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000006',
      'b0000000-0000-0000-0000-000000000006',
      'Sneakers mı Loafers mı?',
      'Gün boyu ayakta olacağım hangisi daha iyi gider?',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      6,
      now() - interval '3 hours',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000007',
      'b0000000-0000-0000-0000-000000000007',
      'Spor şık kombin',
      'Crop ceket & jogger mı, oversize sweatshirt mü?',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      10,
      now() - interval '4 hours',
      now() + interval '30 days'
    ),
    (
      'c0000000-0000-0000-0000-000000000008',
      'b0000000-0000-0000-0000-000000000008',
      'Bahar geçiş kombini',
      'Açık renk trençkot mu camel kaban mı?',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80',
      'outfit',
      'public',
      true,
      8,
      now() - interval '5 hours',
      now() + interval '30 days'
    )
  on conflict (id) do update set
    created_at = now(),
    expires_at = now() + interval '30 days',
    is_active = true;

  -- ── 4. BOT OYLARI VE YORUMLARI (public.votes) ───────────────
  insert into public.votes (post_id, voter_id, value, selected_option, comment, created_at)
  values
    -- Post 1 için oylar
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', true, 'A', 'Bej blazer ofis ortamı için çok daha profesyonel duruyor.', now() - interval '10 minutes'),
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', true, 'A', 'Kesinlikle 1 numara, renk uyumu harika.', now() - interval '8 minutes'),
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', true, 'B', 'B bence çok daha asil durmuş.', now() - interval '6 minutes'),
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000005', true, 'A', 'A kombini çok temiz ve modern.', now() - interval '4 minutes'),
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000006', true, 'B', null, now() - interval '2 minutes'),

    -- Post 2 için oylar
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', true, 'B', 'Deri ceket kahve buluşması için çok daha tarz.', now() - interval '15 minutes'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000007', true, 'A', 'Oversize duruşu çok iyi.', now() - interval '12 minutes'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000008', true, 'B', 'Net 2 numara.', now() - interval '10 minutes'),
    ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000009', true, 'B', 'B seçeneği daha enerjik.', now() - interval '5 minutes'),

    -- Post 3 için oylar
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000010', true, 'A', 'Siyah saten her zaman garantidir, harika.', now() - interval '30 minutes'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000011', true, 'B', 'Bordo elbisenin tonu çok etkileyici.', now() - interval '25 minutes'),
    ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000012', true, 'A', null, now() - interval '20 minutes'),

    -- Post 4 için oylar
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', true, 'A', 'Casual cuma için 1 tam kararında.', now() - interval '40 minutes'),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', true, 'A', 'Beyaz sneaker çok yakışmış.', now() - interval '35 minutes'),
    ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000006', true, 'B', 'Keten gömlek daha şık.', now() - interval '30 minutes'),

    -- Post 5 için oylar
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', true, 'A', 'Konserde rock chic havası tam oturur.', now() - interval '50 minutes'),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000004', true, 'A', 'Kesinlikle A!', now() - interval '45 minutes'),
    ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000008', true, 'B', 'Retro sokak stili çok özgün.', now() - interval '40 minutes')
  on conflict (voter_id, post_id) do update set
    selected_option = excluded.selected_option,
    comment = excluded.comment;

  return 'Başarıyla 12 bot profili, 8 kombin gönderisi ve oylar/yorumlar eklendi.';
end;
$$;

-- Fonksiyonu hemen çalıştırıp verileri içeri bas:
select public.seed_bots_and_posts();
