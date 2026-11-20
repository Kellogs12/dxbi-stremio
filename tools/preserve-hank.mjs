// Restores Hank's brand identity, Kellogs12/dxbi-stremio endpoints, and hank-* release
// artifact names after merging an upstream notdxbi/dxbi-stremio tag, then re-bundles the theme.
// Usage: node tools/preserve-hank.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const edit = (p, fn) => {
  const full = join(root, p);
  if (!existsSync(full)) return false;
  const before = readFileSync(full, "utf8");
  const after = fn(before);
  if (after === before) return false;
  writeFileSync(full, after, "utf8");
  console.log(`updated ${p}`);
  return true;
};

// 1. Plugin header & updateUrl
edit("dxbi.plugin.js", (s) =>
  s
    .replace(/^(\s*\*\s*@name\s+).+$/m, "$1Hank")
    .replace(/^(\s*\*\s*@author\s+).+$/m, "$1Hank")
    .replace(
      /^(\s*\*\s*@updateUrl\s+).+$/m,
      "$1https://raw.githubusercontent.com/Kellogs12/dxbi-stremio/main/dxbi.plugin.js"
    )
    .replace(/"https:\/\/github\.com\/notdxbi\/dxbi-stremio#install"/g, '"https://github.com/Kellogs12/dxbi-stremio#install"')
    .replace(/\bThe dx\.bi look is built in\./g, "The Hank look is built in.")
);

// 2. Desktop app package.json
edit("app/package.json", (s) => {
  const pkg = JSON.parse(s);
  pkg.name = "hank";
  pkg.description = "Hank: a Netflix-style desktop app for Stremio.";
  pkg.repository = "https://github.com/Kellogs12/dxbi-stremio.git";
  pkg.author = "Hank";
  if (pkg.build) {
    pkg.build.appId = "com.kellogs12.hank";
    pkg.build.productName = "Hank";
    if (pkg.build.publish) {
      pkg.build.publish.owner = "Kellogs12";
      pkg.build.publish.repo = "dxbi-stremio";
    }
    if (pkg.build.linux) pkg.build.linux.executableName = "hank";
    pkg.build.artifactName = "hank-${os}-${arch}.${ext}";
    if (pkg.build.nsis) pkg.build.nsis.artifactName = "hank-Setup-${arch}.${ext}";
    if (pkg.build.portable) pkg.build.portable.artifactName = "hank-portable-${arch}.${ext}";
  }
  return JSON.stringify(pkg, null, "\t") + "\n";
});

// 3. Desktop app constants, main process name, and update modal
edit("app/src/constants/index.ts", (s) =>
  s
    .replace(/notdxbi\/dxbi-stremio/g, "Kellogs12/dxbi-stremio")
    .replace(/label:\s*['"]Get dx\.bi['"]/g, "label: 'Get Hank'")
);

edit("app/src/components/update-modal/update-modal.html", (s) =>
  s
    .replace(/notdxbi\/dxbi-stremio/g, "Kellogs12/dxbi-stremio")
    .replace(/Update Available for dx\.bi!/g, "Update Available for Hank!")
);

edit("app/src/main.ts", (s) =>
  s.replace(/app\.setName\(["']dx\.bi["']\)/g, 'app.setName("Hank")')
);

// 4. Android TV / Mobile Gradle config
edit("tv/app/build.gradle.kts", (s) =>
  s
    .replace(/notdxbi\/dxbi-stremio/g, "Kellogs12/dxbi-stremio")
    .replace(/"dxbi-tv\.apk"/g, '"hank-tv.apk"')
    .replace(/"dxbi-mobile\.apk"/g, '"hank-mobile.apk"')
);

// 5. Installers
edit("install.sh", (s) => s.replace(/notdxbi\/dxbi-stremio/g, "Kellogs12/dxbi-stremio"));
edit("install.ps1", (s) => s.replace(/notdxbi\/dxbi-stremio/g, "Kellogs12/dxbi-stremio"));

// 6. Re-bundle theme & sync versions
execFileSync(process.execPath, [join(root, "tools/bundle-theme.mjs")], { stdio: "inherit" });

// 7. Verify Hank's core fork invariants are still present
const plugin = read("dxbi.plugin.js");
if (!/^\s*\*\s*@name\s+Hank$/m.test(plugin)) {
  throw new Error("Hank @name check failed in dxbi.plugin.js");
}
if (!plugin.includes("Kellogs12/dxbi-stremio/main/dxbi.plugin.js")) {
  throw new Error("Hank @updateUrl check failed in dxbi.plugin.js");
}
console.log("Hank identity preserved.");
