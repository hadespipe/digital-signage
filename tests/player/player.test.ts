import { test, expect } from "bun:test";
import "../../tv/player.js";
const S = (globalThis as any).Signage;
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup(images: string[] = []) {
  let now = 0,
    next = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    setTimeout(fn: () => void, ms: number) {
      timers.set(++next, { at: now + ms, fn });
      return next;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  };
  let manifest: any = {
    version: 1,
    images: images.map((id) => ({ id, path: "/api/images/" + id })),
  };
  let polls = 0;
  const shown: string[] = [];
  const events: any[] = [];
  let visible: string[] = [];
  const released: string[] = [];
  let errors = 0;
  let loader = (path: string): Promise<any> =>
    Promise.resolve({ url: path, release: () => {
      expect(visible).not.toContain(path);
      released.push(path);
    } });
  const player = S.createPlayer({
    clock,
    transport: {
      getPlaylist: () => {
        polls++;
        return Promise.resolve(manifest);
      },
      loadImage: (path: string) => loader(path),
    },
    view: {
      showImage: (url: string) => { visible = [url]; shown.push(url); events.push([now, "show", url]); },
      beginTransition: (url: string, ms: number) => { visible.push(url); events.push([now, "fade", url, ms]); },
      clear: () => { visible = []; events.push([now, "clear"]); },
      showEmpty: () => shown.push("empty"),
      showError: () => errors++,
    },
  });
  async function advance(ms: number) {
    const end = now + ms;
    while (true) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      now = entry[1].at;
      timers.delete(entry[0]);
      entry[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }
  return {
    player,
    shown,
    events,
    released,
    advance,
    set: (value: any) => (manifest = value),
    load: (fn: typeof loader) => (loader = fn),
    polls: () => polls,
    errors: () => errors,
    timers,
  };
}
test("confirmed empty and one image remain stable", async () => {
  const h = setup();
  h.player.start();
  await flush();
  expect(h.shown).toEqual(["empty"]);
  h.set({ version: 2, images: [{ id: "a", path: "/api/images/a" }] });
  await h.advance(5000);
  await h.advance(6000);
  expect(h.shown).toEqual(["empty", "/api/images/a"]);
  h.player.stop();
  expect(h.released).toEqual(["/api/images/a"]);
});
test("five images advance every 2 seconds and poll independently", async () => {
  const h = setup(["a", "b", "c", "d", "e"]);
  h.player.start();
  await flush();
  await h.advance(10000);
  expect(h.shown).toEqual(
    ["a", "b", "c", "d", "e", "a"].map((x) => "/api/images/" + x),
  );
  expect(h.polls()).toBe(3);
  h.player.stop();
  expect(h.released.length).toBe(5);
});
test("complete swap, failed partial cleanup, malformed and stale work", async () => {
  const h = setup(["a"]);
  h.player.start();
  await flush();
  let resolve: any;
  h.load((path) =>
    path.endsWith("c")
      ? new Promise((r) => (resolve = r))
      : Promise.resolve({ url: path, release: () => h.released.push(path) }),
  );
  h.set({
    version: 2,
    images: [
      { id: "b", path: "/api/images/b" },
      { id: "c", path: "/api/images/c" },
    ],
  });
  await h.advance(5000);
  expect(h.shown.at(-1)).toBe("/api/images/a");
  h.set({ version: 3, images: [] });
  await h.advance(5000);
  expect(h.shown.at(-1)).toBe("empty");
  resolve({ url: "c", release: () => h.released.push("c") });
  await flush();
  expect(h.shown.at(-1)).toBe("empty");
  expect(h.released).toContain("/api/images/b");
  expect(h.released).toContain("c");
  h.set({ version: 4, images: [{ id: "x", path: "https://bad/x" }] });
  await h.advance(5000);
  expect(h.shown.at(-1)).toBe("empty");
  h.player.stop();
  expect(h.timers.size).toBe(0);
});
test("failure keeps old set and releases successes even after rejection", async () => {
  const h = setup(["a"]);
  h.player.start();
  await flush();
  h.load((path) =>
    path.endsWith("c")
      ? Promise.reject(new Error("404"))
      : Promise.resolve({ url: path, release: () => h.released.push(path) }),
  );
  h.set({
    version: 2,
    images: [
      { id: "c", path: "/api/images/c" },
      { id: "b", path: "/api/images/b" },
    ],
  });
  await h.advance(5000);
  expect(h.shown.at(-1)).toBe("/api/images/a");
  expect(h.released).toContain("/api/images/b");
  h.player.stop();
});
test("slow images time out, release late results and retry", async () => {
  const h = setup(["a"]);
  h.player.start();
  await flush();
  let resolve: any;
  h.load(() => new Promise((r) => (resolve = r)));
  h.set({ version: 2, images: [{ id: "b", path: "/api/images/b" }] });
  await h.advance(9500);
  resolve({ url: "late", release: () => h.released.push("late") });
  await flush();
  expect(h.shown.at(-1)).toBe("/api/images/a");
  expect(h.released).toContain("late");
  h.player.stop();
  expect(h.timers.size).toBe(0);
});
test("stop discards pending resources exactly once", async () => {
  const h = setup(["a"]);
  let resolve: any;
  h.load(() => new Promise((r) => (resolve = r)));
  h.player.start();
  await flush();
  h.player.stop();
  resolve({ url: "late", release: () => h.released.push("late") });
  await flush();
  h.player.stop();
  expect(h.released).toEqual(["late"]);
  expect(h.shown).toEqual([]);
  expect(h.timers.size).toBe(0);
});
test("malformed and over-capacity manifests preserve active playback", async () => {
  const h = setup(["a"]);
  h.player.start();
  await flush();
  for (const manifest of [
    { images: [] },
    {
      version: 2,
      images: Array.from({ length: 6 }, (_, i) => ({
        id: String(i),
        path: "/api/images/" + i,
      })),
    },
  ]) {
    h.set(manifest);
    await h.advance(5000);
    expect(h.shown).toEqual(["/api/images/a"]);
  }
  h.player.stop();
});
test("poll timeout aborts before retry without overlapping live requests", async () => {
  let live = 0,
    max = 0,
    calls = 0;
  let now = 0,
    id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock = {
    setTimeout(fn: () => void, ms: number) {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  };
  const player = S.createPlayer({
    clock,
    transport: {
      getPlaylist(signal: AbortSignal) {
        calls++;
        live++;
        max = Math.max(max, live);
        return new Promise((_r, reject) =>
          signal.addEventListener("abort", () => {
            live--;
            reject(new Error("aborted"));
          }),
        );
      },
      loadImage() {
        throw Error("unused");
      },
    },
    view: { showImage() {}, beginTransition() {}, clear() {}, showEmpty() {}, showError() {} },
  });
  player.start();
  for (const end of [4500, 5000, 9500, 10000]) {
    while (true) {
      const e = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!e || e[1].at > end) break;
      now = e[1].at;
      timers.delete(e[0]);
      e[1].fn();
      await flush();
    }
    now = end;
  }
  expect(calls).toBe(3);
  expect(max).toBe(1);
  player.stop();
  expect(live).toBe(0);
  expect(timers.size).toBe(0);
});

test("new complete set activates in manifest order only when every image is ready", async () => {
  const h = setup(["a"]);
  h.player.start();
  await flush();
  let finish: any;
  h.load((path) =>
    path.endsWith("b")
      ? new Promise((r) => (finish = r))
      : Promise.resolve({ url: path, release: () => h.released.push(path) }),
  );
  h.set({
    version: 2,
    images: [
      { id: "b", path: "/api/images/b" },
      { id: "c", path: "/api/images/c" },
    ],
  });
  await h.advance(5000);
  expect(h.shown).toEqual(["/api/images/a"]);
  expect(h.released).toEqual([]);
  finish({
    url: "/api/images/b",
    release: () => h.released.push("/api/images/b"),
  });
  await flush();
  expect(h.shown.at(-1)).toBe("/api/images/b");
  expect(h.released).toEqual(["/api/images/a"]);
  await h.advance(2000);
  expect(h.shown.at(-1)).toBe("/api/images/c");
  h.player.stop();
});

test("restarting immediately after stop begins a fresh poll", async () => {
  const h = setup(["a"]);
  h.player.start();
  h.player.stop();
  h.player.start();
  await flush();
  expect(h.polls()).toBe(2);
  expect(h.shown).toEqual(["/api/images/a"]);
  h.player.stop();
});


test("crossfade stays inside the two-second cycle", async () => {
  const h = setup(["a", "b"]);
  h.player.start();
  await flush();
  await h.advance(4000);
  expect(h.events.filter(e => e[1] !== "clear")).toEqual([
    [0, "show", "/api/images/a"],
    [1700, "fade", "/api/images/b", 300],
    [2000, "show", "/api/images/b"],
    [3700, "fade", "/api/images/a", 300],
    [4000, "show", "/api/images/a"],
  ]);
  h.player.stop();
});
test("one image never fades and stop during fade cannot commit stale work", async () => {
  const one = setup(["a"]);
  one.player.start(); await flush(); await one.advance(10000);
  expect(one.events.filter(e => e[1] === "fade")).toEqual([]);
  one.player.stop();
  const h = setup(["a", "b"]);
  h.player.start(); await flush(); await h.advance(1850);
  expect(h.events.at(-1)).toEqual([1700, "fade", "/api/images/b", 300]);
  h.player.stop();
  expect(h.timers.size).toBe(0);
  h.player.start(); await flush(); await h.advance(150);
  expect(h.shown).toEqual(["/api/images/a", "/api/images/a"]);
  h.player.stop();
});
for (const ids of [[], ["c", "d"]]) test(`activation during fade resets layers and cycle: ${ids}`, async () => {
  const h = setup(["a", "b"]);
  let ready!: (value: any) => void;
  h.load(path => new Promise(resolve => {
    if (path.endsWith("a")) ready = resolve;
    else resolve({ url: path, release() {} });
  }));
  h.player.start(); await flush(); await h.advance(3200);
  ready({url: "/api/images/a", release() {}}); await flush();
  h.set({version: 2, images: ids.map(id => ({id, path: "/api/images/" + id}))});
  h.load(path => Promise.resolve({url: path, release() {}}));
  await h.advance(1800);
  expect(h.events).toContainEqual([4900, "fade", "/api/images/b", 300]);
  expect(h.events).toContainEqual([5000, "clear"]);
  expect(h.shown.at(-1)).toBe(ids.length ? "/api/images/c" : "empty");
  await h.advance(200);
  expect(h.shown).not.toContain("/api/images/b");
  await h.advance(1800);
  if (ids.length) expect(h.events.at(-1)).toEqual([7000, "show", "/api/images/d"]);
  else expect(h.events.filter(e => e[1] === "fade")).toHaveLength(1);
  h.player.stop();
});
