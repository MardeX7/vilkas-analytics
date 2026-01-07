-- Luo exec_sql helper-funktio SQL:n ajamiseen
-- Aja tämä ENSIN Supabase SQL Editorissa!

CREATE OR REPLACE FUNCTION public.exec_sql(sql_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE sql_text;
  RETURN jsonb_build_object('success', true, 'message', 'SQL executed successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$$;

-- Anna oikeudet
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO authenticated;

COMMENT ON FUNCTION public.exec_sql IS 'Helper-funktio SQL:n ajamiseen ohjelmallisesti';
