// Runs in the public repository. Never packages the repository wholesale.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = fs.realpathSync(path.resolve(__dirname, ".."));
const files = [
  "delivery-info.js",
  "reserved-shipping.js",
  "purchase-benefit-dustuff.js",
  "reserved-shipping.css",
  "purchase-benefit-dustuff.css",
  "demo/index.html",
];

function readLocal(file) {
  const source = path.resolve(root, file);
  if (fs.realpathSync(source) !== source || !fs.lstatSync(source).isFile())
    throw Error(
      "Release input must be a regular file inside the checkout: " + file,
    );
  return fs.readFileSync(source);
}
const manifestBytes = readLocal("release.json");
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (
  !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
  Object.keys(manifest.files).sort().join("|") !== [...files].sort().join("|")
)
  throw Error("Invalid release manifest");
// Read and validate everything before altering a previous generated build.
const verified = files.map((file) => {
  const data = readLocal(file);
  if (
    crypto.createHash("sha256").update(data).digest("hex") !==
    manifest.files[file]
  )
    throw Error("Release hash mismatch: " + file);
  return [file, data];
});
const site = path.join(root, "_site"),
  previous = fs.lstatSync(site, { throwIfNoEntry: false });
if (previous) {
  // Fixed generated output only; reject links/junctions before recursive removal.
  if (
    !previous.isDirectory() ||
    previous.isSymbolicLink() ||
    fs.realpathSync(site) !== site ||
    path.dirname(site) !== root
  )
    throw Error("Unsafe generated output directory");
  fs.rmSync(site, { recursive: true });
}
for (const [file, data] of verified) {
  const target = path.join(site, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}
fs.writeFileSync(path.join(site, "release.json"), manifestBytes);
fs.writeFileSync(path.join(site, ".nojekyll"), "");
console.log("Verified release " + manifest.sourceCommit);
