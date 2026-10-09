-- An account may be keyed by an Engine user's pid (a UUID), so the Engine can resolve "this buyer's
-- gateway account" without storing our ids and without a second lookup table. Null for every account
-- that predates it or was created by name; the index makes a pid map to at most one account, so a
-- concurrent upsert for the same pid cannot create two.
ALTER TABLE accounts ADD COLUMN engine_pid TEXT;
CREATE UNIQUE INDEX accounts_engine_pid ON accounts (engine_pid) WHERE engine_pid IS NOT NULL;
