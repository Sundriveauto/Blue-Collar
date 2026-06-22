"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { sendContactRequest } from "@/lib/api";

interface Props {
  workerId: string;
  workerName: string;
}

export default function ContactModal({ workerId, workerName }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage("");
    setStatus("idle");
    setError(null);
  };

  const handleOpenChange = (val: boolean) => {
    setOpen(val);
    if (!val) reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return setError("Message cannot be empty.");
    if (trimmed.length < 10) return setError("Message must be at least 10 characters.");
    if (trimmed.length > 1000) return setError("Message must be under 1000 characters.");

    setStatus("loading");
    setError(null);
    try {
      await sendContactRequest(workerId, trimmed);
      setStatus("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send message.";
      setError(msg.includes("429") ? "You've sent too many messages. Please wait before trying again." : msg);
      setStatus("error");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors">
          <MessageSquare size={15} />
          Contact
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-gray-900">
                Contact {workerName}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-gray-500">
                Send a message to get in touch.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close dialog"
              className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>

          {status === "success" ? (
            <div role="status" className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 size={36} className="text-green-500" aria-hidden="true" />
              <p className="text-sm font-medium text-gray-800">Message sent!</p>
              <p className="text-xs text-gray-500">
                {workerName} will be notified and may reach out to you.
              </p>
              <Dialog.Close className="mt-2 rounded-lg bg-gray-100 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
                Close
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Your message
                </label>
                <textarea
                  id="contact-message"
                  rows={5}
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); setError(null); }}
                  placeholder={`Hi ${workerName}, I'd like to discuss...`}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="mt-1 flex justify-between">
                  {error ? (
                    <p role="alert" className="text-xs text-red-500">{error}</p>
                  ) : (
                    <span />
                  )}
                  <span
                    aria-live="polite"
                    className={`text-xs ${message.length > 1000 ? "text-red-500" : "text-gray-400"}`}
                  >
                    {message.length}/1000
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <Dialog.Close className="flex-1 rounded-lg border py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {status === "loading" && <Loader2 size={14} className="animate-spin" />}
                  Send Message
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
