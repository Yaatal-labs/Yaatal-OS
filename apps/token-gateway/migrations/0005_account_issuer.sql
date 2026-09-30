-- An issuer token (KEY_ISSUER_TOKEN, named by KEY_ISSUER_NAME) may only mint or revoke keys on
-- accounts an admin has explicitly assigned to it. Null means admin-only: every existing account,
-- and any new one created without an issuer, stays out of reach of every issuer token.
ALTER TABLE accounts ADD COLUMN issuer TEXT;
