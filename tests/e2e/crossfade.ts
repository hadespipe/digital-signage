import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";

export async function openSlides(page: Page, target: "tv" | "preview") {
  const buffers = await Promise.all(["red", "blue"].map(background =>
    sharp({create: {width: 40, height: 20, channels: 3, background}}).png().toBuffer()));
  await page.route("**/api/playlist", route => route.fulfill({json: {
    version: 700, images: ["red", "blue"].map(id => ({id, path: "/api/images/" + id})),
  }}));
  await page.route("**/api/images/*", route => route.fulfill({contentType: "image/png",
    body: buffers[route.request().url().endsWith("red") ? 0 : 1]}));
  if (target === "preview") await page.goto("/preview");
  else {
    await page.goto("http://127.0.0.1:3188");
    await page.getByLabel("Server URL").fill("http://127.0.0.1:3187");
    await page.getByLabel("TV token").fill("tv-e2e-token");
    await page.getByLabel("Allow HTTP for LAN testing only").check();
    await page.getByRole("button", {name: "Save and play"}).click();
  }
  await expect(page.getByRole("img", {name: "Display image", exact: true})).toBeVisible();
}

export async function midFade(page: Page) {
  return page.evaluate(() => new Promise<{base: string; incoming: string; opacity: number}>(
    (resolve, reject) => {
      const deadline = performance.now() + 4500;
      function sample() {
        const base = document.querySelector<HTMLImageElement>('[data-slide="base"]');
        const incoming = document.querySelector<HTMLImageElement>('[data-slide="incoming"]');
        const opacity = incoming ? Number(getComputedStyle(incoming).opacity) : 0;
        if (base && incoming && !incoming.hidden && opacity > 0.2 && opacity < 0.8) {
          if (Number(getComputedStyle(base).opacity) !== 1 || !base.naturalWidth || !incoming.naturalWidth)
            return reject(Error("Fade exposed a nonopaque/undecoded base"));
          const a = base.getBoundingClientRect(), b = incoming.getBoundingClientRect();
          if (a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height)
            return reject(Error("Fade layers do not overlap"));
          if (getComputedStyle(incoming).transitionDuration !== "0.3s" ||
              getComputedStyle(incoming).transitionTimingFunction !== "linear")
            return reject(Error("Expected a linear 300ms fade"));
          resolve({base: base.src, incoming: incoming.src, opacity});
        } else if (performance.now() > deadline) reject(Error("No intermediate crossfade frame"));
        else requestAnimationFrame(sample);
      }
      sample();
    }));
}

export function crossfadeTests(target: "tv" | "preview") {
  test(`${target} crossfades decoded layers and wraps without new requests`, async ({page}) => {
    let imageRequests = 0;
    page.on("request", request => {if (request.url().includes("/api/images/")) imageRequests++;});
    await openSlides(page, target);
    const first = await page.getByRole("img", {name: "Display image", exact: true}).getAttribute("src");
    const forward = await midFade(page);
    expect(forward.base).toBe(first);
    await expect(page.getByRole("img", {name: "Display image", exact: true})).toHaveAttribute("src", forward.incoming);
    const wrap = await midFade(page);
    expect(wrap.incoming).toBe(first);
    await expect(page.getByRole("img", {name: "Display image", exact: true})).toHaveAttribute("src", first!);
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    expect(imageRequests).toBe(2);
  });

  test(`${target} reduced motion cuts on the boundary and preference changes cancel fade`, async ({page}) => {
    await page.emulateMedia({reducedMotion: "reduce"});
    await openSlides(page, target);
    const image = page.getByRole("img", {name: "Display image", exact: true});
    const first = await image.getAttribute("src");
    await page.waitForTimeout(1800);
    await expect(image).toHaveAttribute("src", first!);
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    await expect(image).not.toHaveAttribute("src", first!);
    await page.emulateMedia({reducedMotion: "no-preference"});
    const fade = await midFade(page);
    await page.emulateMedia({reducedMotion: "reduce"});
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    await expect(image).toHaveAttribute("src", fade.incoming);
  });

  test(`${target} late readiness cannot resurrect a cleared incoming layer`, async ({page}) => {
    await openSlides(page, target);
    await page.evaluate(() => {
      const incoming = document.querySelector('[data-slide="incoming"]')!;
      Object.defineProperty(incoming, "complete", {configurable: true, get: () => false});
      Object.defineProperty(incoming, "onload", {
        configurable: true,
        get() {return null;},
        set(callback) {if (callback) (window as any).lateReady = callback;},
      });
    });
    const image = page.getByRole("img", {name: "Display image", exact: true});
    const first = await image.getAttribute("src");
    await page.waitForTimeout(1800);
    await expect(image).toHaveAttribute("src", first!);
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    await expect(image).not.toHaveAttribute("src", first!);
    await page.evaluate(() => {
      if (typeof (window as any).lateReady !== "function") throw Error("Readiness callback was not captured");
      (window as any).lateReady();
    });
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    await expect(image).toBeVisible();
  });
}
