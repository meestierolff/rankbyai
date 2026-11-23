-- Online prompt packs: buyer prompts with no place in them ("best SEO tools", "top CRM software"),
-- for businesses that sell online. Such a scan is asked once, without location settings, and
-- Gemini is grounded on Google Search instead of Google Maps (src/lib/providers/gemini.ts).
--
-- scans.geo_mode: 'local' (every scan until now: asked at a map point) or 'online'.
-- prompt_packs.scope and prompt_pack_runs.scope: the same choice for a pack and each of its runs.
-- Constant defaults: existing rows read as 'local' without a table rewrite.

alter table public.scans add column if not exists geo_mode text not null default 'local' check (geo_mode in ('local', 'online'));
alter table public.prompt_packs add column if not exists scope text not null default 'local' check (scope in ('local', 'online'));
alter table public.prompt_pack_runs add column if not exists scope text not null default 'local' check (scope in ('local', 'online'));

notify pgrst, 'reload schema';
