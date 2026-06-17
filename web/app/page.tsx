import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-16 font-sans">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">nCoto</p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-900">
          Control de acceso para cotos
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600">
          QR, caseta y morosidad operando con reglas claras.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          La caseta ejecuta reglas del coto sin depender del WhatsApp del administrador.
        </p>

        <nav className="mt-10 flex flex-col gap-3">
          <Link
            href="/guardia/scan"
            className="flex h-12 items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Caseta — escaneo
          </Link>
          <Link
            href="/admin/dashboard"
            className="flex h-12 items-center justify-center rounded-lg border border-zinc-300 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
          >
            Administración — morosidad
          </Link>
        </nav>
      </main>
    </div>
  );
}
