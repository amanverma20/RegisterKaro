import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';

const headingFont = Space_Grotesk({ subsets: ['latin'], variable: '--font-heading' });
const bodyFont = Manrope({ subsets: ['latin'], variable: '--font-body' });

export const metadata: Metadata = {
  title: 'RegisterKaro Billing Platform',
  description: 'A subscription billing product with payments, webhooks, invoices, and notifications.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>
        <div className="shell">
          <div className="container">
            <header className="header-bar">
              <a href="/" className="brand">
                <span className="brand-mark" />
                <span>RegisterKaro Billing</span>
              </a>
              <nav className="nav-links">
                <a href="/" className="nav-pill">Pricing</a>
                <a href="/dashboard" className="nav-pill">Dashboard</a>
                <a href="/login" className="nav-pill">Sign in</a>
                <a href="/signup" className="nav-pill">Create account</a>
              </nav>
            </header>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
