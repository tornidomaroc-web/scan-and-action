function getTotal(merchantId, dayStr) {
  return pool.query("SELECT total FROM payouts WHERE merchant_id = " + merchantId + " AND day = " + dayStr);
}
