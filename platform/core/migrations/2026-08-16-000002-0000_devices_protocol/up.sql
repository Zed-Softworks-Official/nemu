-- Generalize device identity so bridges other than zigbee2mqtt can register
-- devices. `external_id` is the bridge-scoped identity: the z2m ieee address
-- for Zigbee, the matter node id (`nodeId` or `nodeId:endpoint`) for Matter.
ALTER TABLE devices ADD COLUMN protocol VARCHAR(16) NOT NULL DEFAULT 'zigbee';
ALTER TABLE devices RENAME COLUMN ieee_address TO external_id;
ALTER TABLE devices ALTER COLUMN external_id TYPE VARCHAR(64);
ALTER TABLE devices DROP CONSTRAINT devices_ieee_address_key;
ALTER TABLE devices ADD CONSTRAINT devices_protocol_external_id_key UNIQUE (protocol, external_id);
