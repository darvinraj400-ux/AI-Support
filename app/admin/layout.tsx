import Link from 'next/link';
import { LogoutButton } from '@/components/admin/LogoutButton';

// Note: /admin access control is enforced in middleware.ts (layouts cannot
// read the request path, so gating there would redirect-loop /admin/login).
// This layout renders the dark admin shell + header.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <span className="text-sm font-semibold tracking-tight text-white">
              SupportAI Admin
            </span>
            <nav className="flex items-center gap-5 text-sm text-zinc-400">
              <Link href="/admin" className="hover:text-white">
                Overview
              </Link>
              <Link href="/admin/faqs" className="hover:text-white">
                FAQs
              </Link>
              <Link href="/admin/conversations" className="hover:text-white">
                Conversations
              </Link>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-8">{children}</main>
    </div>
  );
}
