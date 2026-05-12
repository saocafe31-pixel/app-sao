-- Add unique constraint on public."order"."OrderID" to prevent duplicate orders.
-- Safe to run multiple times (idempotent). Will fail with a clear message
-- if duplicate/non-null OrderID values already exist.

DO $$
DECLARE
  has_orderid_column boolean;
  has_constraint boolean;
  duplicate_count bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order'
      AND column_name = 'OrderID'
  )
  INTO has_orderid_column;

  IF NOT has_orderid_column THEN
    RAISE NOTICE 'Skip: column public."order"."OrderID" does not exist.';
    RETURN;
  END IF;

  -- If duplicates exist, stop and ask for cleanup before adding UNIQUE.
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT "OrderID"
    FROM public."order"
    WHERE "OrderID" IS NOT NULL
    GROUP BY "OrderID"
    HAVING COUNT(*) > 1
  ) d;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Cannot add unique constraint on public."order"."OrderID": found % duplicated value set(s). Please deduplicate first.', duplicate_count;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'order'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.constraint_name = 'unique_order_orderid'
      AND kcu.column_name = 'OrderID'
  )
  INTO has_constraint;

  IF has_constraint THEN
    RAISE NOTICE 'Constraint already exists: unique_order_orderid';
    RETURN;
  END IF;

  ALTER TABLE public."order"
    ADD CONSTRAINT unique_order_orderid UNIQUE ("OrderID");

  RAISE NOTICE 'Added constraint: unique_order_orderid on public."order"("OrderID")';
END
$$;

