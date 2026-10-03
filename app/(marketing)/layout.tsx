import { ChatWidget } from '@/components/chat/ChatWidget';

// Widget lives on marketing pages only (landing + case study) — never admin.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ChatWidget />
    </>
  );
}
