import { expect, test } from "@playwright/test";

test.use({ viewport:{width:1440,height:1000}, channel:process.env.PLAYWRIGHT_CHANNEL });
test.beforeEach(async ({page})=>{
  await page.route("**/api/health/ready",route=>route.fulfill({json:{status:"ready"}}));
  await page.goto("/");
  await expect(page.locator("#cell-heading .cm-content")).toBeVisible();
});

test("выбор диапазона, группировка через ПКМ, отмена",async ({page})=>{
  const sage=page.locator("#cell-sage .language"), clay=page.locator("#cell-clay .language");
  await sage.dblclick();
  await expect(page.getByRole("button",{name:"Сгруппировать",exact:true})).toBeDisabled();
  await clay.click({modifiers:["Shift"]});
  await expect(page.locator(".selection-count")).toContainText("2");
  await clay.click({button:"right"});
  await page.getByRole("menuitem",{name:/Сгруппировать выбранные/}).click();
  await expect(page.locator("#cell-palette .group-children .group-children > .cell")).toHaveCount(2);
  await page.getByRole("button",{name:"Отменить операцию"}).click();
  await expect(page.locator("#cell-palette > .group-children > .cell")).toHaveCount(3);
});

test("перетаскивание между соседями меняет их порядок",async ({page})=>{
  const siblings=page.locator("#cell-palette > .group-children > .cell");
  await page.locator("#cell-clay .language").dragTo(page.locator("#cell-sage .language"));
  await expect(siblings.first()).toHaveAttribute("id","cell-clay");
});

test("клавиатура Markdown и создание программного блока",async ({page})=>{
  const note=page.locator("#cell-note");
  await note.press("Enter");
  const editor=note.locator(".cm-content");
  await expect(editor).toBeFocused();
  await editor.fill("## Новая заметка");
  await editor.press("Shift+Enter");
  await expect(note.locator("h2")).toHaveText("Новая заметка");
  await expect(page.locator("#cell-heading")).toBeFocused();
  await page.getByRole("button",{name:"Добавить ячейку"}).click();
  await page.getByRole("menuitem",{name:"JavaScript"}).click();
  await expect(page.locator(".cell-list > .cell").nth(2)).toHaveAttribute("data-kind","JavaScript");
});

test("диагностика раскрывает группу и переводит курсор на ошибочную строку",async ({page})=>{
  const editor=page.locator("#cell-sage .cm-content");
  await editor.fill('<article>\n<button onclick="const = ;">OK</button>\n</article>');
  const link=page.getByRole("button",{name:"«Шалфей» (HTML), строка 2"});
  await expect(link).toBeVisible();
  await page.getByRole("button",{name:"Свернуть группу"}).click();
  await link.click();
  await expect(editor).toBeFocused();
  expect(await editor.evaluate(el=>el.querySelectorAll(".cm-line")[1]?.contains(getSelection()?.anchorNode ?? null))).toBe(true);
  await page.getByRole("checkbox",{name:"Активность · Палитра"}).click();
  await expect(link).toHaveCount(0);
  await page.getByRole("checkbox",{name:"Активность · Палитра"}).click();
  await expect(link).toBeVisible();
  await editor.fill("<article>Исправлено</article>");
  await expect(link).toHaveCount(0);
});

test("браузер различает неверные CSS-значения, свойства и валидный var()",async ({page})=>{
  const editor=page.locator("#cell-styles .cm-content");
  await editor.fill("a {\ncolor: 17px;\nunknown-property: blue;\n}");
  await expect(page.locator(".diagnostics li")).toHaveCount(2);
  await editor.fill("a { color:var(tone) }");
  await expect(page.locator(".diagnostics")).toContainText("В var()");
  await editor.fill("a { --ink: blue; color: var(--ink); }");
  await expect(page.locator(".diagnostics")).toHaveCount(0);
});

test("редактирование обёртки требует совпадающую пару тегов",async ({page})=>{
  const palette=page.locator("#cell-palette");
  await palette.getByRole("button",{name:"Изменить",exact:true}).click();
  const editor=palette.locator(".wrapper-edit .cm-content");
  await editor.fill('<article class="cards">\n</section>');
  const apply=palette.getByRole("button",{name:"Применить"});
  await expect(apply).toBeDisabled();
  await expect(page.locator(".diagnostics")).toContainText("строка 2");
  await editor.fill('<article class="cards">\n</article>');
  await apply.click();
  await expect(palette.locator(".group-tag code")).toHaveText('<article class="cards">');
  await expect(palette.locator(":scope > .group-children > .cell")).toHaveCount(3);
});
