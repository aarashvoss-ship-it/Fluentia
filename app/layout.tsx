import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ChunkErrorRecoveryReset } from "@/components/shared/chunk-error-recovery";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="en" suppressHydrationWarning className={`${inter.variable} font-sans`}>
      <body suppressHydrationWarning className={`${inter.className} antialiased bg-background text-text-primary selection:bg-accent/20 selection:text-accent`}>
        <ChunkErrorRecoveryReset />
        {children}
      </body>
    </html>
  );
}
