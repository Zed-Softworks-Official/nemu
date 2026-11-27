DROP TRIGGER access_client_tombstones_permanent ON access_client_tombstones;
DROP FUNCTION refuse_tombstone_change();
DROP TRIGGER access_clients_tombstone ON access_clients;
DROP FUNCTION tombstone_access_client();
DROP TABLE access_client_tombstones;
