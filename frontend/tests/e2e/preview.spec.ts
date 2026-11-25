import { expect, test } from "@playwright/test";

test.use({channel:process.env.PLAYWRIGHT_CHANNEL, viewport:{width:1440,height:950}});
test.beforeEach(async ({page})=>{
  await page.goto("/");
  await expect(page.locator(".run-status")).toHaveText("Запуск №1");
});
const frame = 'iframe[title="Предпросмотр блокнота"]';

test("реальный runner, DOM группы, отключение родителя сохраняет состояние детей",async ({page,request})=>{
  const response=await request.get("/preview/runner");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("connect-src 'none'");
  await expect(page.locator(frame)).toHaveAttribute("sandbox","allow-scripts allow-modals");
  const cards=page.frameLocator(frame).locator(".palette > article");
  await expect(cards).toHaveCount(3);
  await page.getByRole("checkbox",{name:"Активность · Глина"}).click();
  await expect(cards).toHaveCount(2);
  const group=page.getByRole("checkbox",{name:"Активность · Палитра"});
  await group.click();
  await expect(page.locator(".run-status")).toHaveText("Запуск №3");
  await expect(cards).toHaveCount(0);
  await group.click();
  await expect(cards.locator("h2")).toHaveText(["Шалфей","Лён"]);
});

test("повторяющиеся CSS-свойства переключаются независимо",async ({page})=>{
  const css=page.locator("#cell-styles");
  await css.locator(".cm-content").fill("article { color: red; color: blue; }");
  await page.getByRole("button",{name:"Перезапустить проект"}).click();
  const article=page.frameLocator(frame).locator("article").first();
  await expect(article).toHaveCSS("color","rgb(0, 0, 255)");
  const toggle=css.getByRole("checkbox",{name:"Свойство color",exact:true}).nth(1);
  await toggle.click();
  await expect(article).toHaveCSS("color","rgb(255, 0, 0)");
  await toggle.click();
  await expect(article).toHaveCSS("color","rgb(0, 0, 255)");
});

test("перезапуск очищает глобальные переменные, масштаб сохраняет документ",async ({page})=>{
  const js=page.locator("#cell-script");
  await js.locator(".cm-content").fill("window.count = (window.count || 0) + 1; document.body.dataset.count = window.count;");
  await js.locator(".activity").click();
  const body=page.frameLocator(frame).locator("body");
  await expect(body).toHaveAttribute("data-count","1");
  const old=await page.locator(frame).getAttribute("src");
  await page.getByRole("button",{name:"Перезапустить проект"}).click();
  await expect(page.locator(frame)).not.toHaveAttribute("src",old!);
  await expect(body).toHaveAttribute("data-count","1");
  const src=await page.locator(frame).getAttribute("src");
  const slider=page.getByRole("slider",{name:"Масштаб"});
  await slider.press("End");
  await expect(page.locator(frame)).toHaveCSS("transform","matrix(3, 0, 0, 3, 0, 0)");
  await slider.press("Home");
  await expect(page.locator(frame)).toHaveCSS("transform","matrix(0.25, 0, 0, 0.25, 0, 0)");
  await page.getByRole("button",{name:"Сбросить масштаб"}).click();
  await expect(slider).toHaveValue("100");
  await expect(page.locator(frame)).toHaveAttribute("src",src!);
});

test("ошибка сохраняет предыдущий результат, Ctrl+S запускает исправление",async ({page})=>{
  const editor=page.locator("#cell-heading .cm-content"), heading=page.frameLocator(frame).locator("h1");
  const src=await page.locator(frame).getAttribute("src");
  await editor.fill("<h1>Черновик");
  await editor.press("Control+s");
  await expect(page.locator(".diagnostics")).toContainText("Запуск заблокирован");
  await expect(page.locator(frame)).toHaveAttribute("src",src!);
  await expect(heading).toHaveText("Природные оттенки");
  await editor.fill("<h1>Исправлено</h1>");
  await expect(heading).toHaveText("Природные оттенки");
  await editor.press("Control+s");
  await expect(heading).toHaveText("Исправлено");
  await page.getByText("Собранный HTML",{exact:true}).click();
  await expect(page.locator(".preview-card pre")).toContainText("<h1>Исправлено</h1>");
});

test("inline-обработчик доступен без JS-ячейки, ошибка выполнения видна в журнале",async ({page})=>{
  const editor=page.locator("#cell-heading .cm-content");
  await editor.fill('<button onclick="this.textContent=\'Готово\'">Проверить</button>');
  await editor.press("Control+s");
  const button=page.frameLocator(frame).getByRole("button",{name:"Проверить"});
  await button.click();
  await expect(page.frameLocator(frame).getByRole("button",{name:"Готово"})).toBeVisible();
  const js=page.locator("#cell-script");
  await js.locator(".cm-content").fill('console.log("Начало");\nthrow new Error("Пример ошибки");');
  await js.locator(".activity").click();
  await expect(page.locator(".run-output")).toContainText("Начало");
  const entry=page.locator(".run-output li").filter({hasText:"Пример ошибки"});
  await expect(entry).toContainText("Сценарий палитры · строка 2");
  await entry.getByRole("button").click();
  await expect(js.locator(".cm-content")).toBeFocused();
});
