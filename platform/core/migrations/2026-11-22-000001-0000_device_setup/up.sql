-- Device tombstones keep a removed Device's identity and metadata (ADR-0017).
-- room_id has no foreign key: it is a snapshot, and the Room may be deleted later.
CREATE TABLE device_tombstones (
    device_id UUID PRIMARY KEY,
    protocol VARCHAR(16) NOT NULL,
    external_id VARCHAR(64) NOT NULL,
    friendly_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    model VARCHAR(255),
    room_id UUID,
    component_rooms JSONB NOT NULL DEFAULT '{}'::jsonb,
    removed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX device_tombstones_identity_idx
    ON device_tombstones (protocol, external_id);

-- A Component inherits its Device's Room unless a row here assigns another Room.
-- Rooms with assigned Components cannot be deleted until they are reassigned.
CREATE TABLE component_rooms (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    component_id VARCHAR(255) NOT NULL,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    PRIMARY KEY (device_id, component_id)
);

CREATE INDEX component_rooms_room_idx ON component_rooms (room_id);
