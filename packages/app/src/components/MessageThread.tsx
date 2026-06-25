"use client";

import { useEffect, useRef } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import MessageInput from "./MessageInput";
import type { Message } from "@/types";

interface Props {
  messages: Message[];
  conversationId: string | null;
  onSend: (body: string) => void;
  currentUserId: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shouldShowDate(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].createdAt);
  const curr = new Date(messages[index].createdAt);
  return prev.toDateString() !== curr.toDateString();
}

export default function MessageThread({
  messages,
  conversationId,
  onSend,
  currentUserId,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-sm font-medium">Select a conversation</p>
          <p className="text-xs mt-1">Choose a conversation from the list to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => (
              <div key={msg.id}>
                {shouldShowDate(messages, idx) && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "flex items-end gap-2",
                    msg.senderId === currentUserId ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-end gap-2 max-w-[75%]",
                      msg.senderId === currentUserId ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {msg.sender.avatar ? (
                      <img
                        src={msg.sender.avatar}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                        <User size={12} className="text-gray-500" />
                      </div>
                    )}
                    <div>
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          msg.senderId === currentUserId
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        )}
                      >
                        {msg.body}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 flex items-center gap-1 px-1",
                          msg.senderId === currentUserId ? "justify-end" : "justify-start"
                        )}
                      >
                        <span className="text-[10px] text-gray-400">
                          {formatTime(msg.createdAt)}
                        </span>
                        {msg.senderId === currentUserId && (
                          <span className="text-[10px] text-gray-400">
                            {msg.readAt ? "Read" : "Sent"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <MessageInput onSend={onSend} />
    </div>
  );
}
