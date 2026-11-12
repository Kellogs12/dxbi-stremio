import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

class Properties {
    public static themeLinkSelector: string = "head > link[rel=stylesheet]";

    private static baseDataPath: string = process.platform === "win32"
        ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
        : process.platform === "darwin"
            ? join(homedir(), "Library", "Application Support")
            : join(homedir(), ".config");

    // Data directory: defaults to 'hank', with backward compatibility for an existing 'dxbi' folder
    public static enhancedPath = process.env.HANK_DATA_DIR || process.env.DXBI_DATA_DIR || (() => {
        const hankDir = join(Properties.baseDataPath, "hank");
        const dxbiDir = join(Properties.baseDataPath, "dxbi");
        return existsSync(hankDir) || !existsSync(dxbiDir) ? hankDir : dxbiDir;
    })();

    public static themesPath = join(Properties.enhancedPath, "themes");
    public static pluginsPath = join(Properties.enhancedPath, "plugins");

    // Stremio Enhanced's folder: dx.bi offers to bring your sign-in and settings over from it once
    public static enhancedImportPath = join(Properties.baseDataPath, "stremio-enhanced");
}

export default Properties;