import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Nimbus Analytics — AI support that knows when to hand off',
    template: '%s · Nimbus',
  },
  description:
    'Nimbus Analytics pairs real-time product analytics with an AI support assistant that answers from the docs and hands off to a human when unsure.',
  openGraph: {
    title: 'Nimbus Analytics — AI support that knows when to hand off',
    description:
      'Real-time product analytics with an AI assistant that answers from the docs and hands off to a human when unsure.',
    type: 'website',
    url: '/',
    siteName: 'Nimbus Analytics',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nimbus Analytics — AI support that knows when to hand off',
    description:
      'Real-time product analytics with an AI assistant that answers from the docs and hands off to a human when unsure.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`${geistSans.className} min-h-full flex flex-col`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
