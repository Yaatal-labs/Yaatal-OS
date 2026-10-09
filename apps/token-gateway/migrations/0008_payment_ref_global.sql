-- One settlement funds one credit, on one account. 0006 made the reference unique per account,
-- which stops a replay on the same account but lets the same settlement be credited to a second
-- account (a wrong pid resolution, a retry against another id, a leaked CREDIT_TOKEN). The index is
-- the authority, so it becomes global: a second account citing the same payment_ref is refused.
DROP INDEX IF EXISTS ledger_payment_ref;
CREATE UNIQUE INDEX ledger_payment_ref_global ON ledger (payment_ref) WHERE payment_ref IS NOT NULL;
