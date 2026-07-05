import {
  getPlanById,
  nowIso,
  type InvoiceRecord,
  type NotificationRecord,
  type PaymentProvider,
  type PaymentPurpose,
  type PaymentRecord,
  type PlanId,
  type ProcessedWebhookRecord,
  type SubscriptionRecord,
  type UserRecord
} from '@/lib/domain';
import { MongoClient, type Db, type Document } from 'mongodb';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

export interface CreatePaymentInput {
  userId: string;
  purpose: PaymentPurpose;
  planId: PlanId;
  amountMinor: number;
  currency: string;
  provider: PaymentProvider;
  description: string;
  providerCheckoutSessionId?: string | null;
  providerPaymentIntentId?: string | null;
  subscriptionId?: string | null;
}

export interface CreateInvoiceInput {
  userId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  amountMinor: number;
  currency: string;
  lineItems: Array<{ label: string; amountMinor: number }>;
  providerInvoiceId?: string | null;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationRecord['type'];
  idempotencyKey: string;
  subject: string;
  message: string;
  provider: NotificationRecord['provider'];
}

export interface DataStore {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(input: CreateUserInput): Promise<UserRecord>;
  updateUserLastSeen(userId: string): Promise<void>;

  getSubscriptionByUserId(userId: string): Promise<SubscriptionRecord | null>;
  findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null>;
  saveSubscription(subscription: SubscriptionRecord): Promise<SubscriptionRecord>;

  createPayment(input: CreatePaymentInput): Promise<PaymentRecord>;
  updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null>;
  findPaymentById(id: string): Promise<PaymentRecord | null>;
  findPaymentByCheckoutSessionId(checkoutSessionId: string): Promise<PaymentRecord | null>;
  findPaymentByProviderIntentId(intentId: string): Promise<PaymentRecord | null>;
  listPaymentsByUserId(userId: string): Promise<PaymentRecord[]>;

  createInvoice(input: CreateInvoiceInput): Promise<InvoiceRecord>;
  updateInvoice(id: string, updates: Partial<InvoiceRecord>): Promise<InvoiceRecord | null>;
  findInvoiceById(id: string): Promise<InvoiceRecord | null>;
  listInvoicesByUserId(userId: string): Promise<InvoiceRecord[]>;

  createNotification(input: CreateNotificationInput): Promise<NotificationRecord | null>;
  markNotificationSent(idempotencyKey: string, sentAt?: string): Promise<void>;
  listNotificationsByUserId(userId: string): Promise<NotificationRecord[]>;
  getNotificationByKey(idempotencyKey: string): Promise<NotificationRecord | null>;

  recordWebhookEvent(provider: PaymentProvider, eventId: string, type: string): Promise<boolean>;
  hasWebhookEvent(eventId: string): Promise<boolean>;
}

const collectionNames = {
  users: 'users',
  subscriptions: 'subscriptions',
  payments: 'payments',
  invoices: 'invoices',
  notifications: 'notifications',
  webhooks: 'processed_webhooks'
} as const;

type StoreCollections = {
  users: UserRecord[];
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  notifications: NotificationRecord[];
  webhooks: ProcessedWebhookRecord[];
};

class MemoryStore implements DataStore {
  private readonly db: StoreCollections = {
    users: [],
    subscriptions: [],
    payments: [],
    invoices: [],
    notifications: [],
    webhooks: []
  };

  async findUserByEmail(email: string) {
    return this.db.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findUserById(id: string) {
    return this.db.users.find((user) => user.id === id) ?? null;
  }

  async createUser(input: CreateUserInput) {
    const timestamp = nowIso();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.db.users.push(user);
    return user;
  }

  async updateUserLastSeen(userId: string) {
    const user = await this.findUserById(userId);
    if (user) user.updatedAt = nowIso();
  }

  async getSubscriptionByUserId(userId: string) {
    return this.db.subscriptions.find((subscription) => subscription.userId === userId) ?? null;
  }

  async findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
    return this.db.subscriptions.find((subscription) => subscription.stripeSubscriptionId === stripeSubscriptionId) ?? null;
  }

  async saveSubscription(subscription: SubscriptionRecord) {
    const index = this.db.subscriptions.findIndex((item) => item.id === subscription.id);
    if (index >= 0) this.db.subscriptions[index] = subscription;
    else this.db.subscriptions.push(subscription);
    return subscription;
  }

