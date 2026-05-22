import { Header } from "@/components/customer/header";
import { Footer } from "@/components/customer/footer";
import { BottomNav } from "@/components/customer/bottom-nav";
import { NotificationPrompt } from "@/components/customer/notification-prompt";
import { AnnouncementBanner } from "@/components/customer/announcement-banner";
import { Suspense } from "react";
import { ChatBubble } from "@/components/customer/chat-bubble";
import { PincodeCheckerModal } from "@/components/customer/pincode-checker";
import { SourceTracker } from "@/components/customer/source-tracker";
import { AppProviders } from "@/components/providers";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppProviders>
      <AnnouncementBanner />
      <Header />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
      <Footer />
      <NotificationPrompt />
      <ChatBubble />
      <PincodeCheckerModal />
      <Suspense fallback={null}>
        <SourceTracker />
      </Suspense>
    </AppProviders>
  );
}
