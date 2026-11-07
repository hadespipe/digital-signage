import { test, expect, type Page, type Route } from "@playwright/test";
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

async function watchReleases(page: Page) {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    (window as any).releaseViolations = [];
    (window as any).releasedImages = [];
    URL.revokeObjectURL = url => {
      if ([...document.querySelectorAll("img")].some(image => image.getAttribute("src") === url))
        (window as any).releaseViolations.push(url);
      (window as any).releasedImages.push(url);
      revoke(url);
    };
  });
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

  test(`${target} mixed-aspect letterboxes fade to black instead of cutting`, async ({page}) => {
    await openSlides(page, target);
    const sources = await Promise.all([
      {width: 160, height: 90, background: "red"},
      {width: 90, height: 160, background: "blue"},
    ].map(async dimensions => "data:image/png;base64," +
      (await sharp({create: {...dimensions, channels: 3}}).png().toBuffer()).toString("base64")));
    // An isolated renderer uses the shipped CSS; pause only its CSS animation for pixel sampling.
    await page.evaluate(async ({sources, target}) => {
      const container = document.createElement(target === "tv" ? "main" : "div");
      container.id = "mixed-aspect";
      if (target === "preview") container.className = "preview";
      Object.assign(container.style, {position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh", zIndex: "10"});
      const base = document.createElement("img"), incoming = document.createElement("img");
      base.className = incoming.className = "slide-image";
      base.hidden = incoming.hidden = true;
      container.append(base, incoming);
      document.body.append(container);
      const renderer = Signage.createImageView(base, incoming);
      await new Promise<void>(resolve => {base.onload = () => resolve(); renderer.showImage(sources[0]);});
      renderer.beginTransition(sources[1], 300);
      (window as any).mixedRenderer = renderer;
    }, {sources, target});
    const incoming = page.locator('#mixed-aspect [data-slide="incoming"]');
    await expect.poll(() => incoming.evaluate(node => node.getAnimations().length)).toBe(1);
    await incoming.evaluate(node => {
      const animation = node.getAnimations()[0];
      animation.pause();
      animation.currentTime = 150;
    });
    const screenshot = await page.locator("#mixed-aspect").screenshot();
    const {data, info} = await sharp(screenshot).removeAlpha().raw().toBuffer({resolveWithObject: true});
    const offset = (Math.floor(info.height / 2) * info.width + 2) * info.channels;
    expect(data[offset]).toBeGreaterThan(90);
    expect(data[offset]).toBeLessThan(170);
    expect(data[offset + 1]).toBe(0);
    expect(data[offset + 2]).toBe(0);
    await page.evaluate(() => (window as any).mixedRenderer.dispose());
  });

  for (const replacement of ["empty", "new"]) test(`${target} ${replacement} playlist interrupts an active fade safely`, async ({page}) => {
    await watchReleases(page);
    await openSlides(page, target);
    let pending: Route | undefined;
    await page.route("**/api/playlist", route => {pending = route;});
    await expect.poll(() => Boolean(pending), {timeout: 6500}).toBe(true);
    const fade = await midFade(page);
    await pending!.fulfill({json: {version: 701, images: replacement === "empty" ? [] : [
      {id: "new", path: "/api/images/new"},
    ]}});
    if (replacement === "empty") await expect(page.getByText("Please upload", {exact: true})).toBeVisible();
    else await expect(page.getByRole("img", {name: "Display image", exact: true}))
      .not.toHaveAttribute("src", fade.base);
    await page.waitForTimeout(450);
    await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
    if (replacement === "empty") {
      await expect(page.locator('[data-slide="base"]')).toBeHidden();
      await expect(page.getByText("Please upload", {exact: true})).toBeVisible();
    } else {
      const current = await page.getByRole("img", {name: "Display image", exact: true}).getAttribute("src");
      expect(current).not.toBe(fade.base);
      expect(current).not.toBe(fade.incoming);
    }
    expect(await page.evaluate(() => (window as any).releasedImages.length)).toBe(2);
    expect(await page.evaluate(() => (window as any).releaseViolations)).toEqual([]);
  });

  test(`${target} leaving playback during fade cannot restore old images`, async ({page}) => {
    await watchReleases(page);
    await openSlides(page, target);
    if (target === "tv") {
      await page.keyboard.down("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.up("Enter");
    }
    const fade = await midFade(page);
    if (target === "preview") {
      await page.getByRole("link", {name: "Back to editor"}).click();
      await expect(page).toHaveURL("http://127.0.0.1:3187/");
      await page.waitForTimeout(400);
      await expect(page.locator(".preview")).toHaveCount(0);
    } else {
      await page.getByRole("button", {name: "Save and play"}).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await page.waitForTimeout(400);
      const current = await page.getByRole("img", {name: "Display image", exact: true}).getAttribute("src");
      expect(current).not.toBe(fade.base);
      expect(current).not.toBe(fade.incoming);
      await expect(page.locator('[data-slide="incoming"]')).toBeHidden();
      expect(await page.evaluate(() => (window as any).releasedImages.length)).toBe(2);
      expect(await page.evaluate(() => (window as any).releaseViolations)).toEqual([]);
    }
  });

}
