-- เพิ่มฟิลด์สำหรับ product options / email-restricted visibility / bundle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'ProductOptions'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "ProductOptions" jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'SaleRestrictedToUsers'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "SaleRestrictedToUsers" boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'AllowedViewerEmails'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "AllowedViewerEmails" jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'IsBundle'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "IsBundle" boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'BundleFlexible'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "BundleFlexible" boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'BundlePrimaryProductId'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "BundlePrimaryProductId" text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'BundleLines'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "BundleLines" jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'BundleComponentSumEqualsPrimary'
  ) THEN
    ALTER TABLE public.products ADD COLUMN "BundleComponentSumEqualsPrimary" boolean NOT NULL DEFAULT false;
  END IF;
END $$;

