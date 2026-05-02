CREATE OR REPLACE FUNCTION public.search_admin_audit_log(
  p_search text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_actor uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  action text,
  target_table text,
  target_id text,
  old_values jsonb,
  new_values jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_like text := CASE WHEN v_search IS NULL THEN NULL ELSE '%' || v_search || '%' END;
BEGIN
  IF NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      a.id, a.created_at, a.actor_user_id,
      COALESCE(p.display_name, p.username, a.actor_user_id::text) AS actor_name,
      a.action, a.target_table, a.target_id, a.old_values, a.new_values
    FROM public.admin_audit_log a
    LEFT JOIN public.profiles p ON p.id = a.actor_user_id
    WHERE (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to   IS NULL OR a.created_at <= p_to)
      AND (p_action IS NULL OR p_action = '' OR a.action = p_action)
      AND (p_actor IS NULL OR a.actor_user_id = p_actor)
      AND (
        v_like IS NULL
        OR a.action ILIKE v_like
        OR a.target_table ILIKE v_like
        OR COALESCE(a.target_id, '') ILIKE v_like
        OR COALESCE(a.old_values::text, '') ILIKE v_like
        OR COALESCE(a.new_values::text, '') ILIKE v_like
        OR COALESCE(p.display_name, '') ILIKE v_like
        OR COALESCE(p.username, '') ILIKE v_like
        OR a.actor_user_id::text ILIKE v_like
      )
  ), counted AS (
    SELECT count(*)::bigint AS c FROM base
  )
  SELECT b.id, b.created_at, b.actor_user_id, b.actor_name,
         b.action, b.target_table, b.target_id, b.old_values, b.new_values,
         (SELECT c FROM counted) AS total_count
  FROM base b
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500))
  OFFSET GREATEST(0, p_offset);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_admin_audit_log(text, text, uuid, timestamptz, timestamptz, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_admin_audit_log(text, text, uuid, timestamptz, timestamptz, int, int) TO authenticated;
