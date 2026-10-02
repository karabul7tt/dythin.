create extension if not exists pgcrypto with schema extensions;

-- Tablo kisitlamalarini ve kolonlari guvene al
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'image_url'
  ) then
    alter table public.posts alter column image_url drop not null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'votes' and column_name = 'value'
  ) then
    alter table public.votes add column value boolean default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'votes' and column_name = 'selected_option'
  ) then
    alter table public.votes add column selected_option text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'votes' and column_name = 'comment'
  ) then
    alter table public.votes add column comment text;
  end if;
end $$;

create table if not exists public.bot_seed_tracker (
  id int primary key default 1,
  last_index int default 0,
  updated_at timestamptz default now()
);

alter table public.bot_seed_tracker enable row level security;

drop policy if exists "bot_seed_tracker_read" on public.bot_seed_tracker;
create policy "bot_seed_tracker_read" on public.bot_seed_tracker for select using (true);

drop policy if exists "bot_seed_tracker_write" on public.bot_seed_tracker;
create policy "bot_seed_tracker_write" on public.bot_seed_tracker for all using (true) with check (true);

insert into public.bot_seed_tracker (id, last_index)
values (1, 0)
on conflict (id) do nothing;

-- 2. SIRADAKI 12 BOTU YUKLEYEN FONKSIYON (seed_next_bot_batch)
create or replace function public.seed_next_bot_batch(p_batch_size int default 12)
returns text
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  v_dummy_pw text := crypt('DythinBotPass2026!', gen_salt('bf'));
  v_start_index int := 0;
  v_end_index int := 0;
  v_bot_record record;
  v_post_record record;
  v_post_id uuid;
  v_bot_ids uuid[] := '{}';
  v_voter_id uuid;
  v_option text;
  v_comment text;
  v_post_idx integer := 0;
