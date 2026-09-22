const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const files = [
  "delivery-info.js",
  "reserved-shipping.js",
  "purchase-benefit-dustuff.js",
  "reserved-shipping.css",
  "purchase-benefit-dustuff.css",
  "demo/index.html",
];
const packager = fs.readFileSync(
  path.join(__dirname, "../scripts/package-cdn.cjs"),
);
function fixture(t) {
  const base = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "notice-package-")),
  );
  const root = path.join(base, "repo"),
    outside = path.join(base, "outside");
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(outside);
  t.after(() => {
    // Remove only this freshly created fixture, never a link or a computed ancestor.
    assert.equal(fs.realpathSync(base), base);
    assert.equal(path.dirname(base), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(base).startsWith("notice-package-"));
    fs.rmSync(base, { recursive: true });
  });
  fs.writeFileSync(path.join(root, "scripts/package-cdn.cjs"), packager);
  const manifest = { sourceCommit: "a".repeat(40), files: {} };
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    const content = Buffer.from("public fixture " + file + "\n");
    fs.writeFileSync(path.join(root, file), content);
    manifest.files[file] = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex");
  }
  const save = () =>
    fs.writeFileSync(path.join(root, "release.json"), JSON.stringify(manifest));
  save();
  const run = () =>
    spawnSync(process.execPath, ["scripts/package-cdn.cjs"], {
      cwd: root,
      encoding: "utf8",
    });
  return { root, outside, manifest, save, run };
}
function inventory(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? inventory(path.join(dir, entry.name)).map(
            (file) => entry.name + "/" + file,
          )
        : entry.name,
    )
    .sort();
}

test("packaging removes leftover artifacts and publishes only verified files", (t) => {
  const f = fixture(t),
    site = path.join(f.root, "_site");
  fs.mkdirSync(path.join(site, "obsolete"), { recursive: true });
  fs.writeFileSync(
    path.join(site, "obsolete/internal.txt"),
    "not real private data",
  );
  fs.writeFileSync(path.join(site, ".env"), "not a real secret");
  assert.equal(f.run().status, 0);
  assert.deepEqual(
    inventory(site),
    [...files, "release.json", ".nojekyll"].sort(),
  );
  for (const file of files)
    assert.deepEqual(
      fs.readFileSync(path.join(site, file)),
      fs.readFileSync(path.join(f.root, file)),
    );
});

test("a changed asset fails validation before touching a previous build", (t) => {
  const f = fixture(t),
    site = path.join(f.root, "_site");
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, "sentinel"), "previous build");
  fs.appendFileSync(path.join(f.root, files[0]), "unverified change");
  assert.notEqual(f.run().status, 0);
  assert.equal(
    fs.readFileSync(path.join(site, "sentinel"), "utf8"),
    "previous build",
  );
});

test("linked output directories cannot redirect cleanup or publication", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.outside, "sentinel"), "preserve");
  fs.symlinkSync(
    f.outside,
    path.join(f.root, "_site"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(inventory(f.outside), ["sentinel"]);
});

test("linked input directories cannot copy material from outside the checkout", (t) => {
  const f = fixture(t);
  fs.copyFileSync(
    path.join(f.root, "demo/index.html"),
    path.join(f.outside, "index.html"),
  );
  fs.unlinkSync(path.join(f.root, "demo/index.html"));
  fs.rmdirSync(path.join(f.root, "demo"));
  fs.symlinkSync(
    f.outside,
    path.join(f.root, "demo"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.existsSync(path.join(f.root, "_site")), false);
});

test("manifest file additions are rejected even with a matching hash", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "internal.txt"), "fixture only");
  f.manifest.files["internal.txt"] = crypto
    .createHash("sha256")
    .update("fixture only")
    .digest("hex");
  f.save();
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.existsSync(path.join(f.root, "_site")), false);
});
