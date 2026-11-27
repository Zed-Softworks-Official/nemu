DROP TRIGGER members_routing ON members;
DROP FUNCTION enqueue_membership_routing();
DROP TABLE membership_routing_outbox;
DELETE FROM settings WHERE key = 'membership_routing_epoch';
