-- Additive numeric-only diagnostics for definitive business rejections.
-- Historical unknown and accepted receipts are not altered.
ALTER TABLE weixin_send_receipts ADD COLUMN upstream_ret INTEGER
  CHECK (upstream_ret IS NULL OR upstream_ret BETWEEN -999999999 AND 999999999);
ALTER TABLE weixin_send_receipts ADD COLUMN upstream_errcode INTEGER
  CHECK (upstream_errcode IS NULL OR upstream_errcode BETWEEN -999999999 AND 999999999);
