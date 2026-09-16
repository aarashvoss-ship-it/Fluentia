import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_oauth_code", origin));
  }

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("Supabase OAuth exchange error object:", exchangeError);
    console.error("Supabase OAuth callback failed:", {
      code: exchangeError.code,
      message: exchangeError.message,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, origin));
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    if (userError) console.error("Supabase authenticated-user error object:", userError);
    console.error("Supabase OAuth user lookup failed:", {
      code: userError?.code,
      message: userError?.message || "Authenticated user was not returned",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  const userEmail = (user?.email || user?.user_metadata?.email || '').trim().toLowerCase();
  console.log('[AUTH CALLBACK] User Email:', userEmail);
  if (!userEmail) {
    console.error('[AUTH CALLBACK] Supabase Error:', {
      code: "MISSING_USER_EMAIL",
      message: "Authenticated user has no email address",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

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
  const { data, error } = await adminSupabase
    .from("allowed_users")
    .select("email")
    .ilike("email", userEmail)
    .maybeSingle();

  console.log('[AUTH CALLBACK] Allowlist Match:', data);
  console.log('[AUTH CALLBACK] Supabase Error:', error);

  if (error) {
    console.error("Supabase allowlist error object:", error);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

  if (!data) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

  // Keep the exchanged session intact for approved users.
  return response;
}
