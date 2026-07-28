'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Xato yuz berdi</h1>
      <p className="max-w-md text-sm text-[var(--color-text-muted)]">{error.message}</p>
      <button
        type="button"
        className="rounded-xl bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white"
        onClick={() => reset()}
      >
        Qayta urinish
      </button>
    </div>
  );
}
