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
  dom.window.fetch = async () => {
    const outcome = outcomes[calls++];
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
    [["error", "error", "error"], "UNAVAILABLE"],
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
