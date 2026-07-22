/**
 * THE one Paddle adjustment event shape used by every test that touches refunds,
 * chargebacks or the adjustment identity path.
 *
 * WHY THIS FILE EXISTS: this shape was previously duplicated, and one copy was
 * WRONG — it carried `custom_data: { userId }`, which Paddle's adjustment entity
 * does not have. Nothing caught it because the handler returned before reading
 * identity, so refund handling built on it would have passed CI and resolved
 * nothing in production. One shared definition means the shape can only be wrong
 * in one place, and fixing it fixes every consumer.
 *
 * WHY IT LIVES IN src/ AND NOT tests/: apps/backend/tsconfig.json sets
 * `include: ["src/**"]` with no explicit `rootDir`. A src/-colocated test
 * importing from tests/ would pull tests/ into the program, move the inferred
 * rootDir up to apps/backend/, and emit to dist/src/... — breaking the
 * `main: dist/index.js` entry point and the `start` script. Do not "tidy" this
 * into tests/ without setting rootDir first.
 *
 * Shape verified against Paddle's official docs:
 *   https://developer.paddle.com/webhooks/adjustments/adjustment-created
 *   https://developer.paddle.com/webhooks/adjustments/adjustment-updated
 *
 * Documented data fields: id, action, type, transaction_id, subscription_id,
 * customer_id, reason, credit_applied_to_balance, currency_code, status, items,
 * totals, payout_totals, chargeback_fee, tax_rates_used, created_at, updated_at.
 *
 * DELIBERATELY ABSENT: `custom_data`. It is a property of the transaction and
 * subscription entities, NOT of adjustments. Identity for an adjustment comes
 * from `subscription_id` (see resolveBillingOrgByExternalId). Do not add it.
 *
 * `subscription_id` is `string | null` — null for a refund against a one-off,
 * non-subscription transaction.
 * `type` is `full | partial`, and Paddle DEFAULTS IT TO `partial` when omitted.
 */

/** The subscription id these fixtures refer to; matches Subscription.externalId in tests. */
export const FIXTURE_SUBSCRIPTION_ID = 'sub_1';

export function adjustmentEvent(
  eventType: 'adjustment.created' | 'adjustment.updated',
  data: object = {},
  eventId = 'evt_adj_1'
) {
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: '2026-07-22T10:00:00.000Z',
    data: {
      id: 'adj_1',
      action: 'refund',
      // Explicit rather than relying on Paddle's implicit default, so a test that
      // cares about full-vs-partial has to say which it means.
      type: 'full',
      status: 'pending_approval',
      transaction_id: 'txn_1',
      subscription_id: FIXTURE_SUBSCRIPTION_ID,
      customer_id: 'ctm_1',
      reason: 'Customer requested a refund',
      credit_applied_to_balance: false,
      currency_code: 'USD',
      created_at: '2026-07-22T10:00:00.000Z',
      updated_at: '2026-07-22T10:00:00.000Z',
      ...data,
    },
  };
}

/** A refund/chargeback as it first arrives. */
export function adjustmentCreated(data: object = {}, eventId = 'evt_adj_1') {
  return adjustmentEvent('adjustment.created', data, eventId);
}

/**
 * The ONLY event carrying Paddle's approval decision. Per Paddle's docs it fires
 * for `refund` adjustments when review moves them from `pending_approval` to
 * `approved` or `rejected`.
 */
export function adjustmentUpdated(data: object = {}, eventId = 'evt_adj_upd_1') {
  return adjustmentEvent('adjustment.updated', data, eventId);
}
