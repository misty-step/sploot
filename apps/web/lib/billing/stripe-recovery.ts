import { createHash, verify as verifyDetachedSignature } from 'node:crypto';

import { assertSandboxCredential, assertStripeOperation, type StripeCredential } from './stripe-policy';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type StripeCustomerRecord = {
  id: string;
  [key: string]: unknown;
};

export type StripePriceRecord = {
  id: string;
  active: true;
  currency: string;
  unitAmount: number | null;
  [key: string]: unknown;
};

export type StripePaymentMethodRecord = {
  id: string;
  customer: string;
  type: string;
  [key: string]: unknown;
};

export type StripeTaxRateRecord = {
  id: string;
  active?: boolean;
  [key: string]: unknown;
};

export type StripeCouponRecord = {
  id: string;
  [key: string]: unknown;
};

export type StripePromotionCodeRecord = {
  id: string;
  code: string;
  coupon: string;
  [key: string]: unknown;
};

export type StripeDiscountReference = {
  coupon?: string;
  promotionCode?: string;
  [key: string]: unknown;
};

export type StripeSubscriptionItemSnapshot = {
  price: string;
  quantity: number;
  taxRates?: string[];
  [key: string]: unknown;
};

export type StripeSubscriptionSnapshot = {
  id: string;
  customer: string;
  status: string;
  currency: string;
  items: StripeSubscriptionItemSnapshot[];
  defaultPaymentMethod: string | null;
  billingCycleAnchor?: number;
  trialEnd?: number;
  discounts?: StripeDiscountReference[];
  defaultTaxRates?: string[];
  automaticTax?: boolean;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  daysUntilDue?: number;
  metadata?: Record<string, string>;
  [key: string]: unknown;
};

export type StripeSnapshotProvenance = {
  kind: 'stripe-preincident-export';
  sourceRef: string;
  capturedAt: string;
  digestSha256: string;
  manifest: {
    algorithm: 'ed25519';
    keyId: string;
    sourceRef: string;
    capturedAt: string;
    digestSha256: string;
    validUntil: string;
    signature: string;
  };
  [key: string]: unknown;
};

export type RecoverySnapshotManifestVerifier = {
  keyId: string;
  publicKeyPem: string;
};

export type StripeRecoverySnapshot = {
  source: 'preincident-snapshot';
  capturedAt: string;
  provenance: StripeSnapshotProvenance;
  customers: StripeCustomerRecord[];
  activePrices: StripePriceRecord[];
  paymentMethods: StripePaymentMethodRecord[];
  taxRates: StripeTaxRateRecord[];
  coupons: StripeCouponRecord[];
  promotionCodes: StripePromotionCodeRecord[];
  subscriptions: StripeSubscriptionSnapshot[];
  [key: string]: unknown;
};

export type SubscriptionCreation = {
  customer: string;
  currency: string;
  items: Array<{ price: string; quantity: number; tax_rates?: string[] }>;
  default_payment_method?: string;
  payment_behavior: 'default_incomplete';
  billing_cycle_anchor?: number;
  trial_end?: number;
  discounts?: Array<{ coupon?: string; promotion_code?: string }>;
  default_tax_rates?: string[];
  automatic_tax?: { enabled: boolean };
  collection_method?: 'charge_automatically' | 'send_invoice';
  days_until_due?: number;
  metadata: Record<string, string>;
};

export type SubscriptionRecoveryPlan = { creations: SubscriptionCreation[]; warnings: string[] };

const SUPPORTED_SUBSCRIPTION_FIELDS = new Set(['id', 'customer', 'status', 'currency', 'items', 'defaultPaymentMethod', 'billingCycleAnchor', 'trialEnd', 'discounts', 'defaultTaxRates', 'automaticTax', 'collectionMethod', 'daysUntilDue', 'metadata']);
const SUPPORTED_ITEM_FIELDS = new Set(['price', 'quantity', 'taxRates']);
const SUPPORTED_DISCOUNT_FIELDS = new Set(['coupon', 'promotionCode']);

export type RecoveryStripeWriter = {
  credential: StripeCredential;
  createSubscription(input: SubscriptionCreation, idempotencyKey: string): Promise<{ id: string; status: string; customer: string }>;
};