  async createPayment(input: CreatePaymentInput) {
    const timestamp = nowIso();
    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      purpose: input.purpose,
      planId: input.planId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'pending',
      provider: input.provider,
      providerCheckoutSessionId: input.providerCheckoutSessionId ?? null,
      providerPaymentIntentId: input.providerPaymentIntentId ?? null,
      invoiceId: null,
      subscriptionId: input.subscriptionId ?? null,
      description: input.description,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.db.payments.push(payment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<PaymentRecord>) {
    const payment = this.db.payments.find((item) => item.id === id);
    if (!payment) return null;
    Object.assign(payment, updates, { updatedAt: nowIso() });
    return payment;
  }

  async findPaymentById(id: string) {
    return this.db.payments.find((payment) => payment.id === id) ?? null;
  }

  async findPaymentByCheckoutSessionId(checkoutSessionId: string) {
    return this.db.payments.find((payment) => payment.providerCheckoutSessionId === checkoutSessionId) ?? null;
  }

  async findPaymentByProviderIntentId(intentId: string) {
    return this.db.payments.find((payment) => payment.providerPaymentIntentId === intentId) ?? null;
  }

  async listPaymentsByUserId(userId: string) {
    return [...this.db.payments]
      .filter((payment) => payment.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createInvoice(input: CreateInvoiceInput) {
    const timestamp = nowIso();
    const invoiceNumber = `RK-${String(this.db.invoices.length + 1).padStart(5, '0')}`;
    const invoice: InvoiceRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      paymentId: input.paymentId ?? null,
      number: invoiceNumber,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'issued',
      dueAt: timestamp,
      issuedAt: timestamp,
      paidAt: null,
      lineItems: input.lineItems,
      providerInvoiceId: input.providerInvoiceId ?? null
    };
    this.db.invoices.push(invoice);
    return invoice;
  }

  async updateInvoice(id: string, updates: Partial<InvoiceRecord>) {
    const invoice = this.db.invoices.find((item) => item.id === id);
    if (!invoice) return null;
    Object.assign(invoice, updates);
    return invoice;
  }

  async findInvoiceById(id: string) {
    return this.db.invoices.find((invoice) => invoice.id === id) ?? null;
  }

  async listInvoicesByUserId(userId: string) {
    return [...this.db.invoices]
      .filter((invoice) => invoice.userId === userId)
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  }

  async createNotification(input: CreateNotificationInput) {
    const existing = await this.getNotificationByKey(input.idempotencyKey);
    if (existing) return existing;
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      subject: input.subject,
      message: input.message,
      sentAt: null,
      provider: input.provider,
      createdAt: nowIso()
    };
    this.db.notifications.push(notification);
    return notification;
  }

  async markNotificationSent(idempotencyKey: string, sentAt = nowIso()) {
    const notification = this.db.notifications.find((item) => item.idempotencyKey === idempotencyKey);
    if (notification) notification.sentAt = sentAt;
  }

  async listNotificationsByUserId(userId: string) {
    return [...this.db.notifications]
      .filter((notification) => notification.userId === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getNotificationByKey(idempotencyKey: string) {
    return this.db.notifications.find((notification) => notification.idempotencyKey === idempotencyKey) ?? null;
  }

  async recordWebhookEvent(provider: PaymentProvider, eventId: string, type: string) {
    if (this.db.webhooks.some((event) => event.eventId === eventId)) return false;
    this.db.webhooks.push({
      id: crypto.randomUUID(),
      provider,
      eventId,
      type,
      processedAt: nowIso()
    });
    return true;
  }

  async hasWebhookEvent(eventId: string) {
    return this.db.webhooks.some((event) => event.eventId === eventId);
  }
}

class MongoStore implements DataStore {
  constructor(private readonly db: Db) {}

  private collection<T extends Document>(name: keyof typeof collectionNames) {
    return this.db.collection<T>(collectionNames[name]);
  }

  async findUserByEmail(email: string) {
    return (await this.collection<UserRecord>('users').findOne({ email: email.toLowerCase() })) ?? null;
  }

  async findUserById(id: string) {
    return (await this.collection<UserRecord>('users').findOne({ id })) ?? null;
  }

  async createUser(input: CreateUserInput) {
    const timestamp = nowIso();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await this.collection<UserRecord>('users').insertOne(user);
    return user;
  }

  async updateUserLastSeen(userId: string) {
    await this.collection<UserRecord>('users').updateOne({ id: userId }, { $set: { updatedAt: nowIso() } });
  }

  async getSubscriptionByUserId(userId: string) {
    return (await this.collection<SubscriptionRecord>('subscriptions').findOne({ userId })) ?? null;
  }

  async findSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
    return (await this.collection<SubscriptionRecord>('subscriptions').findOne({ stripeSubscriptionId })) ?? null;
  }

  async saveSubscription(subscription: SubscriptionRecord) {
    await this.collection<SubscriptionRecord>('subscriptions').updateOne(
      { id: subscription.id },
      { $set: subscription },
      { upsert: true }
    );
    return subscription;
  }

  async createPayment(input: CreatePaymentInput) {
    const timestamp = nowIso();
    const payment: PaymentRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      purpose: input.purpose,
      planId: input.planId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'pending',
      provider: input.provider,
      providerCheckoutSessionId: input.providerCheckoutSessionId ?? null,
      providerPaymentIntentId: input.providerPaymentIntentId ?? null,
      invoiceId: null,
      subscriptionId: input.subscriptionId ?? null,
      description: input.description,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const mongoPayment: any = {
      ...payment
    };

    if (input.providerCheckoutSessionId == null) {
      delete mongoPayment.providerCheckoutSessionId;
    }

    if (input.providerPaymentIntentId == null) {
      delete mongoPayment.providerPaymentIntentId;
    }

    await this.collection<PaymentRecord>('payments').insertOne(mongoPayment);
    return payment;
  }

  async updatePayment(id: string, updates: Partial<PaymentRecord>) {
    await this.collection<PaymentRecord>('payments').updateOne({ id }, { $set: { ...updates, updatedAt: nowIso() } });
    return this.findPaymentById(id);
  }

  async findPaymentById(id: string) {
    return (await this.collection<PaymentRecord>('payments').findOne({ id })) ?? null;
  }

  async findPaymentByCheckoutSessionId(checkoutSessionId: string) {
    return (await this.collection<PaymentRecord>('payments').findOne({ providerCheckoutSessionId: checkoutSessionId })) ?? null;
  }

  async findPaymentByProviderIntentId(intentId: string) {
    return (await this.collection<PaymentRecord>('payments').findOne({ providerPaymentIntentId: intentId })) ?? null;
  }

  async listPaymentsByUserId(userId: string) {
    return this.collection<PaymentRecord>('payments')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async createInvoice(input: CreateInvoiceInput) {
    const timestamp = nowIso();
    const count = await this.collection<InvoiceRecord>('invoices').countDocuments();
    const invoice: InvoiceRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      subscriptionId: input.subscriptionId ?? null,
      paymentId: input.paymentId ?? null,
      number: `RK-${String(count + 1).padStart(5, '0')}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'issued',
      dueAt: timestamp,
      issuedAt: timestamp,
      paidAt: null,
      lineItems: input.lineItems,
      providerInvoiceId: input.providerInvoiceId ?? null
    };
    await this.collection<InvoiceRecord>('invoices').insertOne(invoice);
    return invoice;
  }

  async updateInvoice(id: string, updates: Partial<InvoiceRecord>) {
    await this.collection<InvoiceRecord>('invoices').updateOne({ id }, { $set: updates });
    return this.findInvoiceById(id);
  }

  async findInvoiceById(id: string) {
    return (await this.collection<InvoiceRecord>('invoices').findOne({ id })) ?? null;
  }

  async listInvoicesByUserId(userId: string) {
    return this.collection<InvoiceRecord>('invoices')
      .find({ userId })
      .sort({ issuedAt: -1 })
      .toArray();
  }

  async createNotification(input: CreateNotificationInput) {
    const existing = await this.getNotificationByKey(input.idempotencyKey);
    if (existing) return existing;
    const notification: NotificationRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      subject: input.subject,
      message: input.message,
      sentAt: null,
      provider: input.provider,
      createdAt: nowIso()
    };
    await this.collection<NotificationRecord>('notifications').insertOne(notification);
    return notification;
  }

  async markNotificationSent(idempotencyKey: string, sentAt = nowIso()) {
    await this.collection<NotificationRecord>('notifications').updateOne(
      { idempotencyKey },
      { $set: { sentAt } }
    );
  }

  async listNotificationsByUserId(userId: string) {
    return this.collection<NotificationRecord>('notifications')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getNotificationByKey(idempotencyKey: string) {
    return (await this.collection<NotificationRecord>('notifications').findOne({ idempotencyKey })) ?? null;
  }

  async recordWebhookEvent(provider: PaymentProvider, eventId: string, type: string) {
    const result = await this.collection<ProcessedWebhookRecord>('webhooks').updateOne(
      { eventId },
      {
        $setOnInsert: {
          id: crypto.randomUUID(),
          provider,
          eventId,
          type,
          processedAt: nowIso()
        }
      },
      { upsert: true }
    );
    return result.upsertedCount === 1;
  }

  async hasWebhookEvent(eventId: string) {
    return (await this.collection<ProcessedWebhookRecord>('webhooks').findOne({ eventId })) !== null;
  }
}

let memoryStore: MemoryStore | null = null;
let mongoClient: MongoClient | null = null;
let mongoStore: MongoStore | null = null;

async function ensureMongoStore() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!mongoClient) {
    try {
      mongoClient = new MongoClient(uri);
      await mongoClient.connect();
      const dbName = process.env.MONGODB_DB ?? 'register_karo';
      const db = mongoClient.db(dbName);
      await Promise.all([
        db.collection<UserRecord>(collectionNames.users).createIndex({ email: 1 }, { unique: true }),
        db.collection<SubscriptionRecord>(collectionNames.subscriptions).createIndex({ userId: 1 }, { unique: true }),
        db.collection<PaymentRecord>(collectionNames.payments).createIndex({ providerCheckoutSessionId: 1 }, { unique: true, sparse: true }),
        db.collection<PaymentRecord>(collectionNames.payments).createIndex({ providerPaymentIntentId: 1 }, { unique: true, sparse: true }),
        db.collection<NotificationRecord>(collectionNames.notifications).createIndex({ idempotencyKey: 1 }, { unique: true }),
        db.collection<ProcessedWebhookRecord>(collectionNames.webhooks).createIndex({ eventId: 1 }, { unique: true })
      ]);
      mongoStore = new MongoStore(db);
    } catch (error) {
      mongoClient = null;
      mongoStore = null;
      console.warn('MongoDB unavailable.', error);
      throw new Error('MongoDB connection failed. Check MONGODB_URI credentials, authSource, and network access.', { cause: error });
    }
  }
  return mongoStore;
}

export async function getStore(): Promise<DataStore> {
  if (process.env.MONGODB_URI) {
    const store = await ensureMongoStore();
    if (store) return store;
  }
  memoryStore ??= new MemoryStore();
  return memoryStore;
}

export function createTestStore(): DataStore {
  return new MemoryStore();
}

export async function seedSubscriptionForUser(store: DataStore, userId: string, planId: PlanId) {
  const now = nowIso();
  const existing = await store.getSubscriptionByUserId(userId);
  const subscription: SubscriptionRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    userId,
    planId,
    status: 'active',
    cancelAtPeriodEnd: false,
    currentPeriodStart: existing?.currentPeriodStart ?? now,
    currentPeriodEnd: existing?.currentPeriodEnd ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    stripeCustomerId: existing?.stripeCustomerId ?? null,
    stripeSubscriptionId: existing?.stripeSubscriptionId ?? null,
    latestInvoiceId: existing?.latestInvoiceId ?? null,
    latestPaymentId: existing?.latestPaymentId ?? null,
    scheduledPlanId: null,
    scheduledPlanChangeType: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  return store.saveSubscription(subscription);
}

export function buildEmptySubscription(userId: string, planId: PlanId): SubscriptionRecord {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    userId,
    planId,
    status: 'pending_activation',
    cancelAtPeriodEnd: false,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    latestInvoiceId: null,
    latestPaymentId: null,
    scheduledPlanId: null,
    scheduledPlanChangeType: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function normalizePlanId(planId: string | null | undefined): PlanId {
  const validPlan = getPlanById((planId ?? 'starter') as PlanId);
  return validPlan.id;
}
