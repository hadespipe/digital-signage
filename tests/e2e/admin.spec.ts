import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("complete admin management journey", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("0 / 5")).toBeVisible();
  const buffer = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "#ffcc88" },
  })
    .png()
    .toBuffer();
  const file = {
    name: "<img src=x onerror=alert(1)>.png",
    mimeType: "image/png",
    buffer,
  };
  await page.getByLabel("Choose images").setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      ...file,
      name: `${i}${file.name}`,
    })),
  );
  await expect(page.getByText(`0${file.name}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Upload images" }).click();
  await expect(page.getByText("5 / 5")).toBeVisible();
  await page.getByLabel("Choose images").setInputFiles(file);
  await page.getByRole("button", { name: "Upload images" }).click();
  await expect(page.getByRole("alert")).toContainText("five");
  await page.screenshot({
    path: "test-results/admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/admin-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const first = await page.locator("article").first().getAttribute("data-id");
  await page.getByRole("button", { name: "Move image 1 down" }).click();
  await expect(page.locator("article").nth(1)).toHaveAttribute(
    "data-id",
    first!,
  );
  await page.getByRole("button", { name: "Move image 2 up" }).click();
  await expect(page.locator("article").first()).toHaveAttribute(
    "data-id",
    first!,
  );
  await page.route("**/api/playlist/order", (route) =>
    route.fulfill({ status: 409, json: { error: { message: "Conflict" } } }),
  );
  await page.getByRole("button", { name: "Move image 1 down" }).click();
  await expect(page.getByRole("alert")).toContainText("playlist changed");
  await expect(page.locator("article").first()).toHaveAttribute(
    "data-id",
    first!,
  );
  await page.unroute("**/api/playlist/order");
  await page.route("**/api/images/*", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 500, json: { error: { message: "Failed" } } })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Delete image 1", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.getByText("5 / 5")).toBeVisible();
  await page.unroute("**/api/images/*");
  await page
    .getByRole("button", { name: "Delete image 1", exact: true })
    .click();
  await expect(page.getByText("4 / 5")).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("4 / 5")).toBeVisible();
  await page.context().clearCookies();
  await page
    .getByRole("button", { name: "Delete image 1", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("session ended");
});
test("static serving preserves API precedence and unknown API 404", async ({
  request,
}) => {
  expect(
    (await request.get("/api/health")).headers()["content-type"],
  ).toContain("application/json");
  const missing = await request.get("/api/not-real");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain("<!doctype html>");
});
