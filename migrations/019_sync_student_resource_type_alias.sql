ALTER TABLE student_resources
  ADD COLUMN IF NOT EXISTS type text;

UPDATE student_resources
SET type = resource_type
WHERE type IS NULL;

CREATE OR REPLACE FUNCTION sync_student_resource_type_alias()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.type IS NULL THEN
      NEW.type := NEW.resource_type;
    ELSIF NEW.resource_type IS NULL THEN
      NEW.resource_type := NEW.type;
    ELSIF NEW.type <> NEW.resource_type THEN
      RAISE EXCEPTION 'type and resource_type must match';
    END IF;
  ELSIF NEW.type IS DISTINCT FROM OLD.type AND NEW.resource_type IS NOT DISTINCT FROM OLD.resource_type THEN
    NEW.resource_type := NEW.type;
  ELSIF NEW.resource_type IS DISTINCT FROM OLD.resource_type AND NEW.type IS NOT DISTINCT FROM OLD.type THEN
    NEW.type := NEW.resource_type;
  ELSIF NEW.type IS DISTINCT FROM NEW.resource_type THEN
    RAISE EXCEPTION 'type and resource_type must match';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_student_resource_type_alias_trigger ON student_resources;
CREATE TRIGGER sync_student_resource_type_alias_trigger
BEFORE INSERT OR UPDATE OF type, resource_type ON student_resources
FOR EACH ROW
EXECUTE FUNCTION sync_student_resource_type_alias();

ALTER TABLE student_resources
  ALTER COLUMN type SET NOT NULL;

NOTIFY pgrst, 'reload schema';
