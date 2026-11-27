-- Bearer tokens are retired (NEM-131). Access Clients pair with CPace and
-- authenticate with Local sessions or sealed Relay requests; alpha clients
-- that held a token pair again at home.
DROP TABLE client_tokens;
