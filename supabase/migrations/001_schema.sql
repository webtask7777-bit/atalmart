-- Atalmart Database Schema

-- Profiles (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  phone text unique,
  name text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'rider')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_hi text not null default '',
  icon text not null default '📦',
  sort_order int not null default 0,
  active boolean not null default true
);

alter table public.categories enable row level security;
create policy "Categories are viewable by everyone" on public.categories for select using (true);
create policy "Admins can manage categories" on public.categories for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_hi text not null default '',
  description text,
  category_id uuid references public.categories on delete set null,
  price numeric(10,2) not null,
  mrp numeric(10,2) not null,
  unit text not null default '1 pc',
  image_url text,
  stock int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
create policy "Products are viewable by everyone" on public.products for select using (true);
create policy "Admins can manage products" on public.products for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Addresses
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade not null,
  label text not null default 'Home',
  address_line text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.addresses enable row level security;
create policy "Users can view own addresses" on public.addresses for select using (auth.uid() = user_id);
create policy "Users can manage own addresses" on public.addresses for all using (auth.uid() = user_id);

-- Riders
create table public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique not null,
  vehicle_number text,
  status text not null default 'offline' check (status in ('available', 'busy', 'offline')),
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.riders enable row level security;
create policy "Riders viewable by authenticated" on public.riders for select using (auth.role() = 'authenticated');
create policy "Admins can manage riders" on public.riders for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete set null not null,
  status text not null default 'placed' check (status in ('placed','confirmed','picking','picked','out_for_delivery','delivered','cancelled')),
  total numeric(10,2) not null,
  delivery_fee numeric(10,2) not null default 25,
  discount numeric(10,2) not null default 0,
  address_line text not null,
  lat double precision not null,
  lng double precision not null,
  rider_id uuid references public.riders on delete set null,
  notes text,
  placed_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.orders enable row level security;
create policy "Users can view own orders" on public.orders for select using (auth.uid() = user_id);
create policy "Users can create orders" on public.orders for insert with check (auth.uid() = user_id);
create policy "Admins can manage all orders" on public.orders for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Order Items
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders on delete cascade not null,
  product_id uuid references public.products on delete set null,
  product_name text not null,
  quantity int not null,
  price numeric(10,2) not null
);

alter table public.order_items enable row level security;
create policy "Users can view own order items" on public.order_items for select using (
  exists (select 1 from public.orders where id = order_id and user_id = auth.uid())
);
create policy "Users can create order items" on public.order_items for insert with check (
  exists (select 1 from public.orders where id = order_id and user_id = auth.uid())
);
create policy "Admins can manage order items" on public.order_items for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Indexes
create index idx_products_category on public.products(category_id);
create index idx_products_active on public.products(active) where active = true;
create index idx_orders_user on public.orders(user_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_rider on public.orders(rider_id);
create index idx_order_items_order on public.order_items(order_id);

-- Function: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone, role)
  values (new.id, new.phone, 'customer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Realtime: enable for orders and rider locations
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.riders;
