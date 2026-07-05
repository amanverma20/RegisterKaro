# RegisterKaro Billing Platform

RegisterKaro is a Next.js 15 subscription billing app built around the payment states that matter: pending checkout, confirmed payment, webhook application, invoice creation, notifications, and subscription lifecycle changes.

## What it does
- Email/password auth with JWT cookies
- Plan browsing and subscription checkout
- Razorpay test-mode checkout with popup flow
- Stripe checkout fallback when Stripe keys are configured
- Webhook-driven payment confirmation and idempotent event handling
- Invoice creation and notification logging
- Subscription upgrades, downgrades, cancellations, and billing history
- MongoDB persistence with an in-memory fallback when `MONGODB_URI` is not set

## Tech Stack
- Next.js 15 + React 19
- Node.js route handlers
- MongoDB
- Razorpay test mode
- Stripe fallback support
- Resend or console notifications

## Quick Start
1. Copy `.env.example` to `.env.local`.
2. Set `JWT_SECRET`.
3. Set `MONGODB_URI` if you want persistence, otherwise the app uses the in-memory store.
4. Add Razorpay test keys for the popup checkout flow:
	- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
	- `RAZORPAY_KEY_ID`
	- `RAZORPAY_KEY_SECRET`
	- `RAZORPAY_WEBHOOK_SECRET`
5. Optionally add Stripe keys if you want the Stripe checkout branch.
6. Run `npm install`.
7. Run `npm run dev`.
8. Open `http://localhost:3000`.

## Environment Variables
Required for local auth:
- `JWT_SECRET`

Recommended for persistence:
- `MONGODB_URI`
- `MONGODB_DB`

Razorpay test mode:
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Stripe mode:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Email notifications:
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## How the Flow Works
1. A user signs up or signs in with email and password.
2. The dashboard shows the current subscription, recent payments, invoices, and notifications.
3. Clicking checkout creates a pending payment first.
4. If Razorpay keys are configured, the app creates a Razorpay order and opens the Razorpay popup.
5. The Razorpay callback posts back to the webhook route, which verifies the signature and applies the event exactly once.
6. The subscription becomes active only after webhook confirmation.
7. The success page shows the confirmed payment, plan, provider, and webhook status.

## Checkout Modes
### Razorpay
Razorpay is the primary test-mode checkout path in this implementation. The app creates a Razorpay order, opens the popup, confirms the callback signature, and redirects to the checkout success page after confirmation.

### Stripe
If Stripe keys are present and Razorpay is not configured, the app falls back to Stripe Checkout.

### Local Demo
If neither Razorpay nor Stripe is configured, the app uses a local demo checkout so the flow can still be exercised end to end.

## Verification
- `npm run typecheck`
- `npm test`
- `npm run build`

## Demonstration Video
- Google Drive: https://drive.google.com/file/d/1PeiRmrMUDwEXz1DFk78eHN8ApzomOAcE/view?usp=sharing

## Notes
- `npm run lint` is mapped to `npm run typecheck` in this repository.
- The app is designed to show the state transitions clearly, not hide them behind optimistic UI.
