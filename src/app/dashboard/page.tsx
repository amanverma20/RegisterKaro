import { SubscriptionActions } from '@/components/subscription-actions';
import { getDashboardData } from '@/lib/billing';
import { formatMoney, getPlanById } from '@/lib/domain';
import { getAuthenticatedUserFromCookies } from '@/lib/http';
import { getStore } from '@/lib/store';
import { redirect } from 'next/navigation';

function statusClass(status: string | null | undefined) {
  if (!status) return 'status-chip neutral';
  if (status === 'active') return 'status-chip ok';
  if (status === 'pending_activation' || status === 'past_due') return 'status-chip warn';
  if (status === 'canceled' || status === 'expired') return 'status-chip bad';
  return 'status-chip neutral';
}

export default async function DashboardPage() {
  const store = await getStore();
  const user = await getAuthenticatedUserFromCookies(store);

  if (!user) {
    redirect('/login');
  }

  const data = await getDashboardData(store, user);
  const currentPlan = getPlanById(data.subscription?.planId ?? 'starter');

  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <section className="hero-card" style={{ marginBottom: 24 }}>
        <span className="kicker">Customer dashboard</span>
        <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4.4rem)' }}>Subscription state, payments, invoices, and notifications in one place.</h1>
        <p>
          The focus here is the flow behind the product: pending vs confirmed payment, once-only webhook application,
          and the exact moment a subscription becomes active.
        </p>
      </section>

      <div className="page-grid">
        <div className="layout-stack">
          <section className="card">
            <div className="pill-row">
              <span className={statusClass(data.subscription?.status ?? null)}>{data.subscription?.status ?? 'no subscription'}</span>
              <span className="status-chip neutral">{data.user.email}</span>
              <span className="status-chip neutral">Current plan: {currentPlan.name}</span>
              {data.subscription?.scheduledPlanId ? (
                <span className="status-chip warn">
                  Pending {data.subscription.scheduledPlanChangeType ?? 'change'} to {getPlanById(data.subscription.scheduledPlanId).name}
                </span>
              ) : null}
            </div>
            <div className="grid-2" style={{ marginTop: 18 }}>
              <div className="table-card" style={{ padding: 18 }}>
                <div className="small">Current period</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {data.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-IN') : 'Not active yet'}
                </div>
              </div>
              <div className="table-card" style={{ padding: 18 }}>
                <div className="small">Latest payment</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {data.subscription?.latestPaymentId ? 'Recorded' : 'None yet'}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title" style={{ fontSize: '1.5rem', marginTop: 0 }}>Choose a plan</h2>
            <SubscriptionActions
              currentPlanId={data.subscription?.planId ?? null}
              subscriptionStatus={data.subscription?.status ?? null}
              cancelAtPeriodEnd={Boolean(data.subscription?.cancelAtPeriodEnd)}
            />
          </section>

          <section className="table-card">
            <h2 className="section-title" style={{ fontSize: '1.5rem', marginTop: 0 }}>Billing history</h2>
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.length > 0 ? (
                  data.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{invoice.lineItems[0]?.label ?? 'Invoice'}</td>
                      <td>{formatMoney(invoice.amountMinor, invoice.currency)}</td>
                      <td>{invoice.status}</td>
                      <td>{new Date(invoice.issuedAt).toLocaleString('en-IN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No invoices yet. Complete checkout to generate one.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="sidebar-stack">
          <section className="card">
            <h3 className="section-title" style={{ fontSize: '1.25rem', marginTop: 0 }}>Recent payments</h3>
            <div className="stack-compact">
              {data.payments.length > 0 ? (
                data.payments.map((payment) => (
                  <div className="link-card" key={payment.id}>
                    <div className="pill-row">
                      <strong>{getPlanById(payment.planId).name}</strong>
                      <span className={statusClass(payment.status)}>{payment.status}</span>
                    </div>
                    <div className="muted">{payment.description}</div>
                    <div style={{ marginTop: 8, fontWeight: 700 }}>{formatMoney(payment.amountMinor, payment.currency)}</div>
                  </div>
                ))
              ) : (
                <div className="notice">No payment records yet.</div>
              )}
            </div>
          </section>

          <section className="card">
            <h3 className="section-title" style={{ fontSize: '1.25rem', marginTop: 0 }}>Notifications</h3>
            <div className="stack-compact">
              {data.notifications.length > 0 ? (
                data.notifications.slice(0, 5).map((notification) => (
                  <div className="link-card" key={notification.id}>
                    <div className="pill-row">
                      <strong>{notification.type}</strong>
                      <span className={notification.sentAt ? 'status-chip ok' : 'status-chip warn'}>
                        {notification.sentAt ? 'sent' : 'queued'}
                      </span>
                    </div>
                    <div className="muted">{notification.subject}</div>
                  </div>
                ))
              ) : (
                <div className="notice">Notification log will appear here after checkout or cancellation.</div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
