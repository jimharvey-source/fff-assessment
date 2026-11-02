-- =====================================================================
-- fff schema  ·  FFF Pro paid report
-- Lives on DelegateIgnite (fdiitxhgfytvlbtokbok) beside osci. Safe there
-- only because FFF Pro has no sign-in: service role only, no policies.
-- If FFF Pro ever adds accounts, it moves to its own Supabase project first.
-- Run once in the Supabase SQL editor. Safe to run again.
-- =====================================================================

create schema if not exists fff;

create table if not exists fff.runs (
  token            text primary key,
  name             text not null,
  email            text not null,
  answers          jsonb not null,           -- raw 1 to 5, keyed by item id
  scoring          jsonb not null,           -- computed on the server
  scoring_version  text,
  narrative        jsonb,                    -- the three personal paragraphs, written once
  created_at       timestamptz not null default now()
);

-- A programme is a client buying seats. Price is net of VAT, in pence.
create table if not exists fff.cohort_codes (
  code              text primary key,        -- upper case, no spaces
  label             text not null,           -- "AccessPay managers, Jan 2027"
  client            text,                    -- who you invoice
  price_per_seat    integer not null default 2900,  -- pence, net of VAT
  invoice_ref       text,
  max_uses          integer,
  uses              integer not null default 0,
  active            boolean not null default true,
  expires_at        timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists fff.orders (
  stripe_session_id         text primary key,   -- or a coh_ id for a programme seat
  stripe_payment_intent_id  text,
  token                     text not null references fff.runs(token),
  status                    text not null check (status in ('pending','paid','refunded','failed')),
  amount_total              integer,
  currency                  text,
  promo_code                text,
  cohort_code               text references fff.cohort_codes(code),
  email                     text,
  paid_at                   timestamptz,
  first_generated_at        timestamptz,
  last_generated_at         timestamptz,
  generation_count          integer not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Failed code attempts, for the ten-an-hour throttle. IP is hashed.
create table if not exists fff.code_attempts (
  id        bigserial primary key,
  ip_hash   text not null,
  at        timestamptz not null default now()
);

alter table fff.runs add column if not exists narrative jsonb;
alter table fff.runs add column if not exists marketing_opt_in boolean not null default false;

create index if not exists fff_orders_token_idx   on fff.orders (token);
create index if not exists fff_orders_pi_idx      on fff.orders (stripe_payment_intent_id);
create index if not exists fff_orders_cohort_idx  on fff.orders (cohort_code);
create index if not exists fff_runs_email_idx     on fff.runs (email);
create index if not exists fff_attempts_idx       on fff.code_attempts (ip_hash, at);

alter table fff.runs          enable row level security;
alter table fff.orders        enable row level security;
alter table fff.cohort_codes  enable row level security;
alter table fff.code_attempts enable row level security;
-- No policies by design.

create or replace function fff.redeem_cohort_code(p_code text)
returns table (label text)
language sql security definer set search_path = fff as $$
  update fff.cohort_codes set uses = uses + 1
   where code = upper(trim(p_code)) and active
     and (max_uses is null or uses < max_uses)
     and (expires_at is null or expires_at > now())
  returning cohort_codes.label;
$$;

create or replace function fff.release_cohort_code(p_code text)
returns void
language sql security definer set search_path = fff as $$
  update fff.cohort_codes set uses = greatest(uses - 1, 0) where code = upper(trim(p_code));
$$;

-- What to invoice: one row per programme, seats used, net, VAT, gross.
create or replace view fff.seat_report as
select c.code, c.label, c.client, c.invoice_ref, c.max_uses, c.uses as seats_used,
       c.price_per_seat,
       c.uses * c.price_per_seat                          as net_pence,
       round(c.uses * c.price_per_seat * 0.20)::integer   as vat_pence,
       round(c.uses * c.price_per_seat * 1.20)::integer   as gross_pence,
       c.active, c.expires_at
  from fff.cohort_codes c;

revoke all on function fff.redeem_cohort_code(text)  from public, anon, authenticated;
revoke all on function fff.release_cohort_code(text) from public, anon, authenticated;
grant usage on schema fff to service_role;
grant all on all tables in schema fff to service_role;
grant all on all sequences in schema fff to service_role;
grant select on fff.seat_report to service_role;
grant execute on function fff.redeem_cohort_code(text)  to service_role;
grant execute on function fff.release_cohort_code(text) to service_role;
alter default privileges in schema fff grant all on tables to service_role;

-- ---------------------------------------------------------------------
-- Add a programme (copy, edit, run):
-- insert into fff.cohort_codes (code, label, client, price_per_seat, max_uses, expires_at)
-- values ('ACCESSPAY27', 'AccessPay managers, January 2027', 'AccessPay Ltd', 2900, 25, '2027-03-31');
-- Test code:
-- insert into fff.cohort_codes (code, label, client, price_per_seat, max_uses, expires_at)
-- values ('FFFTEST26', 'Jim end-to-end test', 'Test', 0, 5, '2026-12-31');
-- What to invoice:   select * from fff.seat_report where code = 'ACCESSPAY27';
-- Who used it:       select email, paid_at from fff.orders where cohort_code = 'ACCESSPAY27' order by paid_at;
-- Switch off:        update fff.cohort_codes set active = false where code = 'ACCESSPAY27';
-- ---------------------------------------------------------------------
