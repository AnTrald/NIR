import { expect, test } from "@playwright/test";

test("страница получает readiness через Next.js и FastAPI с проверкой PostgreSQL", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = page.waitForResponse((item) => item.url().endsWith("/api/health/ready"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Web Notebook" })).toBeVisible();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("Сервис доступен");
  await page.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(page.getByRole("status")).toHaveText("Сервис доступен");
  expect(errors).toEqual([]);
});

test("недоступность API отображается и повторная проверка восстанавливает состояние", async ({ page }) => {
  await page.route("**/api/health/ready", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"service_unavailable"}}' }));
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Не удалось подключиться к сервису");
  await page.unroute("**/api/health/ready");
  await page.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(page.getByRole("status")).toHaveText("Сервис доступен");
});

test("Swagger загружает OpenAPI и выполняет оба запроса через порт приложения", async ({ page }) => {
  const schemaResponse = page.waitForResponse((response) => response.url().endsWith("/api/openapi.json"));
  await page.goto("/api/docs");
  expect((await schemaResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: /Web Notebook API/ })).toBeVisible();

  for (const [endpoint, status] of [["live", "alive"], ["ready", "ready"]] as const) {
    const path = `/api/health/${endpoint}`;
    const operation = page.locator(".opblock").filter({
      has: page.locator(".opblock-summary-path", { hasText: path }),
    });
    await operation.locator(".opblock-summary").click();
    await operation.getByRole("button", { name: "Try it out", exact: true }).click();
    const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === path);
    await operation.getByRole("button", { name: "Execute", exact: true }).click();
    const response = await responsePromise;
    expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status });
  }
});
