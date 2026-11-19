-- Whether AI assistants are asked in the business's own language (its language setting, else its
-- country's), or in English.
--
-- Businesses that exist today keep English, so their next scans stay comparable with their earlier
-- ones; the owner can switch per business. Businesses added from now on are asked in their own
-- language where RankbyAI has a written question for it (src/lib/scans/prompt.ts); for every other
-- language, and for English-speaking countries, the question stays English.

alter table public.businesses add column if not exists ask_in_language boolean not null default false;
alter table public.businesses alter column ask_in_language set default true;
