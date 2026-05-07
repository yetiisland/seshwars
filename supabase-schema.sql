-- SPOTS TABLE
create table if not exists spots (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  type text,
  features text[],
  description text,
  address text,
  latitude double precision,
  longitude double precision,
  photos text[],
  added_by text,
  created_at timestamptz default now()
);

-- SAVED SPOTS TABLE
create table if not exists saved_spots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  spot_id uuid references spots(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, spot_id)
);

-- Enable Row Level Security
alter table spots enable row level security;
alter table saved_spots enable row level security;

-- Spots: anyone can read
create policy "Anyone can read spots"
  on spots for select using (true);

-- Spots: authenticated users can insert
create policy "Authenticated users can add spots"
  on spots for insert with check (auth.role() = 'authenticated');

-- Spots: owner can update/delete
create policy "Users can update own spots"
  on spots for update using (auth.uid()::text = added_by);

-- Saved spots: users manage their own
create policy "Users can manage saved spots"
  on saved_spots for all using (auth.uid() = user_id);

-- STORAGE BUCKET for spot photos
insert into storage.buckets (id, name, public)
values ('spot-photos', 'spot-photos', true)
on conflict do nothing;

-- Storage policy: anyone can view
create policy "Public spot photos"
  on storage.objects for select using (bucket_id = 'spot-photos');

-- Storage policy: authenticated users can upload
create policy "Authenticated users can upload spot photos"
  on storage.objects for insert with check (
    bucket_id = 'spot-photos' and auth.role() = 'authenticated'
  );

-- SEED: a few example spots in Denver
insert into spots (title, type, features, description, address, latitude, longitude, added_by)
values
  (
    'Denver Civic Center Ledges',
    'Street',
    array['Ledges','Marble','Flat Ground'],
    'Long marble ledges running the full length of the civic center plaza. Usually waxed up. Security is pretty chill on weekends.',
    'Civic Center Plaza, Denver CO 80203',
    39.7392, -104.9847,
    'admin'
  ),
  (
    '16th St Hubba',
    'Street',
    array['Stairs','Hubba','Granite'],
    'Granite hubba, 6 stairs down. Sketchy landing, bring a sponge. Best hit early morning.',
    '16th & Champa St, Denver CO',
    39.7440, -104.9932,
    'admin'
  ),
  (
    'Stapleton Skatepark',
    'Park',
    array['Bowl','Rails','Ledges','Flat Ground'],
    'Full park, good flow. Bowl in the back gets rowdy at night. Free to skate.',
    '7301 E 29th Ave, Denver CO 80238',
    39.7628, -104.8988,
    'admin'
  ),
  (
    'Washington Park Banks',
    'Street',
    array['Banks','Smooth Ground'],
    'Smooth granite banks on the north end of Wash Park. Usually chill, great after rain dries.',
    'Washington Park, Denver CO',
    39.7090, -104.9609,
    'admin'
  );
