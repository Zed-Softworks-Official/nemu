-- Membership routing projections name the Membership's Access Clients
-- (NEM-63 review), so Convex accepts a Relay envelope only for an Access
-- Client of the Account that posts it. Pairing or revoking an Access Client
-- under an active Membership republishes that Membership, in the same
-- transaction. The publisher reads the Access Client IDs when it signs.
--
-- A cascade from deleting the Member runs after the Member row is gone, so
-- it finds no active Membership here; `members_routing` already enqueued
-- the `ended` row.
CREATE FUNCTION enqueue_access_client_routing() RETURNS trigger AS $$
DECLARE
    target_member UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_member := OLD.member_id;
    ELSE
        target_member := NEW.member_id;
    END IF;
    INSERT INTO membership_routing_outbox (membership_id, account_id, state)
    SELECT m.id, m.user_id, 'active'
    FROM members m
    WHERE m.id = target_member
      AND m.status = 'active'
      AND m.user_id IS NOT NULL;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_clients_routing
    AFTER INSERT OR DELETE ON access_clients
    FOR EACH ROW EXECUTE FUNCTION enqueue_access_client_routing();
