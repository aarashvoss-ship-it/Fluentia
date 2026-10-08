import type { Metadata } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { ChunkErrorRecoveryReset } from "@/components/shared/chunk-error-recovery";
import { DisplaySettingsProvider } from "@/components/shared/display-settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["latin", "arabic"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fluentia \u2014 Master English through Deliberate Practice",
  description: "Personalized English learning platform tailored per individual student.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${vazirmatn.variable} font-sans`}>
      <body suppressHydrationWarning className="antialiased bg-background text-text-primary selection:bg-accent/20 selection:text-accent">
        <ChunkErrorRecoveryReset />
        <DisplaySettingsProvider>{children}</DisplaySettingsProvider>
      </body>
    </html>
  );
}
