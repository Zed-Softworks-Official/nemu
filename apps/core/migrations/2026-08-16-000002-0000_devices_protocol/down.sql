ALTER TABLE devices DROP CONSTRAINT devices_protocol_external_id_key;
DELETE FROM devices WHERE protocol <> 'zigbee';
ALTER TABLE devices ALTER COLUMN external_id TYPE VARCHAR(24);
ALTER TABLE devices RENAME COLUMN external_id TO ieee_address;
ALTER TABLE devices ADD CONSTRAINT devices_ieee_address_key UNIQUE (ieee_address);
ALTER TABLE devices DROP COLUMN protocol;
