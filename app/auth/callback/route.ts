import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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
    console.error("Supabase OAuth exchange error object:", error);
    console.error("Supabase OAuth callback failed:", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    if (userError) console.error("Supabase authenticated-user error object:", userError);
    console.error("Supabase OAuth user lookup failed:", {
      code: userError?.code,
      message: userError?.message || "Authenticated user has no email address",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  const email = userData.user.email.trim().toLowerCase();
  console.log("Authenticated Google user email:", email);

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("Supabase allowlist lookup failed:", {
      code: "MISSING_SERVICE_ROLE_KEY",
      message: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: allowedUser, error: allowlistError } = await adminSupabase
    .from("allowed_users")
    .select("email")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  console.log("Allowed users query result:", { data: allowedUser, error: allowlistError });

  if (allowlistError) {
    console.error("Supabase allowlist error object:", allowlistError);
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

  // Keep the exchanged session intact for approved users.
  return NextResponse.redirect(new URL("/dashboard", origin));
}
