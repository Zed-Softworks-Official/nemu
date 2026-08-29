ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_protocol_external_id_key;
ALTER TABLE devices ALTER COLUMN id DROP DEFAULT;
