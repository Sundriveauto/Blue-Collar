import type { Metadata } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { WalletProvider } from "@/context/WalletContext";
import { OnboardingProvider } from "@/context/OnboardingContext";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import WebVitalsReporter from "@/components/WebVitalsReporter";
import OfflineBanner from "@/components/OfflineBanner";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://bluecollar.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "BlueCollar — Find Skilled Workers Near You",
    template: "%s | BlueCollar",
  },
  description:
    "Connect with trusted local tradespeople on a decentralised Stellar-powered platform.",
  keywords: ["skilled workers", "tradespeople", "Stellar", "blockchain", "local services"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: "BlueCollar",
    title: "BlueCollar — Find Skilled Workers Near You",
    description:
      "Connect with trusted local tradespeople on a decentralised Stellar-powered platform.",
    url: BASE_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "BlueCollar" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BlueCollar — Find Skilled Workers Near You",
    description:
      "Connect with trusted local tradespeople on a decentralised Stellar-powered platform.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="bc_theme">
          <AuthProvider>
            <WalletProvider>
              <OnboardingProvider>
                <OfflineBanner />
                <ServiceWorkerRegister />
                <WebVitalsReporter />
                {children}
                <PushNotificationPrompt />
              </OnboardingProvider>
            </WalletProvider>
          </AuthProvider>
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
