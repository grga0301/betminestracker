// src/app/layout.tsx

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BetMines Double Tracker',
  description: 'Track your BetMines football double bets',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-pitch text-chalk antialiased">{children}</body>
    </html>
  );
}
