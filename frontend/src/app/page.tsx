import { ServiceStatus } from "@/components/service-status";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="mb-4 text-base font-semibold text-blue-700">Пространство для веб-экспериментов</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Web Notebook</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
          HTML, CSS, JavaScript и пояснения в одном документе.
        </p>
        <div className="mt-10 border-t border-slate-200 pt-6"><ServiceStatus /></div>
      </section>
    </main>
  );
}
