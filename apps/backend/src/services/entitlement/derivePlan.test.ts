import { describe, it, expect } from 'vitest';
import { derivePlan, maxPlan, SubscriptionState } from './derivePlan';

const active: SubscriptionState = { status: 'ACTIVE' };
const inactive: SubscriptionState = { status: 'INACTIVE' };

describe('maxPlan', () => {
  it('orders FREE < PRO < ENTERPRISE', () => {
    expect(maxPlan('FREE', 'PRO')).toBe('PRO');
    expect(maxPlan('PRO', 'FREE')).toBe('PRO');
    expect(maxPlan('PRO', 'ENTERPRISE')).toBe('ENTERPRISE');
    expect(maxPlan('ENTERPRISE', 'FREE')).toBe('ENTERPRISE');
    expect(maxPlan('FREE', 'FREE')).toBe('FREE');
  });
});

describe('derivePlan — billing layer (no override)', () => {
  it('no sources => FREE', () => {
    expect(derivePlan(null, [])).toBe('FREE');
  });
  it('one ACTIVE source => PRO', () => {
    expect(derivePlan(null, [active])).toBe('PRO');
  });
  it('one INACTIVE source => FREE', () => {
    expect(derivePlan(null, [inactive])).toBe('FREE');
  });
  it('any ACTIVE among many => PRO (Paddle + RevenueCat coexist)', () => {
    expect(derivePlan(null, [inactive, active])).toBe('PRO');
    expect(derivePlan(null, [active, inactive])).toBe('PRO');
  });
  it('all INACTIVE => FREE', () => {
    expect(derivePlan(null, [inactive, inactive])).toBe('FREE');
  });
  it('undefined override behaves like null', () => {
    expect(derivePlan(undefined, [active])).toBe('PRO');
  });
});

describe('derivePlan — override floor', () => {
  it('PRO override, no sources => PRO (review account: no billing source)', () => {
    expect(derivePlan('PRO', [])).toBe('PRO');
  });
  it('PRO override, INACTIVE source => PRO (downgrade event cannot clobber it)', () => {
    expect(derivePlan('PRO', [inactive])).toBe('PRO');
  });
  it('ENTERPRISE override, no sources => ENTERPRISE', () => {
    expect(derivePlan('ENTERPRISE', [])).toBe('ENTERPRISE');
  });
  it('ENTERPRISE override is never lowered to PRO by an ACTIVE billing source', () => {
    expect(derivePlan('ENTERPRISE', [active])).toBe('ENTERPRISE');
  });
  it('ENTERPRISE override survives an INACTIVE billing source', () => {
    expect(derivePlan('ENTERPRISE', [inactive])).toBe('ENTERPRISE');
  });
  it('FREE override is a no-op floor (billing still wins upward)', () => {
    expect(derivePlan('FREE', [active])).toBe('PRO');
    expect(derivePlan('FREE', [inactive])).toBe('FREE');
  });
});
