const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const source = fs.readFileSync(
  path.join(__dirname, "../delivery-info.js"),
  "utf8",
);
async function run(t, outcomes, { sample = 0, beaconThrows = false } = {}) {
  const dom = new JSDOM(
    '<div class="_item_detail_wrap"><div class="prod-detail-section--delivery">배송</div></div>',
    {
      url: "https://nvsbf.com/shop_view?idx=2153",
      runScripts: "outside-only",
      virtualConsole: new VirtualConsole(),
    },
  );
  t.after(() => dom.window.close());
  const reports = [];
  let calls = 0;
  dom.window.Math.random = () => sample;
  dom.window.navigator.sendBeacon = (url, data) => {
    reports.push({ url, data: JSON.parse(data) });
    if (beaconThrows) throw Error("private");
    return true;
  };
  const timer = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (fn, ms) =>
    timer(fn, ms === 5000 || ms === 10000 ? 1 : ms);
  dom.window.fetch = async () => {
    const outcome = outcomes[Math.min(calls++, outcomes.length - 1)];
    if (outcome === "error") throw Error("private token and message");
    return {
      ok: true,
      headers: { get: () => String(Date.now() + 60000) },
      json: async () => [],
    };
  };
  dom.window.eval(source);
  await dom.window.__IMWEB_PRODUCT_NOTICES_V1__.rules().catch(() => {});
  return { reports, calls };
}
test("browser records cache, Google recovery and both recovery failures once without identifiers", async (t) => {
  for (const [outcomes, expected] of [
    [["ok"], "CACHE"],
    [["error", "ok"], "GOOGLE"],
    [Array(9).fill("error"), "UNAVAILABLE"],
  ]) {
    const { reports, calls } = await run(t, outcomes);
    assert.equal(calls, outcomes.length);
    assert.equal(reports.length, 1);
    assert.equal(
      reports[0].url,
      "https://imweb-notices-cache-4w4l3rcbpq-du.a.run.app/v1/delivery",
    );
    assert.deepEqual(Object.keys(reports[0].data).sort(), [
      "latencyMs",
      "outcome",
      "schema",
    ]);
    assert.equal(reports[0].data.outcome, expected);
    assert.ok(!JSON.stringify(reports).includes("2153"));
    assert.ok(!JSON.stringify(reports).includes("private"));
  }
});
test("sampling skips diagnostics and a rejected beacon does not break successful data", async (t) => {
  assert.equal((await run(t, ["ok"], { sample: 0.5 })).reports.length, 0);
  assert.equal(
    (await run(t, ["ok"], { beaconThrows: true })).reports[0].data.outcome,
    "CACHE",
  );
});

