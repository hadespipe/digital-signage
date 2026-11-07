import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("preview uses real decoded images, advances and survives failures", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("link", { name: "Preview display" }),
  ).toBeVisible();
  const session = await (await context.request.get("/api/auth/session")).json();
  const headers = {
    "X-CSRF-Token": session.csrfToken,
    Origin: "http://127.0.0.1:3187",
  };
  const current = await (await context.request.get("/api/playlist")).json();
  for (const image of current.images)
    expect((await context.request.delete(image.path, { headers })).ok()).toBe(
      true,
    );
  await page.getByRole("link", { name: "Preview display" }).click();
  await expect(page.getByText("Please upload", { exact: true })).toBeVisible();
  const buffers = await Promise.all(
    ["red", "blue"].map((background) =>
      sharp({ create: { width: 20, height: 10, channels: 3, background } })
        .png()
        .toBuffer(),
    ),
  );
  for (const [i, buffer] of buffers.entries())
    expect(
      (
        await context.request.post("/api/images", {
          headers,
          multipart: {
            images: { name: i + ".png", mimeType: "image/png", buffer },
          },
        })
      ).ok(),
    ).toBe(true);
  const image = page.getByRole("img", { name: "Display image" });
  await expect(image).toBeVisible({ timeout: 10000 });
  const first = await image.getAttribute("src");
  expect(first).toMatch(/^blob:/);
  await expect(image).not.toHaveAttribute("src", first!, { timeout: 4000 });
  await page.route("**/api/playlist", (route) => route.abort());
  await page.waitForTimeout(5500);
  await expect(image).toBeVisible();
  await page.screenshot({ path: "test-results/preview.png" });
  await page.unroute("**/api/playlist");
  // A successful manifest with corrupt image bytes must preserve the old decoded set.
  await page.route("**/api/playlist", (route) =>
    route.fulfill({
      json: {
        version: 999,
        images: [{ id: "corrupt", path: "/api/images/corrupt" }],
      },
    }),
  );
  await page.route("**/api/images/corrupt", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: "not an image" }),
  );
  await page.waitForTimeout(5500);
  await expect(image).toBeVisible();
  await expect(page.getByText("Please upload", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to editor" }).click();
  await expect(
    page.getByRole("heading", { name: "Image library" }),
  ).toBeVisible();
});
test("initial connection failure is distinct from confirmed empty", async ({
  page,
}) => {
  await page.route("**/api/playlist", (route) => route.abort());
  await page.goto("/preview");
  await expect(page.getByRole("alert")).toContainText("Could not connect");
  await expect(page.getByText("Please upload", { exact: true })).toHaveCount(0);
});
