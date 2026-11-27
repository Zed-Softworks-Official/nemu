-- Membership routing outbox (ADR-0005, NEM-133). Every change to whether an
-- Account holds an active Membership becomes a row here, in the same
-- transaction as the change, so no path (pairing, accepting an Invitation,
-- removing a Member, Leaving a Home, a restore) can skip it. Core signs each
-- row with the Controller's Ed25519 identity key and publishes it to Convex,
-- retrying until Convex acknowledges it (`pairing::routing`).
--
-- Rows hold routing facts only: the Membership, the Account's identity
-- reference and active/ended. No role, name or email.
CREATE TABLE membership_routing_outbox (
    sequence BIGSERIAL PRIMARY KEY,
    membership_id UUID NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    state VARCHAR(16) NOT NULL CHECK (state IN ('active', 'ended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX membership_routing_outbox_unpublished
    ON membership_routing_outbox (sequence)
    WHERE published_at IS NULL;

-- An Account routes to a Membership while the Membership is active and bound
-- to that Account. A pending Invitation has no Account yet, so it publishes
-- nothing until it is accepted.
CREATE FUNCTION enqueue_membership_routing() RETURNS trigger AS $$
DECLARE
    old_account VARCHAR(255);
    new_account VARCHAR(255);
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.status = 'active' THEN
        old_account := OLD.user_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status = 'active' THEN
        new_account := NEW.user_id;
    END IF;
    IF old_account IS NOT NULL AND old_account IS DISTINCT FROM new_account THEN
        INSERT INTO membership_routing_outbox (membership_id, account_id, state)
        VALUES (OLD.id, old_account, 'ended');
    END IF;
    IF new_account IS NOT NULL AND new_account IS DISTINCT FROM old_account THEN
        INSERT INTO membership_routing_outbox (membership_id, account_id, state)
        VALUES (NEW.id, new_account, 'active');
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER members_routing
    AFTER INSERT OR UPDATE OR DELETE ON members
    FOR EACH ROW EXECUTE FUNCTION enqueue_membership_routing();