function recoveryPage(t, read) {
  const dom = new JSDOM(
    '<div class="_item_detail_wrap"><div class="prod-detail-section--delivery">배송</div></div><div id="prod_options"><label data-opttype="color" data-title="블랙"><input type="radio" checked></label><div class="_form_parent"><div class="option_title">사이즈</div><div class="form-select-wrap"><button class="dropdown-toggle">사이즈</button><div class="dropdown-menu"><div class="dropdown-item"><a class="_requireOption"><span class="margin-bottom-lg">M</span></a></div></div></div></div></div>',
    {
      url: "https://closeby2.com/shop_view?idx=1608",
      runScripts: "outside-only",
      virtualConsole: new VirtualConsole(),
    },
  );
  t.after(() => dom.window.close());
  const calls = [],
    reports = [];
  const timer = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (fn, ms) =>
    timer(
      fn,
      ms === 1800 ? 5 : ms === 250 || ms === 5000 || ms === 10000 ? 1 : ms,
    );
  dom.window.Math.random = () => 0;
  dom.window.navigator.sendBeacon = (_, data) => {
    reports.push(JSON.parse(data));
    return true;
  };
  dom.window.fetch = async (url, options) => {
    calls.push({ url, signal: options.signal });
    const rows = await read(calls.length, url, options.signal);
    return {
      ok: true,
      headers: { get: () => String(Date.now() + 60000) },
      json: async () => rows,
    };
  };
  dom.window.eval(source);
  dom.window.eval(
    fs.readFileSync(path.join(__dirname, "../reserved-shipping.js"), "utf8"),
  );
  return { w: dom.window, d: dom.window.document, calls, reports };
}
const notice = {
  enabled: true,
  domain: "closeby2.com",
  productId: "1608",
  type: "예약배송",
  color: "블랙",
  size: "M",
  message: "10/20 이후 순차 출고",
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("the shared notice read starts before late page scripts finish, while DOM initialization waits", async (t) => {
  const dom = new JSDOM("", {
    url: "https://armykaji.com/shop_view/?idx=2153",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const callbacks = [];
  let ready = false,
    reads = 0,
    initialized = false;
  Object.defineProperty(dom.window.document, "readyState", {
    get: () => (ready ? "interactive" : "loading"),
  });
  const listen = dom.window.document.addEventListener.bind(dom.window.document);
  dom.window.document.addEventListener = (name, fn, ...rest) => {
    if (name === "DOMContentLoaded") callbacks.push(fn);
    else listen(name, fn, ...rest);
  };
  dom.window.fetch = async () => {
    reads++;
    return {
      ok: true,
      headers: { get: () => String(Date.now() + 60000) },
      json: async () => [],
    };
  };
  dom.window.eval(source);
  const core = dom.window.__IMWEB_PRODUCT_NOTICES_V1__;
  core.start("first", async () => {
    await core.rules();
    initialized = true;
  });
  core.start("second", async () => {
    await core.rules();
  });
  assert.equal(reads, 1);
  await core.rules();
  assert.equal(initialized, false);
  ready = true;
  callbacks.forEach((fn) => fn(new dom.window.Event("DOMContentLoaded")));
  await delay(5);
  assert.equal(initialized, true);
  assert.equal(reads, 1);
});

test("Google recovery requests automatic PACK and SET metadata with ordinary notices", async (t) => {
  const pack = {
    enabled: true,
    domain: "closeby2.com",
    productId: "1608",
    type: "구매혜택",
    setupLabel: "PACK_AUTO_V1",
    setupAvailable: true,
    setupProductId: "2000",
    message: "2PACK 상품 보러 가기→",
    endsAt: new Date(Date.now() + 60000).toISOString(),
  };
  const p = recoveryPage(t, async (_, url) => {
    const request = new URL(url);
    if (request.hostname !== "script.google.com") throw Error("temporary");
    return request.searchParams.get("packs") === "1" ? [pack] : [];
  });
  const rows = await p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].setupProductId, "2000");
  await delay(5);
  assert.equal(
    p.d.querySelector("[data-sheet-benefit] a")?.textContent,
    pack.message,
  );
  assert.equal(
    new URL(p.d.querySelector("[data-sheet-benefit] a").href).searchParams.get(
      "idx",
    ),
    "2000",
  );
});

test("a slow cache result survives the Google fallback failure and renders option notices", async (t) => {
  let cacheWasAborted = false;
  const p = recoveryPage(t, async (call, url, signal) => {
    if (!url.includes("script.google.com")) {
      await delay(35);
      cacheWasAborted = signal.aborted;
      return [notice];
    }
    throw Error("temporary");
  });
  await p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  await delay(5);
  assert.equal(cacheWasAborted, false);
  assert.equal(p.calls.length, 3);
  assert.equal(
    p.d.querySelector(".reserved-shipping-date")?.textContent,
    notice.message,
  );
  assert.deepEqual(
    p.reports.map((r) => r.outcome),
    ["CACHE"],
  );
});

test("all features recover together after an entire round fails without reloading", async (t) => {
  const p = recoveryPage(t, async (call) => {
    if (call <= 3) throw Error("temporary");
    return [notice, { ...notice, type: "배송정보", message: "배송 원본" }];
  });
  const sameRequest = p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  assert.equal(sameRequest, p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules());
  await sameRequest;
  await delay(5);
  assert.equal(p.calls.length, 4);
  assert.equal(
    p.d.querySelector(".reserved-shipping-date")?.textContent,
    notice.message,
  );
  assert.ok(
    p.d
      .querySelector('[data-sheet-notice="delivery"]')
      .textContent.includes("배송 원본"),
  );
  assert.deepEqual(
    p.reports.map((r) => r.outcome),
    ["CACHE"],
  );
});

test("an authoritative empty result is respected without querying or reviving old notices", async (t) => {
  const p = recoveryPage(t, async () => []);
  assert.equal((await p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules()).length, 0);
  assert.equal(p.calls.length, 1);
  assert.equal(p.d.querySelector(".reserved-shipping-date"), null);
});

test("when Google wins the slow request is cancelled and cannot overwrite newer data", async (t) => {
  const p = recoveryPage(t, async (call, url) => {
    if (call === 1) {
      await delay(35);
      return [{ ...notice, message: "이전 날짜" }];
    }
    return [notice];
  });
  const rows = await p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  assert.equal(rows[0].message, notice.message);
  assert.equal(p.calls[0].signal.aborted, true);
  await delay(45);
  assert.equal(
    p.d.querySelector(".reserved-shipping-date")?.textContent,
    notice.message,
  );
  assert.equal(p.calls.length, 2);
  assert.deepEqual(
    p.reports.map((r) => r.outcome),
    ["GOOGLE"],
  );
});

test("leaving the page cancels pending reads without retrying or recording an outage", async (t) => {
  const p = recoveryPage(
    t,
    async (call, url, signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(Error("aborted")), {
          once: true,
        });
      }),
  );
  const result = p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  p.w.dispatchEvent(
    new p.w.PageTransitionEvent("pagehide", { persisted: false }),
  );
  await assert.rejects(result);
  await delay(12);
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].signal.aborted, true);
  assert.equal(p.reports.length, 0);
});

test("back-forward cache preservation does not cancel a still valid read", async (t) => {
  const p = recoveryPage(t, async () => {
    await delay(2);
    return [notice];
  });
  const result = p.w.__IMWEB_PRODUCT_NOTICES_V1__.rules();
  p.w.dispatchEvent(
    new p.w.PageTransitionEvent("pagehide", { persisted: true }),
  );
  assert.equal((await result)[0].message, notice.message);
  await delay(5);
  assert.equal(
    p.d.querySelector(".reserved-shipping-date")?.textContent,
    notice.message,
  );
  assert.equal(p.calls.length, 1);
});
