"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/identity";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void getAuthenticatedUser().then((user) => {
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      if (user.role === "instructor" || user.role === "admin") {
        router.replace("/instructor");
      } else if (user.role === "student") {
        router.replace("/dashboard");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <main className="min-h-screen bg-background" />;
}
