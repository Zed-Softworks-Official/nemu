-- Diesel upserts with ON CONFLICT (protocol, external_id). An older schema
-- left UNIQUE (source, external_id) instead, so Matter/Zigbee inserts failed
-- before any row was written. Also restore id generation dropped by that schema.
ALTER TABLE devices ALTER COLUMN id SET DEFAULT gen_random_uuid();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'devices'::regclass
          AND conname = 'devices_protocol_external_id_key'
    ) THEN
        ALTER TABLE devices
            ADD CONSTRAINT devices_protocol_external_id_key
            UNIQUE (protocol, external_id);
    END IF;
END $$;
