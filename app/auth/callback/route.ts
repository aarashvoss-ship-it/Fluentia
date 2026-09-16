import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = new URL(request.url).origin;

  console.error("[AUTH CALLBACK] Step 1: Received OAuth callback", {
    hasCode: Boolean(code),
    origin,
  });

  if (!code) {
    console.error("[AUTH CALLBACK] Step 1 failed: OAuth code is missing");
    return NextResponse.redirect(new URL("/login?error=missing_oauth_code", origin));
  }

  const response = NextResponse.redirect(new URL("/dashboard", origin));
  console.error("[AUTH CALLBACK] Step 2: Created dashboard redirect response for session cookies");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
            console.error("[AUTH CALLBACK] Step 3: Attached Supabase cookie to dashboard response", { name });
          });
        },
      },
    },
  );

  console.error("[AUTH CALLBACK] Step 3: Exchanging OAuth code for session");
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("Supabase OAuth exchange error object:", exchangeError);
    console.error("Supabase OAuth callback failed:", {
      code: exchangeError.code,
      message: exchangeError.message,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, origin));
  }
  console.error("[AUTH CALLBACK] Step 4: OAuth code exchanged successfully");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    if (userError) console.error("Supabase authenticated-user error object:", userError);
    console.error("Supabase OAuth user lookup failed:", {
      code: userError?.code,
      message: userError?.message || "Authenticated user was not returned",
    });
    console.error("[AUTH CALLBACK] Step 5 failed: Authenticated user could not be read");
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  const userEmail = (user?.email || user?.user_metadata?.email || '').trim().toLowerCase();
  console.error('[AUTH CALLBACK] Step 5: Authenticated user read', { userEmail });
  if (!userEmail) {
    console.error('[AUTH CALLBACK] Supabase Error:', {
      code: "MISSING_USER_EMAIL",
      message: "Authenticated user has no email address",
    });
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const allowlistClient = serviceRoleKey
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
    : supabase;

  let data: { email: string } | null = null;
  let error: { code?: string; message: string; details?: string; hint?: string } | null = null;
  try {
    const result = await allowlistClient
      .from("allowed_users")
      .select("email")
      .ilike("email", userEmail)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (queryError) {
    console.error("Supabase allowlist query threw an error:", queryError);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  console.error('[AUTH CALLBACK] Step 6: Allowlist lookup completed', {
    matched: Boolean(data),
    error: error ? { code: error.code, message: error.message } : null,
  });

  if (error) {
    console.error("Supabase allowlist error object:", error);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
  }

  if (!data) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not_invited", origin));
  }

  let redirectPath = "/dashboard";
  if (userEmail === "aarashvoss@gmail.com") {
    redirectPath = "/instructor/avoss-9042";
  } else {
    try {
      const { data: student, error: studentError } = await allowlistClient
        .from("students")
        .select("email")
        .eq("email", userEmail)
        .maybeSingle();
      if (studentError) {
        console.error("Supabase authorized-student lookup failed:", {
          code: studentError.code,
          message: studentError.message,
          details: studentError.details,
          hint: studentError.hint,
        });
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
      }
      if (!student) {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=not_invited", origin));
      }
    } catch (studentError) {
      console.error("Authorized-student lookup threw an error:", studentError);
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=allowlist_check_failed", origin));
    }
  }

  response.headers.set("Location", new URL(redirectPath, origin).toString());
  console.error('[AUTH CALLBACK] Step 7: Allowlist match succeeded; preserving session cookies and redirecting', { redirectPath });
  return response;
}
