import { test, expect } from "@playwright/test";
const tv = "http://127.0.0.1:3188";
test.beforeEach(async ({ request }) => {
  await request.post("/api/auth/login", {
    headers: { Origin: "http://127.0.0.1:3187" },
    data: { password: "test-password" },
  });
  const session = await (await request.get("/api/auth/session")).json();
  const playlist = await (await request.get("/api/playlist")).json();
  for (const image of playlist.images)
    await request.delete(image.path, {
      headers: {
        Origin: "http://127.0.0.1:3187",
        "X-CSRF-Token": session.csrfToken,
      },
    });
});
async function setup(
  page: import("@playwright/test").Page,
  token = "tv-e2e-token",
) {
  await page.goto(tv);
  await page.getByLabel("Server URL").fill("http://127.0.0.1:3187");
  await page.getByLabel("TV token").fill(token);
  await page.getByLabel("Allow HTTP for LAN testing only").check();
  await page.getByRole("button", { name: "Save and play" }).click();
}
test("remote navigation, persisted settings and long OK/Back", async ({
  page,
}) => {
  await page.goto(tv);
  await expect(page.getByLabel("Server URL")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("TV token")).toBeFocused();
  await page.getByLabel("Server URL").fill("http://127.0.0.1:3187");
  await page.getByLabel("TV token").fill("tv-e2e-token");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Allow HTTP for LAN testing only"),
  ).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Please upload", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.getByText("Please upload", { exact: true })).toBeVisible();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(1600);
  await page.keyboard.up("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("TV token")).toHaveAttribute("type", "password");
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { keyCode: 461, bubbles: true }),
    ),
  );
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("TV token")).not.toBeFocused();
});
test("invalid URL, production HTTP and rejected token recover in settings", async ({
  page,
}) => {
  await page.goto(tv);
  await page.getByLabel("Server URL").fill("nonsense");
  await page.getByLabel("TV token").fill("secret-rejected");
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect(page.getByRole("alert")).toContainText("valid");
  await page.getByLabel("Server URL").fill("http://127.0.0.1:3187");
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect(page.getByRole("alert")).toContainText("HTTPS");
  await page.getByLabel("Allow HTTP for LAN testing only").check();
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "connection and TV token",
  );
  await expect(page.getByRole("alert")).not.toContainText("secret-rejected");
  await page.getByLabel("TV token").fill("tv-e2e-token");
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
test("storage failures are recoverable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw Error("private");
    };
  });
  await setup(page);
  await expect(page.getByRole("alert")).toContainText("storage");
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("committed settings stop pending old downloads", async ({ page }) => {
  await setup(page);
  await page.route("**/api/playlist", (route) =>
    route.fulfill({
      json: {
        version: 50,
        images: [{ id: "pending", path: "/api/images/pending" }],
      },
    }),
  );
  let requested = false,
    aborted = false;
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/images/pending")) aborted = true;
  });
  await page.route("**/api/images/pending", async (route) => {
    requested = true;
    return;
  });
  await expect.poll(() => requested, { timeout: 8000 }).toBe(true);
  await page.keyboard.down("Enter");
  await page.waitForTimeout(1600);
  await page.keyboard.up("Enter");
  let candidateRequested = false;
  let releaseCandidate!: () => void;
  const candidateReady = new Promise<void>((resolve) => {
    releaseCandidate = resolve;
  });
  await page.route("**/api/playlist", async (route) => {
    if (
      route.request().headers().authorization === "Bearer replacement-token"
    ) {
      candidateRequested = true;
      await candidateReady;
      return route.fulfill({ json: { version: 51, images: [] } });
    }
    return route.fulfill({
      json: {
        version: 50,
        images: [{ id: "pending", path: "/api/images/pending" }],
      },
    });
  });
  expect(aborted).toBe(false);
  await page.getByLabel("TV token").fill("replacement-token");
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect.poll(() => candidateRequested).toBe(true);
  expect(aborted).toBe(false);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("digital-signage-settings")!).token,
    ),
  ).toBe("tv-e2e-token");
  releaseCandidate();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect.poll(() => aborted, { timeout: 1000 }).toBe(true);
  await expect(page.getByRole("img")).toBeHidden();
});

