'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true } },
);

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const authError = searchParams.get('error');
  const callbackMessage = authError === 'not_invited'
    ? 'Your Google account is not on the Fluentia allowlist. Please contact your instructor for an invitation.'
    : authError === 'allowlist_check_failed'
      ? 'We could not verify your invitation right now. Please try again later or contact your instructor.'
      : authError === 'missing_oauth_code'
        ? 'The Google sign-in response was incomplete. Please try again.'
        : authError
          ? 'Sign-in could not be completed. Please try again.'
          : '';

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) {
        setCheckingSession(false);
        return;
      }
      const email = (data.user.email || data.user.user_metadata?.email || '').trim().toLowerCase();
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
      const { data: instructor } = await supabase.from('instructors').select('id').eq('id', data.user.id).maybeSingle();
      if (profile?.role === 'instructor' || profile?.role === 'admin' || instructor || email === 'aarashvoss@gmail.com') {
        router.replace('/instructor');
      } else {
        router.replace('/dashboard');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // PKCE returns an authorization code for /auth/callback to exchange.
  const handleGoogleLogin = async () => {
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) setMessage(error.message);
    setLoading(false);
  };

  if (checkingSession) return <main className="min-h-screen bg-[#0c1017]" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1017] px-4 py-10 text-stone-100">
      <section className="w-full max-w-md rounded-xl border border-[#293343] bg-[#171d28] p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Sign in to Fluentia</h1>
        <p className="mt-2 text-sm text-stone-400">Continue your language learning workspace.</p>

        {callbackMessage && <p className="mt-4 rounded-md border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-300" role="alert">{callbackMessage}</p>}

        <button type="button" onClick={() => void handleGoogleLogin()} disabled={loading} className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-[#dadce0] bg-white px-4 py-2.5 text-sm font-semibold text-[#3c4043] transition hover:bg-[#f8faff] disabled:cursor-wait disabled:opacity-60">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.35 12.23c0-.78-.07-1.53-.22-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.4Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.29v2.53A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.53 13.83A5.86 5.86 0 0 1 6.22 12c0-.64.11-1.26.31-1.83V7.64H3.29A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.04 4.36l3.24-2.53Z"/><path fill="#EA4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.24 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.71 5.39l3.24 2.53C6.3 7.86 8.46 6.14 12 6.14Z"/></svg>
          {loading ? 'Connecting...' : 'Continue with Google'}
        </button>

        {message && <p className="mt-4 rounded-md border border-[#394252] px-3 py-2 text-sm text-amber-300" role="status">{message}</p>}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0c1017]" />}>
      <LoginForm />
    </Suspense>
  );
}