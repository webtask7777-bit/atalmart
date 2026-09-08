"use client";

import dynamic from "next/dynamic";

// Floating helpers that nobody needs before first paint. Loading them after
// hydration keeps their code (and the chat UI) off the critical path.
const ChatBubble = dynamic(
  () => import("@/components/customer/chat-bubble").then((m) => m.ChatBubble),
  { ssr: false },
);
const NotificationPrompt = dynamic(
  () => import("@/components/customer/notification-prompt").then((m) => m.NotificationPrompt),
  { ssr: false },
);

export function DeferredWidgets() {
  return (
    <>
      <NotificationPrompt />
      <ChatBubble />
    </>
  );
}
