ALTER TABLE pairing_codes
    DROP COLUMN attempts,
    DROP COLUMN code;

DROP TABLE access_clients;