test("rejected saved credentials reopen recoverable settings on initial load", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "digital-signage-settings",
      JSON.stringify({
        serverUrl: "http://127.0.0.1:3187",
        token: "invalid-saved-token",
        allowLanHttp: true,
      }),
    ),
  );
  await page.goto(tv);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "connection and TV token",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "invalid-saved-token",
  );
});
async function openSettings(page: import("@playwright/test").Page) {
  await page.keyboard.down("Enter");
  await page.waitForTimeout(1600);
  await page.keyboard.up("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function remoteBack(page: import("@playwright/test").Page) {
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { keyCode: 461, bubbles: true }),
    ),
  );
}
for (const failure of ["token", "storage"])
  test(`Back restores configured playback after ${failure} failure`, async ({
    page,
  }) => {
    await setup(page);
    await expect(
      page.getByText("Please upload", { exact: true }),
    ).toBeVisible();
    await openSettings(page);
    if (failure === "token") await page.getByLabel("TV token").fill("wrong");
    else
      await page.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw Error("storage");
        };
      });
    await page.getByRole("button", { name: "Save and play" }).click();
    await expect(page.getByRole("alert")).toContainText(
      failure === "token" ? "connection and TV token" : "storage",
    );
    await remoteBack(page);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByText("Please upload", { exact: true }),
    ).toBeVisible();
  });
test("Back cancels pending validation and keeps original settings", async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByText("Please upload", { exact: true })).toBeVisible();
  await openSettings(page);
  let pending = false;
  await page.route("**/api/playlist", (route) => {
    if (route.request().headers().authorization === "Bearer pending-token") {
      pending = true;
      return;
    }
    return route.continue();
  });
  await page.getByLabel("TV token").fill("pending-token");
  const canceled = page.waitForEvent("requestfailed", {
    predicate: (req) => req.headers().authorization === "Bearer pending-token",
    timeout: 2000,
  });
  await page.getByRole("button", { name: "Save and play" }).click();
  await expect.poll(() => pending).toBe(true);
  await remoteBack(page);
  await canceled;
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("digital-signage-settings")!).token,
    ),
  ).toBe("tv-e2e-token");
});
test("successful settings save returns to root history before platform Back", async ({
  page,
}) => {
  await page.goto(tv + "/icon.png");
  await setup(page);
  await expect(page.getByRole("dialog")).toBeHidden();
  for (let i = 0; i < 2; i++) {
    await openSettings(page);
    await page.getByRole("button", { name: "Save and play" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  }
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(tv + "/icon.png");
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function savedSettings(page: import("@playwright/test").Page) {
  await page.addInitScript(() =>
    localStorage.setItem(
      "digital-signage-settings",
      JSON.stringify({
        serverUrl: "http://127.0.0.1:3187",
        token: "tv-e2e-token",
        allowLanHttp: true,
      }),
    ),
  );
}
for (const candidate of ["unchanged", "failed"])
  test(`offline loaded image survives Back from ${candidate} settings`, async ({
    page,
  }) => {
    let offline = false;
    await page.route("**/api/playlist", (route) =>
      offline
        ? route.abort()
        : route.fulfill({
            json: {
              version: 1,
              images: [{ id: "real", path: "/api/images/real" }],
            },
          }),
    );
    await page.route("**/api/images/real", (route) =>
      route.fulfill({ contentType: "image/png", body: png }),
    );
    await savedSettings(page);
    await page.goto(tv);
    await expect(page.locator("#display")).toBeVisible();
    expect(
      await page
        .locator("#display")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(1);
    const original = await page.locator("#display").getAttribute("src");
    offline = true;
    await openSettings(page);
    if (candidate === "failed") {
      await page.getByLabel("TV token").fill("wrong");
      await page.getByRole("button", { name: "Save and play" }).click();
      await expect(page.getByRole("alert")).toContainText(
        "connection and TV token",
      );
    }
    await remoteBack(page);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#display")).toBeVisible();
    await expect(page.locator("#display")).toHaveAttribute("src", original!);
  });
for (const content of ["image", "empty", "editing"])
  test(`startup outage recovers unobscured ${content}`, async ({ page }) => {
    let offline = true;
    await page.route("**/api/playlist", (route) =>
      offline
        ? route.abort()
        : route.fulfill({
            json: {
              version: 1,
              images:
                content === "empty"
                  ? []
                  : [{ id: "real", path: "/api/images/real" }],
            },
          }),
    );
    await page.route("**/api/images/real", (route) =>
      route.fulfill({ contentType: "image/png", body: png }),
    );
    await savedSettings(page);
    await page.goto(tv);
    await expect(page.getByRole("alert")).toContainText(
      "connection and TV token",
    );
    if (content === "editing")
      await page.getByLabel("TV token").fill("editing-token");
    offline = false;
    if (content === "empty")
      await expect(page.locator("#status")).toHaveText("Please upload", {
        timeout: 8000,
      });
    else await expect(page.locator("#display")).toBeVisible({ timeout: 8000 });
    if (content === "editing") {
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabel("TV token")).toHaveValue("editing-token");
    } else {
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
    }
  });
