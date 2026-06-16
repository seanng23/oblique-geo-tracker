-- Public audit log — backs the per-site rate limit on the public AI Visibility
-- Checker. Each domain can run one public audit per 30 days (cost control).
create table if not exists public.public_audit_log (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  email text,
  ip text,
  brand text,
  created_at timestamptz not null default now()
);

create index if not exists idx_public_audit_log_domain_created
  on public.public_audit_log (domain, created_at desc);

-- Written only by the service-role public-audit endpoint. RLS on with no policies
-- means anon/public clients have no access; the service role bypasses RLS.
alter table public.public_audit_log enable row level security;
