BEGIN;
SELECT plan(30);

SELECT has_table('public', 'profiles', 'profiles table exists');
SELECT has_table('public', 'user_preferences', 'user_preferences table exists');
SELECT has_table('public', 'linked_wallets', 'linked_wallets table exists');
SELECT has_table('public', 'house_registration_drafts', 'house_registration_drafts table exists');
SELECT has_table('public', 'saved_days', 'saved_days table exists');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_preferences'::regclass), 'user_preferences has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.linked_wallets'::regclass), 'linked_wallets has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.house_registration_drafts'::regclass), 'house drafts have RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.saved_days'::regclass), 'saved days have RLS enabled');

SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'), 4, 'profiles has four owner policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_preferences'), 4, 'user_preferences has four owner policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'house_registration_drafts'), 4, 'house drafts have four owner policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'saved_days'), 4, 'saved days have four owner policies');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'linked_wallets'), 2, 'linked wallets only have owner read/delete policies');

-- The postgres test role creates fixture auth users, then all assertions below
-- execute through the same authenticated/anon roles used by the Data API.
DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-4000-8000-0000000000aa', 'rls-a@example.test')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-4000-8000-0000000000ab', 'rls-b@example.test')
  ON CONFLICT (id) DO NOTHING;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000aa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT results_eq($sql$
  INSERT INTO public.profiles (id, display_name)
  VALUES ('00000000-0000-4000-8000-0000000000aa', 'RLS A')
$sql$ RETURNING display_name$sql$, ARRAY['RLS A'], 'user A can insert their own profile');
SELECT results_eq($sql$
  INSERT INTO public.user_preferences (user_id, default_scenario, compact_navigation)
  VALUES ('00000000-0000-4000-8000-0000000000aa', 'rainy', false)
$sql$ RETURNING default_scenario$sql$, ARRAY['rainy'], 'user A can insert their own preferences');
SELECT results_eq($sql$
  INSERT INTO public.house_registration_drafts (draft_id, user_id, label, solar_enabled, battery_enabled, battery_capacity_wh)
  VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000aa', 'RLS draft', true, true, 1000)
$sql$ RETURNING label$sql$, ARRAY['RLS draft'], 'user A can insert their own draft');
SELECT results_eq($sql$
  INSERT INTO public.saved_days (user_id, day_id, chain_id, market_address, scenario, seed, saved_at)
  VALUES ('00000000-0000-4000-8000-0000000000aa', '0x00000000000000000000000000000000000000000000000000000000000000aa', 91562037, '0x00000000000000000000000000000000000000aa', 'rainy', 'rls-seed', timezone('utc', now()))
$sql$ RETURNING seed$sql$, ARRAY['rls-seed'], 'user A can insert their own saved day');
SELECT is((SELECT count(*)::int FROM public.profiles), 1, 'user A can read their own profile');
SELECT results_eq($sql$
  UPDATE public.profiles SET display_name = 'RLS A updated'
  WHERE id = '00000000-0000-4000-8000-0000000000aa'
$sql$ RETURNING display_name$sql$, ARRAY['RLS A updated'], 'user A can update their own profile');

SELECT throws_ok($sql$
  INSERT INTO public.user_preferences (user_id, default_scenario)
  VALUES ('00000000-0000-4000-8000-0000000000ab', 'sunny')
$sql$, '42501', NULL, 'forged user_id cannot insert preferences');
SELECT throws_ok($sql$
  UPDATE public.house_registration_drafts
  SET user_id = '00000000-0000-4000-8000-0000000000ab'
  WHERE draft_id = '00000000-0000-4000-8000-0000000000aa'
$sql$, '42501', NULL, 'user A cannot reassign a draft to user B');
SELECT throws_ok($sql$
  INSERT INTO public.linked_wallets (user_id, wallet_address, chain_id, verified_at)
  VALUES ('00000000-0000-4000-8000-0000000000aa', '0x00000000000000000000000000000000000000aa', 91562037, timezone('utc', now()))
$sql$, '42501', NULL, 'authenticated clients cannot forge verified wallet links');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ab', true);
SELECT is((SELECT count(*)::int FROM public.user_preferences), 0, 'user B cannot read user A preferences');
SELECT is((SELECT count(*)::int FROM public.house_registration_drafts), 0, 'user B cannot read user A drafts');
SELECT is_empty($sql$
  DELETE FROM public.house_registration_drafts
  WHERE draft_id = '00000000-0000-4000-8000-0000000000aa'
$sql$ RETURNING draft_id$sql$, 'user B cannot delete user A draft');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000aa', true);
SELECT is((SELECT count(*)::int FROM public.house_registration_drafts), 1, 'user B delete did not remove user A draft');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', null, true);
SELECT throws_ok($sql$SELECT count(*) FROM public.profiles$sql$, '42501', NULL, 'anon cannot read account tables');
SELECT throws_ok($sql$
  INSERT INTO public.user_preferences (user_id, default_scenario)
  VALUES ('00000000-0000-4000-8000-0000000000aa', 'sunny')
$sql$, '42501', NULL, 'anon cannot write account tables');

SELECT * FROM finish();
ROLLBACK;
