-- Default privileges belong to the role that creates an object. A cloud migration connection
-- can use a different role from the initial schema setup, so restrict these functions explicitly.
-- Only the application server may read the house budget or claim checks with budget parameters.
revoke all on function public.free_check_budget(), public.free_check_claim(uuid, numeric, numeric, numeric, int)
  from public, anonymous, authenticated;
grant execute on function public.free_check_budget(), public.free_check_claim(uuid, numeric, numeric, numeric, int)
  to service_role;

notify pgrst, 'reload schema';
