CREATE TABLE device_events (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    kind VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX device_events_device_id_idx ON device_events (device_id);
CREATE INDEX device_events_created_at_idx ON device_events (created_at);
