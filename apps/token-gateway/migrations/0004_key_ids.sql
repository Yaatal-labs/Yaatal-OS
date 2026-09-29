-- Keys were only ever looked up by their hash, so revoking one meant supplying the raw value again --
-- impossible once it has left the "shown once at creation" screen. An id lets an owner (an admin, or
-- a platform that minted the key on someone's behalf) label, track and revoke a key without ever
-- holding it again. Existing rows keep a null id; they stay reachable through the older
-- POST /admin/keys/revoke {key} route.
ALTER TABLE api_keys ADD COLUMN id TEXT;
CREATE UNIQUE INDEX api_keys_id ON api_keys (id);