export type SubscriptionRecoveryResult = {
  plan: SubscriptionRecoveryPlan;
  created: Array<{ id: string; status: string; customer: string }>;
};

const SCA_WARNING = 'SCA/off-session authorization must be re-established for every recreated subscription; an attached PaymentMethod is not proof of consent.';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function requireFiniteInteger(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || !Number.isFinite(value) || (value as number) < minimum) {
    throw new Error(`${path} must be a finite integer >= ${minimum}`);
  }
  return value as number;
}

function requireIsoDate(value: unknown, path: string): string {
  const stringValue = requireString(value, path);
  if (!ISO_DATE_PATTERN.test(stringValue) || !Number.isFinite(Date.parse(stringValue))) throw new Error(`${path} must be an ISO-8601 UTC timestamp`);
  return stringValue;
}

function validateJson(value: unknown, path: string): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJson(item, `${path}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) throw new Error(`${path}.${key} must not be undefined`);
      validateJson(child, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} must be JSON serializable`);
}

function canonicalize(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutDigest(value: StripeRecoverySnapshot): JsonValue {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const provenance = copy.provenance as Record<string, unknown>;
  delete provenance.digestSha256;
  const manifest = provenance.manifest as Record<string, unknown>;
  delete manifest.digestSha256;
  delete manifest.signature;
  return copy as JsonValue;
}

function manifestPayload(snapshot: StripeRecoverySnapshot): string {
  const manifest = { ...snapshot.provenance.manifest } as Record<string, unknown>;
  delete manifest.signature;
  return canonicalize(manifest as JsonValue);
}

/** Canonical bytes covered by the externally provisioned manifest signature. */
export function serializeRecoverySnapshotManifest(snapshot: unknown): string {
  const shaped = validateShape(snapshot, true);
  return manifestPayload(shaped);
}

function validateShape(value: unknown, requireDigest: boolean): StripeRecoverySnapshot {
  validateJson(value, 'snapshot');
  if (!isRecord(value)) throw new Error('recovery snapshot must be an object');
  const snapshot = value as Record<string, unknown>;
  if (snapshot.source !== 'preincident-snapshot') throw new Error('recovery source must be an immutable preincident snapshot');
  requireIsoDate(snapshot.capturedAt, 'snapshot.capturedAt');
  if (!isRecord(snapshot.provenance)) throw new Error('snapshot.provenance is required');
  const provenance = snapshot.provenance;
  if (provenance.kind !== 'stripe-preincident-export') throw new Error('snapshot.provenance.kind must identify a Stripe preincident export');
  requireString(provenance.sourceRef, 'snapshot.provenance.sourceRef');
  requireIsoDate(provenance.capturedAt, 'snapshot.provenance.capturedAt');
  if (provenance.capturedAt !== snapshot.capturedAt) throw new Error('snapshot and provenance capture times must agree');
  if (!isRecord(provenance.manifest)) throw new Error('snapshot.provenance.manifest is required');
  const manifest = provenance.manifest;
  if (manifest.algorithm !== 'ed25519') throw new Error('snapshot provenance manifest must use ed25519');
  requireString(manifest.keyId, 'snapshot.provenance.manifest.keyId');
  requireString(manifest.sourceRef, 'snapshot.provenance.manifest.sourceRef');
  requireIsoDate(manifest.capturedAt, 'snapshot.provenance.manifest.capturedAt');
  requireIsoDate(manifest.validUntil, 'snapshot.provenance.manifest.validUntil');
  requireString(manifest.signature, 'snapshot.provenance.manifest.signature');
  if (manifest.sourceRef !== provenance.sourceRef || manifest.capturedAt !== provenance.capturedAt) throw new Error('snapshot manifest source reference and capture time must agree with provenance');
  if (requireDigest && (typeof manifest.digestSha256 !== 'string' || !DIGEST_PATTERN.test(manifest.digestSha256))) throw new Error('snapshot.provenance.manifest.digestSha256 must be a SHA-256 digest');
  if (requireDigest && manifest.digestSha256 !== provenance.digestSha256) throw new Error('snapshot manifest digest must agree with provenance digest');
  if (requireDigest && (typeof provenance.digestSha256 !== 'string' || !DIGEST_PATTERN.test(provenance.digestSha256))) {
    throw new Error('snapshot.provenance.digestSha256 must be a SHA-256 digest');
  }

  const customers = requireArray(snapshot.customers, 'snapshot.customers');
  const activePrices = requireArray(snapshot.activePrices, 'snapshot.activePrices');
  const paymentMethods = requireArray(snapshot.paymentMethods, 'snapshot.paymentMethods');
  const taxRates = requireArray(snapshot.taxRates, 'snapshot.taxRates');
  const coupons = requireArray(snapshot.coupons, 'snapshot.coupons');
  const promotionCodes = requireArray(snapshot.promotionCodes, 'snapshot.promotionCodes');
  const subscriptions = requireArray(snapshot.subscriptions, 'snapshot.subscriptions');
  const unique = (items: unknown[], path: string): void => {
    const ids = items.map((item, index) => requireString(isRecord(item) ? item.id : undefined, `${path}[${index}].id`));
    if (new Set(ids).size !== ids.length) throw new Error(`${path} contains duplicate IDs`);
  };
  unique(customers, 'snapshot.customers');
  unique(activePrices, 'snapshot.activePrices');
  unique(paymentMethods, 'snapshot.paymentMethods');
  unique(taxRates, 'snapshot.taxRates');
  unique(coupons, 'snapshot.coupons');
  unique(promotionCodes, 'snapshot.promotionCodes');
  unique(subscriptions, 'snapshot.subscriptions');

  const customerIds = new Set(customers.map((item) => requireString((item as Record<string, unknown>).id, 'customer.id')));
  const priceById = new Map<string, Record<string, unknown>>();
  for (const [index, raw] of activePrices.entries()) {
    if (!isRecord(raw)) throw new Error(`snapshot.activePrices[${index}] must be an object`);
    requireString(raw.id, `snapshot.activePrices[${index}].id`);
    if (raw.active !== true) throw new Error(`snapshot.activePrices[${index}] must be active`);
    const currency = requireString(raw.currency, `snapshot.activePrices[${index}].currency`).toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw new Error(`snapshot.activePrices[${index}].currency must be a 3-letter currency`);
    if (raw.unitAmount !== null) requireFiniteInteger(raw.unitAmount, `snapshot.activePrices[${index}].unitAmount`);
    priceById.set(requireString(raw.id, `snapshot.activePrices[${index}].id`), raw);
  }
  const paymentMethodById = new Map<string, Record<string, unknown>>();
  for (const [index, raw] of paymentMethods.entries()) {
    if (!isRecord(raw)) throw new Error(`snapshot.paymentMethods[${index}] must be an object`);
    requireString(raw.id, `snapshot.paymentMethods[${index}].id`);
    requireString(raw.customer, `snapshot.paymentMethods[${index}].customer`);
    requireString(raw.type, `snapshot.paymentMethods[${index}].type`);
    const paymentMethodId = requireString(raw.id, `snapshot.paymentMethods[${index}].id`);
    const paymentMethodCustomer = requireString(raw.customer, `snapshot.paymentMethods[${index}].customer`);
    if (!customerIds.has(paymentMethodCustomer)) throw new Error(`snapshot.paymentMethods[${index}] references an absent customer`);
    paymentMethodById.set(paymentMethodId, raw);
  }
  const taxRateIds = new Set(taxRates.map((item) => requireString((item as Record<string, unknown>).id, 'taxRate.id')));
  for (const [index, raw] of customers.entries()) {
    if (!isRecord(raw)) throw new Error(`snapshot.customers[${index}] must be an object`);
    const invoiceSettings = raw.invoice_settings;
    if (invoiceSettings !== undefined) {
      if (!isRecord(invoiceSettings)) throw new Error(`snapshot.customers[${index}].invoice_settings must be an object`);
      const defaultPaymentMethod = invoiceSettings.default_payment_method;
      if (defaultPaymentMethod !== undefined && defaultPaymentMethod !== null) {
        const paymentMethod = paymentMethodById.get(requireString(defaultPaymentMethod, `snapshot.customers[${index}].invoice_settings.default_payment_method`));
        if (!paymentMethod) throw new Error(`snapshot.customers[${index}].invoice_settings.default_payment_method references an absent payment method`);
        if (paymentMethod.customer !== raw.id) throw new Error(`snapshot.customers[${index}].invoice_settings.default_payment_method belongs to another customer`);
      }
    }
  }
  const couponIds = new Set(coupons.map((item) => requireString((item as Record<string, unknown>).id, 'coupon.id')));
  const promotionCodeIds = new Set<string>();
  for (const [index, raw] of promotionCodes.entries()) {
    if (!isRecord(raw)) throw new Error(`snapshot.promotionCodes[${index}] must be an object`);
    requireString(raw.id, `snapshot.promotionCodes[${index}].id`);
    requireString(raw.code, `snapshot.promotionCodes[${index}].code`);
    const coupon = requireString(raw.coupon, `snapshot.promotionCodes[${index}].coupon`);
    if (!couponIds.has(coupon)) throw new Error(`snapshot.promotionCodes[${index}] references an absent coupon`);
    promotionCodeIds.add(requireString(raw.id, `snapshot.promotionCodes[${index}].id`));
  }

  for (const [index, raw] of subscriptions.entries()) {
    const path = `snapshot.subscriptions[${index}]`;
    if (!isRecord(raw)) throw new Error(`${path} must be an object`);
    requireString(raw.id, `${path}.id`);
    const customer = requireString(raw.customer, `${path}.customer`);
    if (!customerIds.has(customer)) throw new Error(`${path}.customer references an absent customer`);
    requireString(raw.status, `${path}.status`);
    const currency = requireString(raw.currency, `${path}.currency`).toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) throw new Error(`${path}.currency must be a 3-letter currency`);
    if (!Array.isArray(raw.items) || raw.items.length === 0) throw new Error(`${path}.items must contain at least one item`);
    for (const [itemIndex, item] of raw.items.entries()) {
      const itemPath = `${path}.items[${itemIndex}]`;
      if (!isRecord(item)) throw new Error(`${itemPath} must be an object`);
      const priceId = requireString(item.price, `${itemPath}.price`);
      const price = priceById.get(priceId);
      if (!price) throw new Error(`${itemPath}.price is absent from activePrices`);
      if (String(price.currency).toLowerCase() !== currency) throw new Error(`${itemPath}.price currency disagrees with the subscription currency`);
      requireFiniteInteger(item.quantity, `${itemPath}.quantity`, 1);
      if (item.taxRates !== undefined && (!Array.isArray(item.taxRates) || item.taxRates.some((rate) => typeof rate !== 'string' || !taxRateIds.has(rate)))) throw new Error(`${itemPath}.taxRates must reference snapshot.taxRates`);
    }
    if (!hasOwn(raw, 'defaultPaymentMethod')) throw new Error(`${path}.defaultPaymentMethod must be present, even when null`);
    if (raw.defaultPaymentMethod !== null) {
      const paymentMethod = paymentMethodById.get(requireString(raw.defaultPaymentMethod, `${path}.defaultPaymentMethod`));
      if (!paymentMethod) throw new Error(`${path}.defaultPaymentMethod references an absent payment method`);
      if (paymentMethod.customer !== customer) throw new Error(`${path}.defaultPaymentMethod belongs to another customer`);
    }
    if (raw.discounts !== undefined) {
      if (!Array.isArray(raw.discounts)) throw new Error(`${path}.discounts must be an array`);
      for (const [discountIndex, discount] of raw.discounts.entries()) {
        const discountPath = `${path}.discounts[${discountIndex}]`;
        if (!isRecord(discount)) throw new Error(`${discountPath} must be an object`);
        const hasCoupon = typeof discount.coupon === 'string' && discount.coupon.trim() !== '';
        const hasPromotion = typeof discount.promotionCode === 'string' && discount.promotionCode.trim() !== '';
        if (hasCoupon === hasPromotion) throw new Error(`${discountPath} must reference exactly one coupon or promotion code`);
        if (hasCoupon && !couponIds.has(discount.coupon as string)) throw new Error(`${discountPath}.coupon references an absent coupon`);
        if (hasPromotion && !promotionCodeIds.has(discount.promotionCode as string)) throw new Error(`${discountPath}.promotionCode references an absent promotion code`);
      }
    }
    if (raw.billingCycleAnchor !== undefined) requireFiniteInteger(raw.billingCycleAnchor, `${path}.billingCycleAnchor`);
    if (raw.trialEnd !== undefined) requireFiniteInteger(raw.trialEnd, `${path}.trialEnd`);
    if (raw.daysUntilDue !== undefined) requireFiniteInteger(raw.daysUntilDue, `${path}.daysUntilDue`);
    if (raw.collectionMethod !== undefined && raw.collectionMethod !== 'charge_automatically' && raw.collectionMethod !== 'send_invoice') throw new Error(`${path}.collectionMethod is invalid`);
    if (raw.collectionMethod === 'send_invoice' && raw.daysUntilDue === undefined) throw new Error(`${path}.daysUntilDue is required for send_invoice`);
    if (raw.collectionMethod === 'charge_automatically' && raw.daysUntilDue !== undefined) throw new Error(`${path}.daysUntilDue is invalid for charge_automatically`);
    if (raw.automaticTax !== undefined && typeof raw.automaticTax !== 'boolean') throw new Error(`${path}.automaticTax must be boolean`);
    if (raw.defaultTaxRates !== undefined && (!Array.isArray(raw.defaultTaxRates) || raw.defaultTaxRates.some((rate) => typeof rate !== 'string' || !taxRateIds.has(rate)))) throw new Error(`${path}.defaultTaxRates must reference snapshot.taxRates`);
    if (raw.metadata !== undefined && (!isRecord(raw.metadata) || Object.values(raw.metadata).some((entry) => typeof entry !== 'string'))) throw new Error(`${path}.metadata must contain only strings`);
  }

  const parsed = value as StripeRecoverySnapshot;
  if (requireDigest && computeRecoverySnapshotDigest(parsed) !== parsed.provenance.digestSha256) throw new Error('snapshot provenance digest does not match the immutable snapshot contents');
  return parsed;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be present as an array`);
  return value;
}

function rejectUnsupportedFields(value: Record<string, unknown>, supported: Set<string>, path: string): void {
  const unsupported = Object.keys(value).filter((key) => !supported.has(key));
  if (unsupported.length > 0) throw new Error(`${path} contains unsupported recovery fields: ${unsupported.join(', ')}`);
}

function assertSupportedRecoveryFields(snapshot: StripeRecoverySnapshot): void {
  for (const [index, subscription] of snapshot.subscriptions.entries()) {
    rejectUnsupportedFields(subscription, SUPPORTED_SUBSCRIPTION_FIELDS, `snapshot.subscriptions[${index}]`);
    for (const [itemIndex, item] of subscription.items.entries()) rejectUnsupportedFields(item, SUPPORTED_ITEM_FIELDS, `snapshot.subscriptions[${index}].items[${itemIndex}]`);
    for (const [discountIndex, discount] of (subscription.discounts ?? []).entries()) rejectUnsupportedFields(discount, SUPPORTED_DISCOUNT_FIELDS, `snapshot.subscriptions[${index}].discounts[${discountIndex}]`);
  }
}

export function computeRecoverySnapshotDigest(snapshot: unknown): string {
  const shaped = validateShape(snapshot, false);
  return createHash('sha256').update(canonicalize(withoutDigest(shaped))).digest('hex');
}

export function verifyRecoverySnapshotManifest(
  snapshot: StripeRecoverySnapshot,
  verifier: RecoverySnapshotManifestVerifier,
  now: Date = new Date(),
): void {
  const validated = validateShape(snapshot, true);
  const manifest = validated.provenance.manifest;
  if (!verifier.keyId.trim() || verifier.keyId !== manifest.keyId) throw new Error('snapshot manifest key ID is not trusted');
  if (!verifier.publicKeyPem.trim()) throw new Error('snapshot manifest public key is required');
  if (computeRecoverySnapshotDigest(validated) !== validated.provenance.digestSha256) throw new Error('snapshot provenance digest does not match the immutable snapshot contents');
  const capturedAt = Date.parse(manifest.capturedAt);
  const validUntil = Date.parse(manifest.validUntil);
  if (capturedAt > now.getTime() || validUntil <= now.getTime() || validUntil <= capturedAt) throw new Error('snapshot manifest time window is invalid or expired');
  const signature = Buffer.from(manifest.signature, 'base64');
  if (signature.length === 0 || !verifyDetachedSignature(null, Buffer.from(manifestPayload(validated)), verifier.publicKeyPem, signature)) throw new Error('snapshot manifest signature verification failed');
}

/** Stable JSON retains every validated field, including provenance and digest. */
export function serializeRecoverySnapshot(snapshot: unknown): string {
  const shaped = validateShape(snapshot, true);
  return canonicalize(shaped as unknown as JsonValue);
}

export function parseRecoverySnapshot(value: unknown): StripeRecoverySnapshot {
  return validateShape(value, true);
}

export function buildSubscriptionRecoveryPlan(snapshot: StripeRecoverySnapshot): SubscriptionRecoveryPlan {
  const validated = validateShape(snapshot, true);
  assertSupportedRecoveryFields(validated);
  const warnings = [SCA_WARNING];
  const creations: SubscriptionCreation[] = [];
  for (const subscription of validated.subscriptions) {
    if (subscription.defaultPaymentMethod === null) warnings.push(`subscription ${subscription.id} has no default PaymentMethod; reauthorization is required`);
    if (subscription.status === 'canceled') warnings.push(`subscription ${subscription.id} was canceled in the snapshot and is being recreated only because the snapshot requested recovery`);
    creations.push({
      customer: subscription.customer,
      currency: subscription.currency,
      items: subscription.items.map((item) => ({ price: item.price, quantity: item.quantity, ...(item.taxRates ? { tax_rates: [...item.taxRates] } : {}) })),
      ...(subscription.defaultPaymentMethod !== null ? { default_payment_method: subscription.defaultPaymentMethod } : {}),
      payment_behavior: 'default_incomplete',
      ...(subscription.billingCycleAnchor !== undefined ? { billing_cycle_anchor: subscription.billingCycleAnchor } : {}),
      ...(subscription.trialEnd !== undefined ? { trial_end: subscription.trialEnd } : {}),
      ...(subscription.discounts ? { discounts: subscription.discounts.map((discount) => ({
        ...(discount.coupon !== undefined ? { coupon: discount.coupon } : {}),
        ...(discount.promotionCode !== undefined ? { promotion_code: discount.promotionCode } : {}),
      })) } : {}),
      ...(subscription.defaultTaxRates ? { default_tax_rates: [...subscription.defaultTaxRates] } : {}),
      ...(subscription.automaticTax !== undefined ? { automatic_tax: { enabled: subscription.automaticTax } } : {}),
      ...(subscription.collectionMethod ? { collection_method: subscription.collectionMethod } : {}),
      ...(subscription.daysUntilDue !== undefined ? { days_until_due: subscription.daysUntilDue } : {}),
      metadata: {
        ...(subscription.metadata ?? {}),
        sploot_recreated_from: subscription.metadata?.sploot_recreated_from ? `${subscription.metadata.sploot_recreated_from}->${subscription.id}` : subscription.id,
      },
    });
  }
  return { creations, warnings };
}

export async function executeSubscriptionRecovery(writer: RecoveryStripeWriter, snapshot: StripeRecoverySnapshot, manifestVerifier: RecoverySnapshotManifestVerifier): Promise<SubscriptionRecoveryResult> {
  assertSandboxCredential(writer.credential);
  assertStripeOperation('subscriptions.create');
  verifyRecoverySnapshotManifest(snapshot, manifestVerifier);
  const plan = buildSubscriptionRecoveryPlan(snapshot);
  const created: SubscriptionRecoveryResult['created'] = [];
  for (const creation of plan.creations) {
    created.push(await writer.createSubscription(creation, `sploot-recreate-${creation.metadata.sploot_recreated_from}`));
  }
  return { plan, created };
}

export { SCA_WARNING };
