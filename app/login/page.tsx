'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { AccessCard } from '@/components/access/access-card';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { flowType: 'pkce' } },
);

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const notInvited = searchParams.get('error') === 'not_invited';

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

  // Handle Email & Password Authentication (Sign In / Sign Up Fallback)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // If user does not exist, attempt sign up
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (signUpError) setMessage(signUpError.message);
      else setMessage('Registration successful! Please verify your email or sign in.');
    } else {
      setMessage('Successfully logged in!');
      window.location.href = '/';
    }
    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c1017] px-4 py-10 text-stone-100">
      <section className="w-full max-w-md rounded-xl border border-[#293343] bg-[#171d28] p-6 shadow-xl">
        {notInvited && <AccessCard title="By Invitation Only" message="Your Google account is not on the Fluentia allowlist. Please contact your instructor for an invitation." />}
        <h1 className="text-2xl font-semibold">Sign in to Fluentia</h1>
        <p className="mt-2 text-sm text-stone-400">Continue your language learning workspace.</p>

        <button type="button" onClick={() => void handleGoogleLogin()} disabled={loading} className="mt-6 w-full rounded-md border border-[#394252] px-4 py-2.5 text-sm font-semibold text-stone-200 transition hover:border-amber-500 hover:text-amber-300 disabled:cursor-wait disabled:opacity-60">
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-stone-500"><span className="h-px flex-1 bg-[#293343]" /><span>or use email</span><span className="h-px flex-1 bg-[#293343]" /></div>

        <form onSubmit={(event) => void handleEmailLogin(event)} className="space-y-4">
          <label className="block text-sm text-stone-300">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-sm outline-none focus:border-amber-500" /></label>
          <label className="block text-sm text-stone-300">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} autoComplete="current-password" className="mt-1 w-full rounded-md border border-[#394252] bg-[#0c1017] px-3 py-2.5 text-sm outline-none focus:border-amber-500" /></label>
          <button type="submit" disabled={loading} className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[#0c1017] transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60">{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>

        {message && <p className="mt-4 rounded-md border border-[#394252] px-3 py-2 text-sm text-amber-300" role="status">{message}</p>}
      </section>
    </main>
  );
}