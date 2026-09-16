import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_oauth_code", origin));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Supabase OAuth callback failed:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    console.error("Supabase OAuth user lookup failed:", {
      code: userError?.code,
      message: userError?.message || "Authenticated user has no email address",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  const email = userData.user.email.toLowerCase();
  const { data: allowedUser, error: allowlistError } = await supabase
    .from("allowed_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (allowlistError) {
    console.error("Supabase allowlist lookup failed:", {
      code: allowlistError.code,
      message: allowlistError.message,
      details: allowlistError.details,
      hint: allowlistError.hint,
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  if (!allowedUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
