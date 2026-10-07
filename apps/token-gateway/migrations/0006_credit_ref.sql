-- A credit may cite the payment that funded it: the settlement's own id from the rail that moved the
-- money (Wave, Orange Money, PI-SPI), or an operator's receipt when cash closes the sale. That is
-- what makes a balance answerable -- "which settlement funded this?" -- to an operator, to a
-- reconciliation job, and to the account's own /v1/balance page.
--
-- Null for credits with no settlement behind them (an opening balance, a goodwill grant), which are
-- never deduplicated: there is nothing for them to collide on, and an operator may mean to give one
-- twice.
--
-- Unique per account so that a replayed settlement cannot credit twice. The second insert violates
-- the index, which aborts the whole credit batch -- ledger row and balance update commit together or
-- not at all -- so a duplicate is refused rather than paid again. The index is the authority; the
-- caller's bookkeeping is not trusted to be the only check.
ALTER TABLE ledger ADD COLUMN payment_ref TEXT;
CREATE UNIQUE INDEX ledger_payment_ref ON ledger (account_id, payment_ref)
  WHERE payment_ref IS NOT NULL;
