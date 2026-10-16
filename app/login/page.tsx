'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/identity';

type AuthMode = 'signin' | 'signup';

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

  // Helper function for the quick login of 3 key users
  async function handleQuickLogin(targetEmail: string, targetName: string) {
    setLoading(true);
    setMessage('');
    // Since these three users are special, we send a direct request or a local magic login,
    // Alternatively, you can send dummy or default values ​​so that the Pasta backend recognizes them
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: targetEmail, password: 'bypass_secure_password_123', name: targetName }),
      });
      const result = await response.json() as { error?: string; user?: { role: string } };
      if (!response.ok || !result.user) {
        // If the backend is strict, you can redirect directly to the dashboard or handle the error.
        setMessage(result.error || 'Quick login failed. Please check backend API.');
        return;
      }
      router.replace(result.user.role === 'instructor' || result.user.role === 'admin' ? '/instructor' : '/dashboard');
    } catch (error) {
      console.error('Quick login failed:', error);
      setMessage('Quick login is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, email, password }),
      });
      const result = await response.json() as {
        error?: string;
        user?: { role: string };
      };
      if (!response.ok || !result.user) {
        setMessage(result.error || 'Authentication failed. Please try again.');
        return;
      }
      router.replace(result.user.role === 'instructor' || result.user.role === 'admin' ? '/instructor' : '/dashboard');
    } catch (error) {
      console.error('Native sign-in request failed:', error);
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

        {/* بخش ویژه ورود سریع ۳ کاربر تعیین شده */}
        {mode === 'signin' && (
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs font-medium text-amber-400 mb-3">⚡ ورود سریع مدیر و دانشجویان اصلی:</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void handleQuickLogin('aarashvoss@gmail.com', 'AVoss')}
                disabled={loading}
                className="w-full rounded bg-amber-500/20 px-3 py-2 text-left text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition flex justify-between items-center"
              >
                <span>👑 AVoss (Admin / Instructor)</span>
                <span className="text-[10px] opacity-75">ورود مستقیم</span>
              </button>
              <button
                type="button"
                onClick={() => void handleQuickLogin('aarashvossoughi@gmail.com', 'Arash Vossoughi')}
                disabled={loading}
                className="w-full rounded bg-stone-800 px-3 py-2 text-left text-xs font-medium text-stone-200 hover:bg-stone-700 transition flex justify-between items-center border border-border"
              >
                <span>🎓 Arash Vossoughi (Student 14)</span>
                <span className="text-[10px] opacity-75">ورود مستقیم</span>
              </button>
              <button
                type="button"
                onClick={() => void handleQuickLogin('f.soheilikia.lastqueen2002@gmail.com', 'Fateme Soheilikia')}
                disabled={loading}
                className="w-full rounded bg-stone-800 px-3 py-2 text-left text-xs font-medium text-stone-200 hover:bg-stone-700 transition flex justify-between items-center border border-border"
              >
                <span>🎓 Fateme Soheilikia (Student)</span>
                <span className="text-[10px] opacity-75">ورود مستقیم</span>
              </button>
            </div>
          </div>
        )}

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          {/* The remainder of the form remains in effect. */}
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