import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { shell } from "electron";
import { basename, join } from "path";
import Properties from "./Properties";
import { MetaData } from "../interfaces/MetaData";
import { getLogger } from "../utils/logger";
import { FILE_EXTENSIONS, URLS } from "../constants";
import ExtractMetaData from "../utils/ExtractMetaData";
import RegistryMetaData from "../interfaces/RegistryMetaData";
import Helpers from "../utils/Helpers";

class ModManager {
    private static logger = getLogger("ModManager");

    private static safeModPath(type: "plugin" | "theme", fileName: string): string | null {
        const trimmed = String(fileName || "").trim();
        const base = basename(trimmed);
        if (!base || base === "." || base === ".." || base !== trimmed) return null;
        return join(type === "plugin" ? Properties.pluginsPath : Properties.themesPath, base);
    }

    public static getPluginContent(pluginName: string): string | null {
        const pluginPath = this.safeModPath("plugin", pluginName);
        if (!pluginPath || !existsSync(pluginPath)) return null;
        return readFileSync(pluginPath, "utf-8");
    }

    public static getInstalledThemes(): string[] {
        const dirPath = Properties.themesPath;
        if (!existsSync(dirPath)) return [];
        return readdirSync(dirPath).filter(f => statSync(join(dirPath, f)).isFile());
    }

    public static getInstalledPlugins(): string[] {
        const dirPath = Properties.pluginsPath;
        if (!existsSync(dirPath)) return [];
        return readdirSync(dirPath).filter(f => statSync(join(dirPath, f)).isFile());
    }

    public static isThemeInstalled(fileName: string): boolean {
        return this.getInstalledThemes().includes(fileName);
    }

    public static isPluginInstalled(fileName: string): boolean {
        return this.getInstalledPlugins().includes(fileName);
    }

    public static openFolder(folderPath: string): void {
        shell.openPath(folderPath).then(error => {
            if (error) this.logger.error(`Failed to open folder ${folderPath}: ${error}`);
        });
    }

    public static async fetchMods(): Promise<{ plugins: unknown[]; themes: unknown[] }> {
        const response = await fetch(URLS.REGISTRY);
        return response.json();
    }

    public static async downloadMod(modLink: string, type: "plugin" | "theme"): Promise<string> {
        const parsed = new URL(modLink);
        if (parsed.protocol !== "https:") throw new Error(`Refusing non-HTTPS mod URL: ${modLink}`);
        const expectedExt = type === "plugin" ? FILE_EXTENSIONS.PLUGIN : FILE_EXTENSIONS.THEME;
        const filename = basename(parsed.pathname);
        if (!filename.endsWith(expectedExt)) throw new Error(`Invalid ${type} filename: ${filename}`);

        this.logger.info(`Downloading ${type} from: ${modLink}`);
        const response = await fetch(parsed.toString());
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        
        const saveDir = type === "plugin" ? Properties.pluginsPath : Properties.themesPath;
        if (!existsSync(saveDir)) mkdirSync(saveDir, { recursive: true });
        
        const filePath = join(saveDir, filename);

        const buffer = Buffer.from(await response.arrayBuffer());
        writeFileSync(filePath, buffer);

        this.logger.info(`Downloaded ${type} saved to: ${filePath}`);
        return filePath;
    }

    public static deleteModFile(fileName: string, type: "plugin" | "theme"): void {
        const targetPath = this.safeModPath(type, fileName);
        if (targetPath && existsSync(targetPath)) {
            unlinkSync(targetPath);
            this.logger.info(`Deleted ${type} file: ${fileName}`);
        }
    }

    public static saveModFile(fileName: string, type: "plugin" | "theme", content: string): void {
        const targetPath = this.safeModPath(type, fileName);
        if (!targetPath) throw new Error(`Invalid ${type} filename: ${fileName}`);
        writeFileSync(targetPath, content, 'utf-8');
    }

    public static async checkUpdateData(itemFile: string): Promise<{
        hasUpdate: boolean;
        newContent?: string;
        newMetaData?: MetaData;
        installedMetaData?: MetaData;
        registryVersion?: string | null;
        updateUrl?: string;
    } | null> {
        const type = itemFile.endsWith(FILE_EXTENSIONS.THEME) ? "theme" : "plugin";
        const itemPath = this.safeModPath(type, itemFile);
        if (!itemPath) return null;
        
        const installedMetaData = ExtractMetaData.extractMetadataFromFile(itemPath) as MetaData | null;
        if (!installedMetaData?.updateUrl || installedMetaData.updateUrl === "none") return null;

        try {
            const parsedUpdateUrl = new URL(installedMetaData.updateUrl);
            if (parsedUpdateUrl.protocol !== "https:") {
                this.logger.warn(`Refusing non-HTTPS updateUrl for ${itemFile}: ${installedMetaData.updateUrl}`);
                return null;
            }
            const request = await fetch(parsedUpdateUrl.toString());
            if (request.status !== 200) return null;

            const responseText = await request.text();
            const extractedMetaData = ExtractMetaData.extractMetadataFromText(responseText) as MetaData | null;
            
            if (!extractedMetaData) {
                this.logger.warn(`Failed to check for updates for the ${type} ${installedMetaData.name}. The provided updateUrl leads to content with invalid metadata.`);
                return null;
            }

            if (Helpers.isNewerVersion(extractedMetaData.version, installedMetaData.version)) {
                this.logger.info(`New update found for plugin ${installedMetaData.name} (v${installedMetaData.version} -> v${extractedMetaData.version})`)

                let registryVersion = null;
                if (type === "plugin") {
                    registryVersion = await this.getRegistryPluginVersion(itemFile);
                }
                
                return {
                    hasUpdate: true,
                    newContent: responseText,
                    newMetaData: extractedMetaData,
                    installedMetaData,
                    registryVersion,
                    updateUrl: installedMetaData.updateUrl
                };
            }
            return { hasUpdate: false, installedMetaData };
        } catch (error) {
            this.logger.error(`Error checking updates for ${itemFile}: ${(error as Error).message}`);
            return null;
        }
    }

    private static async getRegistryPluginVersion(itemFile: string): Promise<string | null> {
        let registryData = await this.fetchMods();
        let registryPlugins = registryData.plugins as unknown[] || [];
        const plugin = registryPlugins.find(p => (p as RegistryMetaData).download?.endsWith(itemFile)) as RegistryMetaData | undefined;
        return plugin ? plugin.version : null;
    }
}
    
export default ModManager;