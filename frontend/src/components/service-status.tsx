"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "ready" | "unavailable";
const labels: Record<Status, string> = {
  checking: "Проверяем подключение…",
  ready: "Сервис доступен",
  unavailable: "Не удалось подключиться к сервису",
};

export function ServiceStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 8000);
    async function check() {
      try {
        const response = await fetch("/api/health/ready", {
          cache: "no-store",
          headers: { "X-WebNB-Client": "1" },
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        const ready = response.ok && typeof body === "object" && body !== null
          && "status" in body && body.status === "ready";
        if (active) setStatus(ready ? "ready" : "unavailable");
      } catch {
        if (active) setStatus("unavailable");
      } finally {
        clearTimeout(timeout);
      }
    }
    void check();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p role="status" aria-live="polite" className="text-base text-slate-700">{labels[status]}</p>
      <button
        type="button"
        disabled={status === "checking"}
        onClick={() => { setStatus("checking"); setAttempt((value) => value + 1); }}
        className="rounded-lg border border-slate-300 px-4 py-2 text-base font-medium hover:bg-slate-50 disabled:opacity-50"
      >Проверить подключение</button>
    </div>
  );
}
