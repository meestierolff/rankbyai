-- Business languages use the same codes as the country table (src/lib/countries.ts), which include
-- a script or region part for some languages: zh-CN, zh-TW, sr-Latn. Widen the check from 0009.
alter table public.businesses drop constraint if exists businesses_language_check;
alter table public.businesses add constraint businesses_language_check check (language is null or language ~ '^[a-z]{2,3}(-[A-Za-z]{2,4})?$');
