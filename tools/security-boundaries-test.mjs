// Unit test for desktop mod security boundaries, corrupt config recovery, and safe _eval escaping.
import assert from "node:assert/strict";
import Module from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempData = mkdtempSync(join(tmpdir(), "hank-sec-test-"));
process.env.HANK_DATA_DIR = tempData;
mkdirSync(join(tempData, "plugins"), { recursive: true });
mkdirSync(join(tempData, "themes"), { recursive: true });

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") {
    return {
      app: { getPath: () => tempData },
      dialog: { showMessageBox: async () => ({ response: 0 }) },
      ipcMain: { handle: () => {}, on: () => {} },
      shell: { openPath: async () => "" },
    };
  }
  if (request === "winston") {
    const noop = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    const format = Object.assign(() => () => {}, { combine: () => {}, timestamp: () => {}, printf: () => {}, colorize: () => {} });
    return {
      createLogger: () => noop,
      format,
      transports: { Console: function () {}, File: function () {} },
    };
  }
  return origLoad.apply(this, arguments);
};

try {
  const require = Module.createRequire(import.meta.url);
  const modPath = join(root, "app/dist/core/ModManager.js");
  const settingsPath = join(root, "app/dist/controllers/api/SettingsApiController.js");
  const helpersSource = readFileSync(join(root, "app/src/utils/Helpers.ts"), "utf8");

  const ModManager = require(modPath).default;
  const { readConfigObject } = require(settingsPath);

  // 1. ModManager blocks path traversal in read/write/delete
  writeFileSync(join(tempData, "secret.plugin.js"), "secret", "utf8");
  assert.equal(ModManager.getPluginContent("../secret.plugin.js"), null);
  assert.throws(() => ModManager.saveModFile("../evil.plugin.js", "plugin", "x"));
  ModManager.deleteModFile("../secret.plugin.js", "plugin");
  assert.equal(readFileSync(join(tempData, "secret.plugin.js"), "utf8"), "secret");

  // 2. ModManager update checker rejects non-HTTPS updateUrl before fetching
  writeFileSync(
    join(tempData, "plugins", "bad.plugin.js"),
    "/** @name Bad\n * @version 1.0.0\n * @updateUrl http://example.com/bad.plugin.js\n */\n",
    "utf8",
  );
  let fetchCalled = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalled = true; throw new Error("should not fetch http updateUrl"); };
  try {
    const res = await ModManager.checkUpdateData("bad.plugin.js");
    assert.equal(res, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = realFetch;
  }

  // 3. SettingsApiController recovers defaults on missing or corrupted JSON
  assert.deepEqual(readConfigObject(join(tempData, "plugins", "missing.plugin.json")), {});
  const corruptFile = join(tempData, "plugins", "corrupt.plugin.json");
  writeFileSync(corruptFile, '{"broken": ', "utf8");
  assert.deepEqual(readConfigObject(corruptFile), {});

  // 4. Helpers._eval uses JSON.stringify so backslashes, backticks, and $ cannot corrupt eval
  assert.match(helpersSource, /eval\(\$\{JSON\.stringify\(js\)\}\)/);
  assert.doesNotMatch(helpersSource, /eval\(\\`/);

  console.log("PASS security boundaries, mod update HTTPS check, and config recovery pass");
} finally {
  Module._load = origLoad;
  rmSync(tempData, { recursive: true, force: true });
}
