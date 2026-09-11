'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0c1017] text-[#e8e7e4] antialiased">
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="w-full max-w-md rounded-xl border border-[#202631] bg-[#121721] p-8 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">
              Fluentia
            </p>
            <h1 className="mb-3 text-xl font-semibold text-stone-100">
              Something went wrong
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-stone-400">
              The page could not be rendered. Please try again.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-[#0c1017] transition-colors hover:bg-amber-400"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
