# Architecture

## Product Stance
The app is designed around billing state, not page count. Checkout, payment confirmation, invoice creation, notifications, and subscription lifecycle are treated as one state machine so edge cases stay visible.

## Core Decisions
- Authentication uses JWT cookies with email/password accounts. This keeps ownership simple and lets the user own their billing state directly.
- MongoDB is the primary persistence layer. When `MONGODB_URI` is not set, the app falls back to an in-memory store so the project still runs locally without external services.
- Checkout creates a pending payment first. Subscription activation only happens after the webhook applies the event.
- Razorpay is the primary test-mode payment path in the current implementation. When Razorpay keys are present, the app creates a Razorpay order, opens the popup, verifies the callback signature, and redirects to the success page after confirmation.
- Stripe remains a supported fallback path when Stripe keys are present.
- Webhook handlers normalize provider-specific payloads into a shared internal event model.
- Webhook processing is idempotent. Event ids are recorded so replayed deliveries are ignored before any state mutation occurs.
- Notifications are also idempotent through an `idempotencyKey`, so duplicate webhook deliveries do not send duplicate email notifications.
- Plan changes are supported as first-class lifecycle events. Upgrades and downgrades create payment flows and update the subscription only after confirmation.
- Cancellation is effective at period end, not immediately, so access continues until the current cycle ends.

## Data Model
- `users`: identity, email, password hash, created and updated timestamps.
- `subscriptions`: current plan, status, cancellation flag, billing period bounds, scheduled plan changes, and provider references.
- `payments`: payment state, plan id, provider, checkout session / intent ids, invoice link, and subscription link.
- `invoices`: one record per charge, linked to payment and subscription.
- `notifications`: deduped email intents and sent status.
- `processed_webhooks`: provider, event id, event type, and processed timestamp.

## Flow Notes
### Auth
The auth form is shared by login and signup. It posts JSON to the auth routes, sets a JWT cookie on success, and redirects to the dashboard.

### Checkout
The checkout route creates a payment record first. If Razorpay is configured, the server creates a Razorpay order and returns the checkout session id plus the public key needed by the client popup. If Stripe is configured instead, it returns a Stripe checkout session. Otherwise it falls back to a mock session for local demo use.

### Razorpay Popup Flow
The Razorpay client component loads the checkout script, opens the popup, and confirms the callback through the Razorpay webhook route. The client now redirects to the success page after a handled or duplicate confirmed callback so the user sees a proper post-payment state.

### Success Page
The checkout success page reads the stored payment and subscription state, then summarizes payment status, plan, provider, amount, customer, and webhook status. It is intentionally a confirmation summary, not the source of truth.

### Webhooks
Both Stripe and Razorpay events are normalized into the same internal billing event shape before processing. Duplicate event ids are ignored, and the app only mutates state once per logical event.

### Notifications
Notification records are created before sending. If the same logical billing event is replayed, the notification record prevents duplicate delivery.

## Trade-offs
- A single Next.js app was chosen instead of splitting the backend out into a separate service because the assignment is about reliability of state transitions, not service count.
- Demo mode is intentionally built in so the flow can be exercised without payment credentials.
- The app keeps the subscription conservative and webhook-driven rather than optimistic, because that is the safer and more testable billing model.

## Validation Notes
- TypeScript is the primary guardrail (`npm run typecheck`).
- Vitest covers checkout confirmation and webhook idempotency.
- `npm run lint` maps to type checking in this repo because of the current Windows toolchain setup.
