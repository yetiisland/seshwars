-- ============================================================
-- SPOTS TABLE
-- ============================================================
create table if not exists spots (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  slug text,
  type text,
  features text[],
  bust_rating text,
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  photos text[],
  added_by text,
  created_at timestamptz default now()
);

-- Add columns if upgrading an existing DB
alter table spots add column if not exists bust_rating text;
alter table spots add column if not exists slug text;

-- Generate slugs for existing spots (run once)
-- UPDATE spots SET slug = lower(regexp_replace(regexp_replace(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g')) WHERE slug IS NULL;

-- ============================================================
-- SAVED SPOTS TABLE
-- ============================================================
create table if not exists saved_spots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  spot_id uuid references spots(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, spot_id)
);

-- ============================================================
-- PROFILES TABLE
-- ============================================================
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text,
  first_name text,
  last_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table spots enable row level security;
alter table saved_spots enable row level security;
alter table profiles enable row level security;

-- Spots: anyone can read
drop policy if exists "Anyone can read spots" on spots;
create policy "Anyone can read spots"
  on spots for select using (true);

-- Spots: authenticated users can insert
drop policy if exists "Authenticated users can add spots" on spots;
create policy "Authenticated users can add spots"
  on spots for insert with check (auth.role() = 'authenticated');

-- Spots: any authenticated user can update any spot
-- (app-level password auth "maxeffort" gates this in the UI)
drop policy if exists "Users can update own spots" on spots;
drop policy if exists "Authenticated users can update spots" on spots;
create policy "Authenticated users can update spots"
  on spots for update using (auth.role() = 'authenticated');

-- Spots: any authenticated user can delete
drop policy if exists "Authenticated users can delete spots" on spots;
create policy "Authenticated users can delete spots"
  on spots for delete using (auth.role() = 'authenticated');

-- Saved spots: users manage their own
drop policy if exists "Users can manage saved spots" on saved_spots;
create policy "Users can manage saved spots"
  on saved_spots for all using (auth.uid() = user_id);

-- Profiles: anyone can read
drop policy if exists "Users can view all profiles" on profiles;
create policy "Users can view all profiles"
  on profiles for select using (true);

-- Profiles: users manage their own
drop policy if exists "Users can manage own profile" on profiles;
create policy "Users can manage own profile"
  on profiles for all using (auth.uid() = id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Spot photos bucket
insert into storage.buckets (id, name, public)
values ('spot-photos', 'spot-photos', true)
on conflict do nothing;

drop policy if exists "Public spot photos" on storage.objects;
create policy "Public spot photos"
  on storage.objects for select using (bucket_id = 'spot-photos');

drop policy if exists "Authenticated users can upload spot photos" on storage.objects;
create policy "Authenticated users can upload spot photos"
  on storage.objects for insert with check (
    bucket_id = 'spot-photos' and auth.role() = 'authenticated'
  );

drop policy if exists "Authenticated users can update spot photos" on storage.objects;
create policy "Authenticated users can update spot photos"
  on storage.objects for update using (
    bucket_id = 'spot-photos' and auth.role() = 'authenticated'
  );

-- Avatars bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict do nothing;

drop policy if exists "Public avatars" on storage.objects;
create policy "Public avatars"
  on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "Authenticated users can upload avatars" on storage.objects;
create policy "Authenticated users can upload avatars"
  on storage.objects for insert with check (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
  );

drop policy if exists "Authenticated users can update avatars" on storage.objects;
create policy "Authenticated users can update avatars"
  on storage.objects for update using (
    bucket_id = 'avatars' and auth.role() = 'authenticated'
  );

-- ============================================================
-- SAVED SPOTS: add list_id column for list membership
-- Favorites = list_id IS NULL; custom list items = list_id = <uuid>
-- ============================================================
alter table saved_spots add column if not exists list_id uuid references spot_lists(id) on delete cascade;

-- Drop the old unique(user_id, spot_id) constraint (a spot can now be in both favorites AND lists)
-- Run once if upgrading:
-- alter table saved_spots drop constraint if exists saved_spots_user_id_spot_id_key;

-- Partial unique indexes so a spot is saved at most once per list/favorites slot
create unique index if not exists saved_spots_favorites_unique
  on saved_spots (user_id, spot_id) where list_id is null;

create unique index if not exists saved_spots_list_unique
  on saved_spots (user_id, spot_id, list_id) where list_id is not null;

-- ============================================================
-- SPOT LISTS TABLE
-- ============================================================
create table if not exists spot_lists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
alter table spot_lists enable row level security;
drop policy if exists "Users can manage own lists" on spot_lists;
create policy "Users can manage own lists"
  on spot_lists for all using (auth.uid() = user_id);

-- ============================================================
-- SPOT LIST ITEMS TABLE
-- ============================================================
create table if not exists spot_list_items (
  id uuid default gen_random_uuid() primary key,
  list_id uuid references spot_lists(id) on delete cascade,
  spot_id uuid references spots(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique(list_id, spot_id)
);
alter table spot_list_items enable row level security;
drop policy if exists "Users can manage own list items" on spot_list_items;
create policy "Users can manage own list items"
  on spot_list_items for all using (auth.uid() = user_id);

-- ============================================================
-- SEED DATA (Denver spots)
-- ============================================================
insert into spots (title, type, features, bust_rating, description, address, latitude, longitude, added_by)
values
  (
    'Denver Civic Center Ledges',
    'Street',
    array['Ledges', 'Flat Ground'],
    'Weekends Only',
    'Long marble ledges running the full length of the civic center plaza. Usually waxed up. Security is pretty chill on weekends.',
    'Civic Center Plaza, Denver CO 80203',
    39.7392, -104.9847,
    'admin'
  ),
  (
    '16th St Hubba',
    'Street',
    array['Stairs', 'Hubba'],
    'Bust',
    'Granite hubba, 6 stairs down. Sketchy landing, bring a sponge. Best hit early morning.',
    '16th & Champa St, Denver CO',
    39.7440, -104.9932,
    'admin'
  ),
  (
    'Stapleton Skatepark',
    'Park',
    array['Banks', 'Hand Rail', 'Ledges', 'Flat Ground'],
    'No Bust',
    'Full park, good flow. Bowl in the back gets rowdy at night. Free to skate.',
    '7301 E 29th Ave, Denver CO 80238',
    39.7628, -104.8988,
    'admin'
  ),
  (
    'Washington Park Banks',
    'Street',
    array['Banks'],
    'No Bust',
    'Smooth granite banks on the north end of Wash Park. Usually chill, great after rain dries.',
    'Washington Park, Denver CO',
    39.7090, -104.9609,
    'admin'
  )
on conflict do nothing;
