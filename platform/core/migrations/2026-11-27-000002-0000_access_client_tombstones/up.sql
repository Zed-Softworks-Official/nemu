-- Access Client tombstones (ADR-0001, NEM-127). Removing an Access Client
-- for any reason (revocation, revoking the current Access Client, Leaving a
-- Home, removing a Member) leaves a tombstone with its ID and both public
-- keys. The Controller refuses a tombstoned ID or key over LAN and Relay and
-- never issues it a new grant.
--
-- The trigger writes the tombstone in the same transaction as the delete, so
-- no removal path (including the ON DELETE CASCADE from members) can skip it.
-- Tombstones are never deleted or changed: the second trigger refuses both.
CREATE TABLE access_client_tombstones (
    access_client_id UUID PRIMARY KEY,
    signing_key BYTEA NOT NULL UNIQUE CHECK (octet_length(signing_key) = 32),
    encryption_key BYTEA NOT NULL UNIQUE CHECK (octet_length(encryption_key) = 32),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE FUNCTION tombstone_access_client() RETURNS trigger AS $$
BEGIN
    INSERT INTO access_client_tombstones (access_client_id, signing_key, encryption_key)
    VALUES (OLD.id, OLD.signing_key, OLD.encryption_key)
    ON CONFLICT DO NOTHING;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_clients_tombstone
    AFTER DELETE ON access_clients
    FOR EACH ROW EXECUTE FUNCTION tombstone_access_client();

CREATE FUNCTION refuse_tombstone_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'access client tombstones are permanent';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_client_tombstones_permanent
    BEFORE UPDATE OR DELETE ON access_client_tombstones
    FOR EACH ROW EXECUTE FUNCTION refuse_tombstone_change();
