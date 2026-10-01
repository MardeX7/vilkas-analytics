-- =============================================================================
-- Order status from ePages: rejected orders stop counting as sales
-- =============================================================================
--
-- Every orders row was status 'pending' with paid_on, dispatched_on and
-- delivered_on NULL. The syncs read order.status, which ePages does not send:
-- an ePages order carries its state as timestamps on the order itself
-- (rejectedOn, paidOn, dispatchedOn, deliveredOn, returnedOn, closedOn).
-- Every sales view and nearly every query already excludes status 'cancelled',
-- so rejected orders were counted as sales only because nothing was ever
-- cancelled. Automaalit 10/2025-9/2026: 77 rejected orders, 7 753.79 EUR;
-- Billackering: 46. ePages' own sales figures leave them out, returned and
-- closed orders in.
--
-- api/lib/epagesOrderStatus.js derives the columns; the syncs write them on
-- insert and refresh recently updated orders through sync_order_statuses().

-- Status columns for orders that are already stored. Rows not in the table are
-- ignored: this never creates an order. Returns how many rows matched and how
-- many actually changed.
CREATE OR REPLACE FUNCTION public.sync_order_statuses(p_store_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS r(
      epages_order_id text,
      status text,
      paid_on timestamptz,
      dispatched_on timestamptz,
      delivered_on timestamptz,
      closed_on timestamptz
    )
  ),
  changed AS (
    UPDATE orders o
       SET status = i.status,
           paid_on = i.paid_on,
           dispatched_on = i.dispatched_on,
           delivered_on = i.delivered_on,
           closed_on = i.closed_on
      FROM incoming i
     WHERE o.store_id = p_store_id
       AND o.epages_order_id = i.epages_order_id
       AND (o.status, o.paid_on, o.dispatched_on, o.delivered_on, o.closed_on)
           IS DISTINCT FROM (i.status, i.paid_on, i.dispatched_on, i.delivered_on, i.closed_on)
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'matched', (SELECT count(*) FROM orders o JOIN incoming i
                  ON o.store_id = p_store_id AND o.epages_order_id = i.epages_order_id),
    'changed', (SELECT count(*) FROM changed)
  );
$function$;

-- Sync only: no member of a shop writes order status.
REVOKE EXECUTE ON FUNCTION public.sync_order_statuses(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_statuses(uuid, jsonb) TO service_role;

-- The order value buckets were the one sales function without the filter.
CREATE OR REPLACE FUNCTION public.get_order_bucket_distribution(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(bucket text, order_count bigint, total_revenue numeric, avg_order_value numeric, b2b_count bigint, b2c_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_config JSONB;
  v_low_threshold INT;
  v_high_threshold INT;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Get store config for bucket thresholds
  SELECT COALESCE(config, '{}'::JSONB) INTO v_config
  FROM stores
  WHERE id = p_store_id;

  -- Parse thresholds from JSON array: [low, high] e.g. [800, 1500]
  v_low_threshold := COALESCE((v_config->'order_buckets'->>0)::INT, 800);
  v_high_threshold := COALESCE((v_config->'order_buckets'->>1)::INT, 1500);

  -- Return bucket distribution using line items
  RETURN QUERY
  WITH order_totals AS (
    SELECT
      o.id,
      o.is_b2b,
      o.is_b2b_soft,
      COALESCE(SUM(li.total_price), 0) AS order_total
    FROM orders o
    LEFT JOIN order_line_items li ON li.order_id = o.id
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= p_start_date
      AND o.creation_date::DATE <= p_end_date
      AND o.status <> 'cancelled'
    GROUP BY o.id, o.is_b2b, o.is_b2b_soft
  )
  SELECT
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END AS bucket,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(ot.order_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(ot.order_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(*) FILTER (WHERE ot.is_b2b = TRUE OR ot.is_b2b_soft = TRUE)::BIGINT AS b2b_count,
    COUNT(*) FILTER (WHERE ot.is_b2b = FALSE AND (ot.is_b2b_soft = FALSE OR ot.is_b2b_soft IS NULL))::BIGINT AS b2c_count
  FROM order_totals ot
  GROUP BY
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END
  ORDER BY
    MIN(CASE
      WHEN ot.order_total < v_low_threshold THEN 1
      WHEN ot.order_total < v_high_threshold THEN 2
      ELSE 3
    END);
END;
$function$;
