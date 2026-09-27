-- The ledger unit is XOF, the West African CFA franc (ISO 4217) that the BCEAO issues for the eight
-- UEMOA countries. "FCFA" also names XAF, Central Africa's franc, so columns carry the ISO code.
ALTER TABLE accounts RENAME COLUMN balance_ufcfa TO balance_uxof;
ALTER TABLE ledger RENAME COLUMN amount_ufcfa TO amount_uxof;
