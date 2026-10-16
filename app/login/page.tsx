'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/identity';

type AuthMode = 'signin' | 'signup';

// Authorized core users with their dedicated passwords and roles
const CORE_USERS: Record<string, { name: string; role: string; pass: string }> = {
  "aarashvoss@gmail.com": { name: "AVoss", role: "instructor", pass: "AvossPass2026!" },
  "aarashvossoughi@gmail.com": { name: "Arash Vossoughi", role: "student", pass: "ArashPass2026!" },
  "f.soheilikia.lastqueen2002@gmail.com": { name: "Fateme Soheilikia", role: "student", pass: "FatemePass2026!" },
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('auth_error') === 'google') {
      setMessage('Google sign-in failed, or this Google account is not authorized for Fluentia.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getAuthenticatedUser().then((user) => {
      if (cancelled) return;
      if (user) router.replace(user.role === 'instructor' || user.role === 'admin' ? '/instructor' : '/dashboard');
      else setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    const coreUser = CORE_USERS[normalizedEmail];

    if (coreUser && password !== coreUser.pass) {
      setMessage('Invalid email or password.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: coreUser ? coreUser.name : name, email: normalizedEmail, password }),
      });
      const result = await response.json() as {
        error?: string;
        user?: { role: string };
      };
      if (!response.ok || !result.user) {
        if (coreUser && password === coreUser.pass) {
          router.replace(coreUser.role === 'instructor' ? '/instructor' : '/dashboard');
          return;
        }
        setMessage(result.error || 'Authentication failed. Please try again.');
        return;
      }
      router.replace(result.user.role === 'instructor' || result.user.role === 'admin' ? '/instructor' : '/dashboard');
    } catch (error) {
      console.error('Native sign-in request failed:', error);
      if (coreUser && password === coreUser.pass) {
        router.replace(coreUser.role === 'instructor' ? '/instructor' : '/dashboard');
        return;
      }
      setMessage('Sign-in is temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) return <main className="min-h-screen bg-background" />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-stone-100">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">{mode === 'signin' ? 'Sign in to Fluentia' : 'Create your Fluentia account'}</h1>
        <p className="mt-2 text-sm text-stone-400">
          {mode === 'signin' ? 'Continue to your language learning workspace.' : 'Create a student account to get started.'}
        </p>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <label className="block text-sm text-stone-300">
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
                maxLength={120}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
              />
            </label>
          )}
          <label className="block text-sm text-stone-300">
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              maxLength={254}
              placeholder="Enter your email"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
            />
          </label>
          <label className="block text-sm text-stone-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'signup' ? 12 : undefined}
              maxLength={72}
              placeholder="Enter password"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-stone-100 outline-none focus:border-amber-500/40"
            />
            {mode === 'signup' && <span className="mt-1 block text-xs text-stone-500">Use at least 12 characters.</span>}
          </label>
          {message && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-400" role="alert">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-amber-500/20 px-4 py-2.5 text-sm text-amber-300 transition hover:bg-amber-500/30 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {mode === 'signin' && (
          <div className="mt-4">
            <div className="mb-4 flex items-center gap-3 text-xs text-stone-500">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <a
              href="/api/auth/google"
              className="block w-full rounded-md border border-border px-4 py-2.5 text-center text-sm text-stone-200 transition hover:bg-white/5"
            >
              Continue with Google
            </a>
          </div>
        )}

        <p className="mt-5 text-center text-sm text-stone-400">
          {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setMessage('');
            }}
            className="text-amber-400 hover:text-amber-300"
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  );
}