begin
  -- 1. Mevcut sıra indeksini al
  select coalesce(last_index, 0) into v_start_index
  from public.bot_seed_tracker where id = 1;

  if v_start_index is null then
    v_start_index := 0;
  end if;

  if v_start_index >= 240 then
    return 'Tüm 240 bot sırayla sisteme yüklendi! Tekrar göndermek için önce "Botları Temizle" butonuna basarak sıfırlayabilirsiniz.';
  end if;

  v_end_index := least(v_start_index + p_batch_size, 240);

  -- 2. 240 Benzersiz & Gerçek Fotoğraflı Bot Havuzu
  create temp table tmp_bot_master_pool (
    bot_num int,
    username text,
    full_name text,
    avatar_url text
  ) on commit drop;

  insert into tmp_bot_master_pool (bot_num, username, full_name, avatar_url) values
    (1, 'selin.yilmaz', 'Selin Yılmaz', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=80'),
    (2, 'can.tas', 'Can Taş', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80'),
    (3, 'melis.kaya', 'Melis Kaya', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'),
    (4, 'burak.kose', 'Burak Köse', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80'),
    (5, 'zeynep.demir', 'Zeynep Demir', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80'),
    (6, 'mert.aktas', 'Mert Aktaş', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80'),
    (7, 'defne.celik', 'Defne Çelik', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80'),
    (8, 'emir.demircan', 'Emir Demircan', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&auto=format&fit=crop&q=80'),
    (9, 'ece.sahin', 'Ece Şahin', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&auto=format&fit=crop&q=80'),
    (10, 'kaan.erden', 'Kaan Erden', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80'),
    (11, 'irem.yildiz', 'İrem Yıldız', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=80'),
    (12, 'baris.turan', 'Barış Turan', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&auto=format&fit=crop&q=80'),
    (13, 'ceren.yildirim', 'Ceren Yıldırım', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=500&auto=format&fit=crop&q=80'),
    (14, 'berk.gundogdu', 'Berk Gündoğdu', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=500&auto=format&fit=crop&q=80'),
    (15, 'derya.ozturk', 'Derya Öztürk', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=500&auto=format&fit=crop&q=80'),
    (16, 'tolga.sen', 'Tolga Şen', 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=500&auto=format&fit=crop&q=80'),
    (17, 'sinem.aydin', 'Sinem Aydın', 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&auto=format&fit=crop&q=80'),
    (18, 'kerem.tan', 'Kerem Tan', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=500&auto=format&fit=crop&q=80'),
    (19, 'hazal.ozdemir', 'Hazal Özdemir', 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=500&auto=format&fit=crop&q=80'),
    (20, 'batuhan.erdem', 'Batuhan Erdem', 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=500&auto=format&fit=crop&q=80'),
    (21, 'gamze.arslan', 'Gamze Arslan', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80'),
    (22, 'umut.sari', 'Umut Sarı', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=80'),
    (23, 'pelin.dogan', 'Pelin Doğan', 'https://images.unsplash.com/photo-1514315384763-ba401779410f?w=500&auto=format&fit=crop&q=80'),
    (24, 'furkan.gok', 'Furkan Gök', 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=500&auto=format&fit=crop&q=80'),
    (25, 'buse.kilic', 'Buse Kılıç', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&auto=format&fit=crop&q=80'),
    (26, 'arda.acar', 'Arda Acar', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=80'),
    (27, 'damla.aslan', 'Damla Aslan', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&auto=format&fit=crop&q=80'),
    (28, 'emre.coskun', 'Emre Coşkun', 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=500&auto=format&fit=crop&q=80'),
    (29, 'oyku.cetin', 'Öykü Çetin', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&auto=format&fit=crop&q=80'),
    (30, 'yigit.yalcin', 'Yiğit Yalçın', 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=500&auto=format&fit=crop&q=80'),
    (31, 'mina.kara', 'Mina Kara', 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=500&auto=format&fit=crop&q=80'),
    (32, 'alp.sonmez', 'Alp Sönmez', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80'),
    (33, 'eylul.koc', 'Eylül Koç', 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=500&auto=format&fit=crop&q=80'),
    (34, 'doruk.alkan', 'Doruk Alkan', 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=500&auto=format&fit=crop&q=80'),
    (35, 'ezgi.kurt', 'Ezgi Kurt', 'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?w=500&auto=format&fit=crop&q=80'),
    (36, 'oguz.duran', 'Oğuz Duran', 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=500&auto=format&fit=crop&q=80'),
    (37, 'asli.ozkan', 'Aslı Özkan', 'https://images.unsplash.com/photo-1509783236416-c9ad59bae472?w=500&auto=format&fit=crop&q=80'),
    (38, 'eren.bilen', 'Eren Bilen', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=500&auto=format&fit=crop&q=80'),
    (39, 'ipek.simsek', 'İpek Şimşek', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=500&auto=format&fit=crop&q=80'),
    (40, 'ozan.candan', 'Ozan Candan', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500&auto=format&fit=crop&q=80'),
    (41, 'burcu.polat', 'Burcu Polat', 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=500&auto=format&fit=crop&q=80'),
    (42, 'onur.caliskan', 'Onur Çalışkan', 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=500&auto=format&fit=crop&q=80'),
    (43, 'cansu.korkmaz', 'Cansu Korkmaz', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80'),
    (44, 'gorkem.guven', 'Görkem Güven', 'https://images.unsplash.com/photo-1496345875659-11f7dd282d1d?w=500&auto=format&fit=crop&q=80'),
    (45, 'gozde.ozcan', 'Gözde Özcan', 'https://images.unsplash.com/photo-1541823709867-1b206113eafd?w=500&auto=format&fit=crop&q=80'),
    (46, 'berkay.kahraman', 'Berkay Kahraman', 'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=500&auto=format&fit=crop&q=80'),
    (47, 'merve.erdogan', 'Merve Erdoğan', 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=500&auto=format&fit=crop&q=80'),
    (48, 'efe.karakaya', 'Efe Karakaya', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=500&auto=format&fit=crop&q=80'),
    (49, 'elif.yavuz', 'Elif Yavuz', 'https://images.unsplash.com/photo-1526413232644-8a40f08cc4ce?w=500&auto=format&fit=crop&q=80'),
    (50, 'sarp.karatas', 'Sarp Karataş', 'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=500&auto=format&fit=crop&q=80'),
    (51, 'berna.gunes', 'Berna Güneş', 'https://images.unsplash.com/photo-1542206395-9feb3edaa68d?w=500&auto=format&fit=crop&q=80'),
    (52, 'demir.kocaman', 'Demir Kocaman', 'https://images.unsplash.com/photo-1514222709107-a180c68d72b4?w=500&auto=format&fit=crop&q=80'),
    (53, 'deniz.aksoy', 'Deniz Aksoy', 'https://images.unsplash.com/photo-1541216970279-affbfdd55aa8?w=500&auto=format&fit=crop&q=80'),
    (54, 'tuna.koroglu', 'Tuna Köroğlu', 'https://images.unsplash.com/photo-1528892952291-009c663ce843?w=500&auto=format&fit=crop&q=80'),
    (55, 'sila.bulut', 'Sıla Bulut', 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=500&auto=format&fit=crop&q=80'),
    (56, 'bora.mutlu', 'Bora Mutlu', 'https://images.unsplash.com/photo-1531891437562-4301cf092a9d?w=500&auto=format&fit=crop&q=80'),
    (57, 'tugce.keskin', 'Tuğçe Keskin', 'https://images.unsplash.com/photo-1523824921871-d6f1a15151f1?w=500&auto=format&fit=crop&q=80'),
    (58, 'kutay.oguz', 'Kutay Oğuz', 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=500&auto=format&fit=crop&q=80'),
    (59, 'dila.unal', 'Dila Ünal', 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=500&auto=format&fit=crop&q=80'),
    (60, 'kaya.pekcan', 'Kaya Pekcan', 'https://images.unsplash.com/photo-1541647376583-8934aff3448f?w=500&auto=format&fit=crop&q=80'),
    (61, 'melike.yuksel', 'Melike Yüksel', 'https://images.unsplash.com/photo-1546961329-78bef0414d7c?w=500&auto=format&fit=crop&q=80'),
    (62, 'yasin.saglam', 'Yasin Sağlam', 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=500&auto=format&fit=crop&q=80'),
    (63, 'beste.bozkurt', 'Beste Bozkurt', 'https://images.unsplash.com/photo-1530785602389-0759fefe01c6?w=500&auto=format&fit=crop&q=80'),
    (64, 'serkan.soylu', 'Serkan Soylu', 'https://images.unsplash.com/photo-1544168190-79c17527004f?w=500&auto=format&fit=crop&q=80'),
    (65, 'hande.guler', 'Hande Güler', 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?w=500&auto=format&fit=crop&q=80'),
    (66, 'murat.senturk', 'Murat Şentürk', 'https://images.unsplash.com/photo-1545167622-3a6ac756afa4?w=500&auto=format&fit=crop&q=80'),
    (67, 'leyla.gul', 'Leyla Gül', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=500&auto=format&fit=crop&q=80'),
    (68, 'volkan.topal', 'Volkan Topal', 'https://images.unsplash.com/photo-1548372290-8d01b6c8e78c?w=500&auto=format&fit=crop&q=80'),
    (69, 'gizem.isik', 'Gizem Işık', 'https://images.unsplash.com/photo-1532074205216-d0e1f4b87368?w=500&auto=format&fit=crop&q=80'),
    (70, 'gokhan.turgut', 'Gökhan Turgut', 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=500&auto=format&fit=crop&q=80'),
    (71, 'aleyna.avci', 'Aleyna Avcı', 'https://images.unsplash.com/photo-1544717297-fa95b6ee9643?w=500&auto=format&fit=crop&q=80'),
    (72, 'cem.uysal', 'Cem Uysal', 'https://images.unsplash.com/photo-1559548331-f9cb98001426?w=500&auto=format&fit=crop&q=80'),
    (73, 'sude.tekin', 'Sude Tekin', 'https://images.unsplash.com/photo-1558898479-33c0057ecbd6?w=500&auto=format&fit=crop&q=80'),
    (74, 'ali.varol', 'Ali Varol', 'https://images.unsplash.com/photo-1562788869-4ed32648eb72?w=500&auto=format&fit=crop&q=80'),
    (75, 'dilara.tas', 'Dilara Taş', 'https://images.unsplash.com/photo-1560787313-5dff3307e257?w=500&auto=format&fit=crop&q=80'),
    (76, 'deniz.yaman', 'Deniz Yaman', 'https://images.unsplash.com/photo-1566753323558-f4e0952af115?w=500&auto=format&fit=crop&q=80'),
    (77, 'seray.kose', 'Seray Köse', 'https://images.unsplash.com/photo-1561055657-b9e0bf0fa360?w=500&auto=format&fit=crop&q=80'),
    (78, 'koray.yener', 'Koray Yener', 'https://images.unsplash.com/photo-1574701148212-8518049c7b2c?w=500&auto=format&fit=crop&q=80'),
    (79, 'lara.aktas', 'Lara Aktaş', 'https://images.unsplash.com/photo-1563237023-b1e970526dcb?w=500&auto=format&fit=crop&q=80'),
    (80, 'taylan.yigiter', 'Taylan Yiğiter', 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=500&auto=format&fit=crop&q=80'),
    (81, 'ruya.demircan', 'Rüya Demircan', 'https://images.unsplash.com/photo-1564564244660-5d73c057f2d2?w=500&auto=format&fit=crop&q=80'),
    (82, 'cihan.zorlu', 'Cihan Zorlu', 'https://images.unsplash.com/photo-1581803118522-7b72a50f7e9f?w=500&auto=format&fit=crop&q=80'),
    (83, 'simge.erden', 'Simge Erden', 'https://images.unsplash.com/photo-1567186937675-a5131c8a89ea?w=500&auto=format&fit=crop&q=80'),
    (84, 'yaman.ayhan', 'Yaman Ayhan', 'https://images.unsplash.com/photo-1583195764036-6dc248ac07d9?w=500&auto=format&fit=crop&q=80'),
    (85, 'alara.turan', 'Alara Turan', 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=500&auto=format&fit=crop&q=80'),
    (86, 'ruzgar.basar', 'Rüzgar Başar', 'https://images.unsplash.com/photo-1584043720379-b56bd910c2e6?w=500&auto=format&fit=crop&q=80'),
    (87, 'beren.gundogdu', 'Beren Gündoğdu', 'https://images.unsplash.com/photo-1569913486515-b74bf7751574?w=500&auto=format&fit=crop&q=80'),
    (88, 'kuzey.yilmaz', 'Kuzey Yılmaz', 'https://images.unsplash.com/photo-1586716402203-79219c66f4c2?w=500&auto=format&fit=crop&q=80'),
    (89, 'aylin.sen', 'Aylin Şen', 'https://images.unsplash.com/photo-1570158268183-d296b2892211?w=500&auto=format&fit=crop&q=80'),
    (90, 'aras.kaya', 'Aras Kaya', 'https://images.unsplash.com/photo-1587064713551-3e3297fa3abc?w=500&auto=format&fit=crop&q=80'),
    (91, 'nehir.tan', 'Nehir Tan', 'https://images.unsplash.com/photo-1571513722275-4b41940f54b8?w=500&auto=format&fit=crop&q=80'),
    (92, 'baran.demir', 'Baran Demir', 'https://images.unsplash.com/photo-1588731234159-8b9963143fca?w=500&auto=format&fit=crop&q=80'),
    (93, 'ilgin.erdem', 'Ilgın Erdem', 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=500&auto=format&fit=crop&q=80'),
    (94, 'mete.celik', 'Mete Çelik', 'https://images.unsplash.com/photo-1589571894960-20bbe2828d0a?w=500&auto=format&fit=crop&q=80'),
    (95, 'ebru.sari', 'Ebru Sarı', 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=500&auto=format&fit=crop&q=80'),
    (96, 'atakan.sahin', 'Atakan Şahin', 'https://images.unsplash.com/photo-1590086782957-93e06ef21604?w=500&auto=format&fit=crop&q=80'),
    (97, 'ceyda.gok', 'Ceyda Gök', 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80'),
    (98, 'polat.yildiz', 'Polat Yıldız', 'https://images.unsplash.com/photo-1592621385612-4d7129426394?w=500&auto=format&fit=crop&q=80'),
    (99, 'pinar.acar', 'Pınar Acar', 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=500&auto=format&fit=crop&q=80'),
    (100, 'yalcin.yildirim', 'Yalçın Yıldırım', 'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=500&auto=format&fit=crop&q=80'),
    (101, 'nur.coskun', 'Nur Coşkun', 'https://images.unsplash.com/photo-1581403341630-a6e0b9d2d257?w=500&auto=format&fit=crop&q=80'),
    (102, 'hakan.ozturk', 'Hakan Öztürk', 'https://images.unsplash.com/photo-1597223557154-721c1cecc4b0?w=500&auto=format&fit=crop&q=80'),
    (103, 'sevval.yalcin', 'Şevval Yalçın', 'https://images.unsplash.com/photo-1582610285987-844df4b75781?w=500&auto=format&fit=crop&q=80'),
    (104, 'ufuk.aydin', 'Ufuk Aydın', 'https://images.unsplash.com/photo-1599842057874-37393e9342df?w=500&auto=format&fit=crop&q=80'),
    (105, 'yasemin.sonmez', 'Yasemin Sönmez', 'https://images.unsplash.com/photo-1584999734482-05c02c1059b6?w=500&auto=format&fit=crop&q=80'),
    (106, 'selim.ozdemir', 'Selim Özdemir', 'https://images.unsplash.com/photo-1600486913747-55e5470d6f40?w=500&auto=format&fit=crop&q=80'),
    (107, 'begum.alkan', 'Begüm Alkan', 'https://images.unsplash.com/photo-1586716402203-79219c66f4c2?w=500&auto=format&fit=crop&q=80'),
    (108, 'tarik.arslan', 'Tarık Arslan', 'https://images.unsplash.com/photo-1601288496920-b6154fe3626a?w=500&auto=format&fit=crop&q=80'),
    (109, 'nisa.duran', 'Nisa Duran', 'https://images.unsplash.com/photo-1588516903720-8ceb67f9ef84?w=500&auto=format&fit=crop&q=80'),
    (110, 'semih.dogan', 'Semih Doğan', 'https://images.unsplash.com/photo-1603415526960-f7e0328c63b1?w=500&auto=format&fit=crop&q=80'),
    (111, 'seda.bilen', 'Seda Bilen', 'https://images.unsplash.com/photo-1589571894960-20bbe2828d0a?w=500&auto=format&fit=crop&q=80'),
    (112, 'tugrul.kilic', 'Tuğrul Kılıç', 'https://images.unsplash.com/photo-1604004555489-723a93d6ce74?w=500&auto=format&fit=crop&q=80'),
    (113, 'aynur.candan', 'Aynur Candan', 'https://images.unsplash.com/photo-1590086782957-93e06ef21604?w=500&auto=format&fit=crop&q=80'),
    (114, 'caglar.aslan', 'Çağlar Aslan', 'https://images.unsplash.com/photo-1605462863863-10d9e47e15ee?w=500&auto=format&fit=crop&q=80'),
    (115, 'miray.caliskan', 'Miray Çalışkan', 'https://images.unsplash.com/photo-1592621385612-4d7129426394?w=500&auto=format&fit=crop&q=80'),
    (116, 'ilker.cetin', 'İlker Çetin', 'https://images.unsplash.com/photo-1606122017369-d7866e1e85ec?w=500&auto=format&fit=crop&q=80'),
    (117, 'melisa.guven', 'Melisa Güven', 'https://images.unsplash.com/photo-1593104547489-5cfb3839a3b5?w=500&auto=format&fit=crop&q=80'),
    (118, 'taner.kara', 'Taner Kara', 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=500&auto=format&fit=crop&q=80'),
    (119, 'naz.kahraman', 'Naz Kahraman', 'https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=500&auto=format&fit=crop&q=80'),
    (120, 'alper.koc', 'Alper Koç', 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=500&auto=format&fit=crop&q=80'),
    (121, 'bahar.karakaya', 'Bahar Karakaya', 'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=500&auto=format&fit=crop&q=80'),
    (122, 'ata.kurt', 'Ata Kurt', 'https://images.unsplash.com/photo-1609505848912-b7c3b8b4bee0?w=500&auto=format&fit=crop&q=80'),
    (123, 'bengi.karatas', 'Bengi Karataş', 'https://images.unsplash.com/photo-1597223557154-721c1cecc4b0?w=500&auto=format&fit=crop&q=80'),
    (124, 'ayberk.ozkan', 'Ayberk Özkan', 'https://images.unsplash.com/photo-1614289371518-722f2615943d?w=500&auto=format&fit=crop&q=80'),
    (125, 'bilge.kocaman', 'Bilge Kocaman', 'https://images.unsplash.com/photo-1598550874175-4d0ef436c909?w=500&auto=format&fit=crop&q=80'),
    (126, 'barkin.simsek', 'Barkın Şimşek', 'https://images.unsplash.com/photo-1615813967515-e1838c1c5116?w=500&auto=format&fit=crop&q=80'),
    (127, 'buket.koroglu', 'Buket Köroğlu', 'https://images.unsplash.com/photo-1599842057874-37393e9342df?w=500&auto=format&fit=crop&q=80'),
    (128, 'barin.polat', 'Barın Polat', 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=500&auto=format&fit=crop&q=80'),
    (129, 'burcak.mutlu', 'Burçak Mutlu', 'https://images.unsplash.com/photo-1601288496920-b6154fe3626a?w=500&auto=format&fit=crop&q=80'),
    (130, 'batu.korkmaz', 'Batu Korkmaz', 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=500&auto=format&fit=crop&q=80'),
    (131, 'cagla.oguz', 'Çağla Oğuz', 'https://images.unsplash.com/photo-1604004555489-723a93d6ce74?w=500&auto=format&fit=crop&q=80'),
    (132, 'bedirhan.ozcan', 'Bedirhan Özcan', 'https://images.unsplash.com/photo-1624561172888-ac93c696e10c?w=500&auto=format&fit=crop&q=80'),
    (133, 'damlanur.pekcan', 'Damlanur Pekcan', 'https://images.unsplash.com/photo-1605462863863-10d9e47e15ee?w=500&auto=format&fit=crop&q=80'),
    (134, 'berke.erdogan', 'Berke Erdoğan', 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=500&auto=format&fit=crop&q=80'),
    (135, 'demet.saglam', 'Demet Sağlam', 'https://images.unsplash.com/photo-1606122017369-d7866e1e85ec?w=500&auto=format&fit=crop&q=80'),
    (136, 'boran.yavuz', 'Boran Yavuz', 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=500&auto=format&fit=crop&q=80'),
    (137, 'dicle.soylu', 'Dicle Soylu', 'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=500&auto=format&fit=crop&q=80'),
    (138, 'bugra.gunes', 'Buğra Güneş', 'https://images.unsplash.com/photo-1639149888905-fb39731f2e6c?w=500&auto=format&fit=crop&q=80'),
    (139, 'dilek.senturk', 'Dilek Şentürk', 'https://images.unsplash.com/photo-1609505848912-b7c3b8b4bee0?w=500&auto=format&fit=crop&q=80'),
    (140, 'caner.aksoy', 'Caner Aksoy', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&auto=format&fit=crop&q=80'),
    (141, 'duygu.topal', 'Duygu Topal', 'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=500&auto=format&fit=crop&q=80'),
    (142, 'cavit.bulut', 'Cavit Bulut', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&auto=format&fit=crop&q=80'),
    (143, 'ecehan.turgut', 'Ecehan Turgut', 'https://images.unsplash.com/photo-1614289371518-722f2615943d?w=500&auto=format&fit=crop&q=80'),
    (144, 'ceyhun.keskin', 'Ceyhun Keskin', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&auto=format&fit=crop&q=80'),
    (145, 'ecem.uysal', 'Ecem Uysal', 'https://images.unsplash.com/photo-1614283233556-f35b0c801ef1?w=500&auto=format&fit=crop&q=80'),
    (146, 'daghan.unal', 'Dağhan Ünal', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=500&auto=format&fit=crop&q=80'),
    (147, 'eda.varol', 'Eda Varol', 'https://images.unsplash.com/photo-1616763355603-9755a640a287?w=500&auto=format&fit=crop&q=80'),
    (148, 'devrim.yuksel', 'Devrim Yüksel', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80'),
    (149, 'ege.yaman', 'Ege Yaman', 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=500&auto=format&fit=crop&q=80'),
    (150, 'dogu.bozkurt', 'Doğu Bozkurt', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&auto=format&fit=crop&q=80'),
    (151, 'ela.yener', 'Ela Yener', 'https://images.unsplash.com/photo-1619895862022-09114b41f16f?w=500&auto=format&fit=crop&q=80'),
    (152, 'efehan.guler', 'Efehan Güler', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=500&auto=format&fit=crop&q=80'),
    (153, 'elcin.yigiter', 'Elçin Yiğiter', 'https://images.unsplash.com/photo-1621784563330-caee0b138a00?w=500&auto=format&fit=crop&q=80'),
    (154, 'egecan.gul', 'Egecan Gül', 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=500&auto=format&fit=crop&q=80'),
    (155, 'esra.zorlu', 'Esra Zorlu', 'https://images.unsplash.com/photo-1623091410901-00e2d2689add?w=500&auto=format&fit=crop&q=80'),
    (156, 'egemen.isik', 'Egemen Işık', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=500&auto=format&fit=crop&q=80'),
    (157, 'evin.ayhan', 'Evin Ayhan', 'https://images.unsplash.com/photo-1624561172888-ac93c696e10c?w=500&auto=format&fit=crop&q=80'),
    (158, 'ender.avci', 'Ender Avcı', 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=500&auto=format&fit=crop&q=80'),
    (159, 'feride.basar', 'Feride Başar', 'https://images.unsplash.com/photo-1627161684458-a62da52b51c3?w=500&auto=format&fit=crop&q=80'),
    (160, 'engin.tekin', 'Engin Tekin', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=500&auto=format&fit=crop&q=80'),
    (161, 'feyza.yilmaz', 'Feyza Yılmaz', 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=500&auto=format&fit=crop&q=80'),
    (162, 'erdem.tas', 'Erdem Taş', 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=500&auto=format&fit=crop&q=80'),
    (163, 'fulya.kaya', 'Fulya Kaya', 'https://images.unsplash.com/photo-1629425733761-caae3b5f2e50?w=500&auto=format&fit=crop&q=80'),
    (164, 'erhan.kose', 'Erhan Köse', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=500&auto=format&fit=crop&q=80'),
    (165, 'funda.demir', 'Funda Demir', 'https://images.unsplash.com/photo-1630713815150-2c847025c1d9?w=500&auto=format&fit=crop&q=80'),
    (166, 'ersin.aktas', 'Ersin Aktaş', 'https://images.unsplash.com/photo-1519764622345-23439dd774f7?w=500&auto=format&fit=crop&q=80'),
    (167, 'gaye.celik', 'Gaye Çelik', 'https://images.unsplash.com/photo-1631947430066-48c30d57b943?w=500&auto=format&fit=crop&q=80'),
    (168, 'ferhat.demircan', 'Ferhat Demircan', 'https://images.unsplash.com/photo-1534030347209-467a5b0ad3e6?w=500&auto=format&fit=crop&q=80'),
    (169, 'gizemnur.sahin', 'Gizemnur Şahin', 'https://images.unsplash.com/photo-1632765854612-9b02b6ec2b15?w=500&auto=format&fit=crop&q=80'),
    (170, 'firat.erden', 'Fırat Erden', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80'),
    (171, 'gulce.yildiz', 'Gülce Yıldız', 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=500&auto=format&fit=crop&q=80'),
    (172, 'gediz.turan', 'Gediz Turan', 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=500&auto=format&fit=crop&q=80'),
    (173, 'gulfem.yildirim', 'Gülfem Yıldırım', 'https://images.unsplash.com/photo-1634926878768-2a5b3c40f13c?w=500&auto=format&fit=crop&q=80'),
    (174, 'giray.gundogdu', 'Giray Gündoğdu', 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=500&auto=format&fit=crop&q=80'),
    (175, 'gulsah.ozturk', 'Gülşah Öztürk', 'https://images.unsplash.com/photo-1636041293178-808a6762ab39?w=500&auto=format&fit=crop&q=80'),
    (176, 'gokberk.sen', 'Gökberk Şen', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=500&auto=format&fit=crop&q=80'),
    (177, 'gunes.aydin', 'Güneş Aydın', 'https://images.unsplash.com/photo-1638643391904-9b551ba91eaa?w=500&auto=format&fit=crop&q=80'),
    (178, 'goktug.tan', 'Göktuğ Tan', 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=500&auto=format&fit=crop&q=80'),
    (179, 'hale.ozdemir', 'Hale Özdemir', 'https://images.unsplash.com/photo-1639149888905-fb39731f2e6c?w=500&auto=format&fit=crop&q=80'),
    (180, 'guney.erdem', 'Güney Erdem', 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=500&auto=format&fit=crop&q=80'),
    (181, 'harika.arslan', 'Harika Arslan', 'https://images.unsplash.com/photo-1640951613773-54706e06851d?w=500&auto=format&fit=crop&q=80'),
    (182, 'haldun.sari', 'Haldun Sarı', 'https://images.unsplash.com/photo-1496345875659-11f7dd282d1d?w=500&auto=format&fit=crop&q=80'),
    (183, 'havva.dogan', 'Havva Doğan', 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=500&auto=format&fit=crop&q=80'),
    (184, 'harun.gok', 'Harun Gök', 'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=500&auto=format&fit=crop&q=80'),
    (185, 'hilal.kilic', 'Hilal Kılıç', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=500&auto=format&fit=crop&q=80'),
    (186, 'ihsan.acar', 'İhsan Acar', 'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=500&auto=format&fit=crop&q=80'),
    (187, 'isil.aslan', 'Işıl Aslan', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80'),
    (188, 'kadir.coskun', 'Kadir Coşkun', 'https://images.unsplash.com/photo-1514222709107-a180c68d72b4?w=500&auto=format&fit=crop&q=80'),
    (189, 'iclal.cetin', 'İclal Çetin', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&auto=format&fit=crop&q=80'),
    (190, 'kayra.yalcin', 'Kayra Yalçın', 'https://images.unsplash.com/photo-1528892952291-009c663ce843?w=500&auto=format&fit=crop&q=80'),
    (191, 'idil.kara', 'İdil Kara', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80'),
    (192, 'kenan.sonmez', 'Kenan Sönmez', 'https://images.unsplash.com/photo-1531891437562-4301cf092a9d?w=500&auto=format&fit=crop&q=80'),
    (193, 'ilayda.koc', 'İlayda Koç', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&auto=format&fit=crop&q=80'),
    (194, 'korcan.alkan', 'Korcan Alkan', 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=500&auto=format&fit=crop&q=80'),
    (195, 'ilknur.kurt', 'İlknur Kurt', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=500&auto=format&fit=crop&q=80'),
    (196, 'koral.duran', 'Koral Duran', 'https://images.unsplash.com/photo-1541647376583-8934aff3448f?w=500&auto=format&fit=crop&q=80'),
    (197, 'inci.ozkan', 'İnci Özkan', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=500&auto=format&fit=crop&q=80'),
    (198, 'kursat.bilen', 'Kürşat Bilen', 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=500&auto=format&fit=crop&q=80'),
    (199, 'kardelen.simsek', 'Kardelen Şimşek', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=500&auto=format&fit=crop&q=80'),
    (200, 'levent.candan', 'Levent Candan', 'https://images.unsplash.com/photo-1544168190-79c17527004f?w=500&auto=format&fit=crop&q=80'),
    (201, 'kumru.polat', 'Kumru Polat', 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=500&auto=format&fit=crop&q=80'),
    (202, 'meric.caliskan', 'Meriç Çalışkan', 'https://images.unsplash.com/photo-1545167622-3a6ac756afa4?w=500&auto=format&fit=crop&q=80'),
    (203, 'leman.korkmaz', 'Leman Korkmaz', 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=500&auto=format&fit=crop&q=80'),
    (204, 'mirza.guven', 'Mirza Güven', 'https://images.unsplash.com/photo-1548372290-8d01b6c8e78c?w=500&auto=format&fit=crop&q=80'),
    (205, 'masal.ozcan', 'Masal Özcan', 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=80'),
    (206, 'necati.kahraman', 'Necati Kahraman', 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=500&auto=format&fit=crop&q=80'),
    (207, 'meltem.erdogan', 'Meltem Erdoğan', 'https://images.unsplash.com/photo-1514315384763-ba401779410f?w=500&auto=format&fit=crop&q=80'),
    (208, 'noyan.karakaya', 'Noyan Karakaya', 'https://images.unsplash.com/photo-1559548331-f9cb98001426?w=500&auto=format&fit=crop&q=80'),
    (209, 'menekse.yavuz', 'Menekşe Yavuz', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=500&auto=format&fit=crop&q=80'),
    (210, 'oguzhan.karatas', 'Oğuzhan Karataş', 'https://images.unsplash.com/photo-1562788869-4ed32648eb72?w=500&auto=format&fit=crop&q=80'),
    (211, 'mine.gunes', 'Mine Güneş', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&auto=format&fit=crop&q=80'),
    (212, 'okay.kocaman', 'Okay Kocaman', 'https://images.unsplash.com/photo-1566753323558-f4e0952af115?w=500&auto=format&fit=crop&q=80'),
    (213, 'muge.aksoy', 'Müge Aksoy', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&auto=format&fit=crop&q=80'),
    (214, 'oktay.koroglu', 'Oktay Köroğlu', 'https://images.unsplash.com/photo-1574701148212-8518049c7b2c?w=500&auto=format&fit=crop&q=80'),
    (215, 'nazli.bulut', 'Nazlı Bulut', 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=500&auto=format&fit=crop&q=80'),
    (216, 'orcun.mutlu', 'Orçun Mutlu', 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=500&auto=format&fit=crop&q=80'),
    (217, 'nihan.keskin', 'Nihan Keskin', 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=500&auto=format&fit=crop&q=80'),
    (218, 'pamir.oguz', 'Pamir Oğuz', 'https://images.unsplash.com/photo-1581803118522-7b72a50f7e9f?w=500&auto=format&fit=crop&q=80'),
    (219, 'nilay.unal', 'Nilay Ünal', 'https://images.unsplash.com/photo-1564564321837-a57b7070ac4f?w=500&auto=format&fit=crop&q=80'),
    (220, 'rauf.pekcan', 'Rauf Pekcan', 'https://images.unsplash.com/photo-1583195764036-6dc248ac07d9?w=500&auto=format&fit=crop&q=80'),
    (221, 'nurgul.yuksel', 'Nurgül Yüksel', 'https://images.unsplash.com/photo-1509783236416-c9ad59bae472?w=500&auto=format&fit=crop&q=80'),
    (222, 'salih.saglam', 'Salih Sağlam', 'https://images.unsplash.com/photo-1584043720379-b56bd910c2e6?w=500&auto=format&fit=crop&q=80'),
    (223, 'oya.bozkurt', 'Oya Bozkurt', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=500&auto=format&fit=crop&q=80'),
    (224, 'samet.soylu', 'Samet Soylu', 'https://images.unsplash.com/photo-1586716402203-79219c66f4c2?w=500&auto=format&fit=crop&q=80'),
    (225, 'ozge.guler', 'Özge Güler', 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=500&auto=format&fit=crop&q=80'),
    (226, 'sarper.senturk', 'Sarper Şentürk', 'https://images.unsplash.com/photo-1587064713551-3e3297fa3abc?w=500&auto=format&fit=crop&q=80'),
    (227, 'ozlem.gul', 'Özlem Gül', 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=500&auto=format&fit=crop&q=80'),
    (228, 'seckin.topal', 'Seçkin Topal', 'https://images.unsplash.com/photo-1588731234159-8b9963143fca?w=500&auto=format&fit=crop&q=80'),
    (229, 'pelinay.isik', 'Pelinay Işık', 'https://images.unsplash.com/photo-1541823709867-1b206113eafd?w=500&auto=format&fit=crop&q=80'),
    (230, 'sedat.turgut', 'Sedat Turgut', 'https://images.unsplash.com/photo-1589571894960-20bbe2828d0a?w=500&auto=format&fit=crop&q=80'),
    (231, 'petek.avci', 'Petek Avcı', 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=500&auto=format&fit=crop&q=80'),
    (232, 'serhat.uysal', 'Serhat Uysal', 'https://images.unsplash.com/photo-1590086782957-93e06ef21604?w=500&auto=format&fit=crop&q=80'),
    (233, 'reyhan.tekin', 'Reyhan Tekin', 'https://images.unsplash.com/photo-1526413232644-8a40f08cc4ce?w=500&auto=format&fit=crop&q=80'),
    (234, 'sinan.varol', 'Sinan Varol', 'https://images.unsplash.com/photo-1592621385612-4d7129426394?w=500&auto=format&fit=crop&q=80'),
    (235, 'rojda.tas', 'Rojda Taş', 'https://images.unsplash.com/photo-1542206395-9feb3edaa68d?w=500&auto=format&fit=crop&q=80'),
    (236, 'sahin.yaman', 'Şahin Yaman', 'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=500&auto=format&fit=crop&q=80'),
    (237, 'sanem.kose', 'Sanem Köse', 'https://images.unsplash.com/photo-1541216970279-affbfdd55aa8?w=500&auto=format&fit=crop&q=80'),
    (238, 'taha.yener', 'Taha Yener', 'https://images.unsplash.com/photo-1597223557154-721c1cecc4b0?w=500&auto=format&fit=crop&q=80'),
    (239, 'secil.aktas', 'Seçil Aktaş', 'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=500&auto=format&fit=crop&q=80'),
    (240, 'tarkan.yigiter', 'Tarkan Yiğiter', 'https://images.unsplash.com/photo-1599842057874-37393e9342df?w=500&auto=format&fit=crop&q=80');

  -- 3. Sıradaki 12 botu alıp veritabanına ekle
  for v_bot_record in (
    select bot_num, username, full_name, avatar_url
    from tmp_bot_master_pool
    where bot_num > v_start_index and bot_num <= v_end_index
    order by bot_num asc
  ) loop
    declare
      v_new_id uuid := gen_random_uuid();
      v_bot_email text := v_bot_record.username || '@dythin.internal';
    begin
      -- a. auth.users kaydı
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
        v_bot_email, v_dummy_pw, now(),
        '{"provider":"email","providers":["email"]}',
        json_build_object('username', v_bot_record.username, 'full_name', v_bot_record.full_name),
        now(), now()
      );

      -- b. profiles kaydı
      insert into public.profiles (id, username, full_name, avatar_url, role, created_at)
      values (
        v_new_id, v_bot_record.username, v_bot_record.full_name, v_bot_record.avatar_url, 'user', now()
      )
      on conflict (id) do update set
        username = excluded.username,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url;

      v_bot_ids := array_append(v_bot_ids, v_new_id);
    end;
  end loop;

  -- 4. Gerçekçi Kombin Gönderileri Havuzu
  create temp table tmp_outfit_pool (
    title text,
    description text,
    image_a text,
    image_b text
  ) on commit drop;

  insert into tmp_outfit_pool (title, description, image_a, image_b) values
    ('Akşam kahveye hangisi?', 'Oversize bomber ceket mi yoksa siyah deri mont mu?', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80'),
    ('Ayna selfiesi 1 mi 2 mi?', 'Krem triko pantolon kombini vs siyah blazer tarzı', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&auto=format&fit=crop&q=80'),
    ('Casual cuma kombini', 'Beyaz sneaker & jean mi, keten pantolon & gömlek mi?', 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&auto=format&fit=crop&q=80'),
    ('Konser için hangisi?', 'Deri ceket sokak tarzı mı yoksa crop ceket mi?', 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'),
    ('Hafta sonu gezisi için hangisi?', 'Rahat jogger kombini vs oversize trençkot', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&auto=format&fit=crop&q=80'),
    ('Sneakers mı Loafers mı?', 'Gün boyu ayakta olacağım hangisi daha tarz durur?', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&auto=format&fit=crop&q=80'),
    ('Ofis için casual şık hangisi?', 'Bej kumaş pantolon & blazer vs camel kaban', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800&auto=format&fit=crop&q=80'),
    ('Sokak tarzı 1 mi 2 mi?', 'Kargo pantolon & hoodie vs vintage ceket', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&auto=format&fit=crop&q=80'),
    ('Pazar brunch kombini', 'Çizgili oversize gömlek mi, triko kazak mı?', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'),
    ('Akşam yemeği için hangisi?', 'Saten gömlek & kumaş pantolon vs fit blazer', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=800&auto=format&fit=crop&q=80'),
    ('İlk buluşma kombini', 'Minimalist siyah tarz mı, bej tonlar mı?', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80'),
    ('Hava serin, hangisi?', 'Süet ceket mi şişme yelek mi?', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80'),
    ('Spor şık kombin seçimi', 'Gri sweat & kaban vs kapüşonlu mont', 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80'),
    ('Gündüz kahvesi tarzı', 'Baggy denim & crop vs pileli etek & kazak', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=80'),
    ('Sonbahar favorisi hangisi?', 'Deri trençkot mu kaşe kaban mı?', 'https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&auto=format&fit=crop&q=80'),
    ('Festival kombini 1 mi 2 mi?', 'Vintage denim ceket vs bohem gömlek', 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&auto=format&fit=crop&q=80'),
    ('Üniversite kampüs stili', 'Oversize sweatshirt vs triko hırka', 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=800&auto=format&fit=crop&q=80'),
    ('Doğum günü partisi için hangisi?', 'Siyah monochrome vs antrasit blazer', 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&auto=format&fit=crop&q=80'),
    ('Havaalanı rahatlığı', 'Jogger takım & sneaker vs oversize ceket', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=800&auto=format&fit=crop&q=80'),
    ('Hafta sonu şehir turu', 'Keten ceket & şapka vs kargo mont', 'https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=800&auto=format&fit=crop&q=80', 'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=800&auto=format&fit=crop&q=80');

  -- 5. Yeni botlar arasından 6 farklı kombin oylaması yayınla
  for v_post_record in (
    select title, description, image_a, image_b
    from tmp_outfit_pool
    order by random()
    limit 6
  ) loop
    v_post_idx := v_post_idx + 1;
    declare
      v_creator_id uuid := v_bot_ids[((v_post_idx - 1) % array_length(v_bot_ids, 1)) + 1];
    begin
      insert into public.posts (
        user_id, title, description, image_url, image_a_url, image_b_url, is_active, category, created_at
      )
      values (
        v_creator_id,
        v_post_record.title,
        v_post_record.description,
        v_post_record.image_a,
        v_post_record.image_a,
        v_post_record.image_b,
        true,
        'kombin',
        now() - ((v_post_idx * 12) || ' minutes')::interval
      )
      returning id into v_post_id;

      -- 6. Botlar birbirlerinin oylamalarına oy versin ve doğal yorumlar bıraksın
      for i in 1..array_length(v_bot_ids, 1) loop
        v_voter_id := v_bot_ids[i];
        if v_voter_id <> v_creator_id and random() > 0.35 then
          v_option := case when random() > 0.5 then 'A' else 'B' end;
          v_comment := case (floor(random() * 10))::int
            when 0 then 'Sol daha iyi oturmuş, net.'
            when 1 then 'Kesinlikle B kombini!'
            when 2 then 'A daha tarz ve ferah duruyor.'
            when 3 then 'B seçeneğindeki renk uyumu harika.'
            when 4 then '1 bence günlük için çok ideal.'
            when 5 then 'Ayakkabılarla birlikte B çok iyi gitmiş.'
            when 6 then 'A çok klas durmuş, kesinlikle A.'
            when 7 then 'B daha modern ve rahat.'
            when 8 then 'İkisi de güzel ama A bir tık önde.'
            else 'B kombini çok daha enerjik duruyor.'
          end;

          insert into public.votes (voter_id, post_id, value, selected_option, comment, created_at)
          values (v_voter_id, v_post_id, (v_option = 'B'), v_option, v_comment, now() - ((i * 4) || ' minutes')::interval)
          on conflict (voter_id, post_id) do nothing;
        end if;
      end loop;
    end;
  end loop;

  -- 7. Sıra sayacını güncelle
  update public.bot_seed_tracker
  set last_index = v_end_index, updated_at = now()
  where id = 1;

  return '12 yeni gerçekçi bot ve kombinleri başarıyla yüklendi! (Toplam ' || v_end_index::text || ' / 240 bot devrede)';
end;
$$;

-- Eski isimle uyumluluk için alias fonksiyon:
create or replace function public.seed_bots_and_posts()
returns text
language sql
security definer set search_path = public
as $$
  select public.seed_next_bot_batch(12);
$$;

-- 3. TUM BOTLARI VE VERILERINI SIFIRLAYIP YER ACAN FONKSIYON
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

  -- 5. Bot sıra sayacını sıfırla
  update public.bot_seed_tracker
  set last_index = 0, updated_at = now()
  where id = 1;

  get diagnostics v_deleted_count = row_count;

  return 'Tüm botlar, profilleri, gönderileri ve oyları veritabanından kalıcı olarak silindi. Bot sayacı sıfırlandı (0/240).';
end;
$$;

-- 4. GUVENLI VE HIYERARSIK ADMIN / KULLANICI ROL YONETIMI
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

-- Yardımcı fonksiyon: is_admin kontrolü
create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = user_id
      and (role = 'admin' or lower(coalesce(username, '')) = 'mehmetkarabul7tt')
  );
$$;

-- RLS: Adminlerin diğer profilleri güncellemesine izin ver
drop policy if exists "Admin profilleri güncelleyebilir" on public.profiles;
create policy "Admin profilleri güncelleyebilir"
  on public.profiles for update using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.profiles where id = auth.uid() and lower(username) = 'mehmetkarabul7tt'
    )
  );

-- RLS: Adminlerin rapor kayıtlarını silmesine izin ver
drop policy if exists "Admin raporları silebilir" on public.reports;
create policy "Admin raporları silebilir"
  on public.reports for delete using (
    public.is_admin(auth.uid()) or exists (
      select 1 from public.profiles where id = auth.uid() and lower(username) = 'mehmetkarabul7tt'
    )
  );

-- İlk 12 botu hemen içeri yükle:
select public.seed_next_bot_batch(12);
