import { fork, execFile, execSync, execFileSync } from "child_process";
import { promisify } from "util";
import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync, readFileSync, writeFileSync, statSync, renameSync, rmSync } from "fs";
import { basename, join } from "path";
import { getLogger } from "./logger";
import Properties from "../core/Properties";
import https from "https";
import { shell } from "electron";
import { FFMPEG_URLS, MACOS_FFPROBE_URLS, SERVER_JS_URL } from "../constants";

class StreamingServer {
    private static logger = getLogger("StreamingServer");
    public static latestServerJsUrl: string = "";

    // Use config directory instead of executable directory for cross-platform compatibility (especially AppImage)
    private static streamingServerDir = join(Properties.enhancedPath, "streamingserver");
    private static serverScriptPath = join(this.streamingServerDir, "server.js");
    private static logFilePath = join(Properties.enhancedPath, "stremio-server.log");
    private static hideWindowsPath = join(this.streamingServerDir, "dxbi-hide-windows.js");

    // dx.bi is a GUI app without a console, so on Windows every console program server.js starts
    // (ffmpeg, ffprobe, wmic, powershell for Local Files) opened a terminal window that flashed and closed.
    // server.js never passes windowsHide, so this is loaded with --require to default it on.
    private static readonly HIDE_WINDOWS_JS = `"use strict";
const cp = require("child_process");
for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"]) {
    const original = cp[name];
    cp[name] = function (file, ...rest) {
        // spawn/execFile take an args array before the options
        const at = Array.isArray(rest[0]) || (rest[0] == null && rest.length > 1) ? 1 : 0;
        const options = rest[at];
        if (options && typeof options === "object") rest[at] = { ...options, windowsHide: true };
        else if (options == null) rest[at] = { windowsHide: true };
        else rest.splice(at, 0, { windowsHide: true }); // a callback where the options would be
        return original.call(this, file, ...rest);
    };
}
`;

    private static getFFmpegUrl(): string {
        const platform =
            process.platform === "win32" || process.platform === "darwin"
                ? process.platform
                : "linux";

        if (process.arch !== "x64" && process.arch !== "arm64") throw new Error(`Unsupported architecture: ${process.arch}`);

        return FFMPEG_URLS[platform][process.arch];
    }

    private static getMacOSFFprobeUrl(): string {
        if (process.arch !== "x64" && process.arch !== "arm64") throw new Error(`Unsupported architecture: ${process.arch}`);
        return MACOS_FFPROBE_URLS[process.arch];
    }

    // Get the directory where server.js should be placed
    public static getStreamingServerDir(): string {
        return this.streamingServerDir;
    }

    // Check if server.js exists
    public static serverJsExists(): boolean {
        return existsSync(this.serverScriptPath);
    }

    // Open the streaming server directory in the file manager
    public static openStreamingServerDir(): void {
        if (!existsSync(this.streamingServerDir)) {
            mkdirSync(this.streamingServerDir, { recursive: true });
        }
        shell.openPath(this.streamingServerDir);
    }

    private static systemBinaryCache = new Map<string, string | null>();

    // Check if system ffmpeg/ffprobe are available and working
    private static getSystemBinaryPath(binary: string): string | null {
        if (this.systemBinaryCache.has(binary)) return this.systemBinaryCache.get(binary)!;
        let found: string | null = null;
        try {
            // cmd.exe has no `which`; `where` lists every match, the first one is what runs
            const lookup = process.platform === "win32" ? `where ${binary}` : `which ${binary}`;
            const result = execSync(lookup, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
            const path = result.split(/\r?\n/)[0].trim();
            if (path && existsSync(path)) {
                if (this.canRun(path)) {
                    this.logger.info(`Found system ${binary} at: ${path}`);
                    found = path;
                } else {
                    this.logger.warn(`Ignoring system ${binary} at ${path}: it doesn't start.`);
                }
            }
        } catch {
            // lookup failed, binary not found
        }
        this.systemBinaryCache.set(binary, found);
        return found;
    }

    // An incomplete copy (e.g. a shared build without its DLLs) exists but can't start
    public static canRun(binaryPath: string): boolean {
        try {
            execFileSync(binaryPath, ["-version"], { stdio: "ignore", timeout: 10000, windowsHide: true });
            return true;
        } catch {
            return false;
        }
    }

    // Get the best available ffmpeg path (prefer system, fallback to downloaded)
    public static getFFmpegPath(): string {
        // First, try system ffmpeg
        const systemFFmpeg = this.getSystemBinaryPath("ffmpeg");
        if (systemFFmpeg) {
            return systemFFmpeg;
        }

        // Fall back to downloaded version
        const downloadedPath = process.platform == "win32"
            ? join(this.streamingServerDir, "ffmpeg.exe")
            : join(this.streamingServerDir, "ffmpeg");
        return downloadedPath;
    }

    // Get the best available ffprobe path (prefer system, fallback to downloaded)
    public static getFFprobePath(): string {
        // First, try system ffprobe
        const systemFFprobe = this.getSystemBinaryPath("ffprobe");
        if (systemFFprobe) {
            return systemFFprobe;
        }

        // Fall back to downloaded version
        const downloadedPath = process.platform == "win32"
            ? join(this.streamingServerDir, "ffprobe.exe")
            : join(this.streamingServerDir, "ffprobe");
        return downloadedPath;
    }

    private static openHttps(url: string, onResponse: (res: import("http").IncomingMessage) => void, onError: (err: Error) => void, redirects = 0): void {
        let parsed: URL;
        try { parsed = new URL(url); } catch (err) { onError(err as Error); return; }
        if (parsed.protocol !== "https:") { onError(new Error(`Refusing non-HTTPS URL: ${url}`)); return; }
        if (redirects > 5) { onError(new Error(`Too many redirects for ${url}`)); return; }

        try {
            https.get(parsed.toString(), { headers: { "User-Agent": "dxbi" } }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    const redirectUrl = new URL(res.headers.location, parsed).toString();
                    this.logger.info(`Following redirect to: ${redirectUrl}`);
                    this.openHttps(redirectUrl, onResponse, onError, redirects + 1);
                    return;
                }
                onResponse(res);
            }).on("error", onError);
        } catch (err) {
            onError(err as Error);
        }
    }

    public static async downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = createWriteStream(dest);
            const fail = (err: Error) => {
                file.destroy();
                reject(err);
            };
            file.on("error", fail);
            this.openHttps(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    fail(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on("finish", () => file.close(() => resolve()));
                res.on("error", fail);
            }, fail);
        });
    }

    // Downloads ffmpeg and ffprobe into targetDir (dx.bi's own streaming server folder by default)
    public static async downloadAndExtractFFmpeg(targetDir: string = this.streamingServerDir): Promise<boolean> {
        const archiveUrl = this.getFFmpegUrl();
        const archivePath = join(targetDir, (process.platform == "win32" || process.platform == "darwin") ? "ffmpeg-release.zip" : "ffmpeg-release.tar.xz");
        const run = promisify(execFile);
        const untar = (file: string, opts: object = { encoding: "utf8" }) => run("tar", ["-xf", file, "-C", targetDir], opts);

        const ffmpegPath = process.platform == "win32"
            ? join(targetDir, "ffmpeg.exe")
            : join(targetDir, "ffmpeg");
        const ffprobePath = process.platform == "win32"
            ? join(targetDir, "ffprobe.exe")
            : join(targetDir, "ffprobe");

        try {
            this.logger.info(`Downloading FFmpeg from ${archiveUrl}...`);
            await this.downloadFile(archiveUrl, archivePath);
            this.logger.info("FFmpeg archive downloaded. Extracting...");

            if (process.platform === "linux") {
                const { stdout: listOutput } = await run("tar", ["-tf", archivePath], { encoding: "utf8" });
                const extractDir = listOutput.split(/\r?\n/)[0].trim().split("/")[0];

                await untar(archivePath);

                const extractedDir = join(targetDir, extractDir);
                renameSync(join(extractedDir, "ffmpeg"), ffmpegPath);
                renameSync(join(extractedDir, "ffprobe"), ffprobePath);

                chmodSync(ffmpegPath, 0o755);
                chmodSync(ffprobePath, 0o755);

                rmSync(extractedDir, { recursive: true, force: true });
                unlinkSync(archivePath);

                this.logger.info("FFmpeg and FFprobe extracted successfully.");
                return true;
            } else if (process.platform === "darwin") {
                await untar(archivePath);
                chmodSync(ffmpegPath, 0o755);
                unlinkSync(archivePath);

                this.logger.info(`FFmpeg extracted successfully. Downloading FFprobe from ${this.getMacOSFFprobeUrl()}...`);

                const ffprobeArchivePath = join(targetDir, "ffprobe-release.zip");
                await this.downloadFile(this.getMacOSFFprobeUrl(), ffprobeArchivePath);
                this.logger.info("FFprobe archive downloaded. Extracting...");
                
                await untar(ffprobeArchivePath);
                chmodSync(ffprobePath, 0o755);
                unlinkSync(ffprobeArchivePath);
                return true;
            } else if (process.platform === "win32") {
                await untar(archivePath, { windowsHide: true });

                // The archive unpacks into a folder named like the archive (win64 or winarm64 build)
                const extDir = join(targetDir, basename(new URL(archiveUrl).pathname, ".zip"));
                const ffmpegSource = join(extDir, "bin", "ffmpeg.exe");
                const ffprobeSource = join(extDir, "bin", "ffprobe.exe");
                const extracted = existsSync(ffmpegSource) && existsSync(ffprobeSource);

                if (extracted) {
                    renameSync(ffmpegSource, ffmpegPath);
                    renameSync(ffprobeSource, ffprobePath);
                } else {
                    this.logger.error(`FFmpeg archive didn't contain ${ffmpegSource} and ${ffprobeSource}.`);
                }

                if (existsSync(extDir)) {
                    rmSync(extDir, { recursive: true, force: true });
                }

                unlinkSync(archivePath);
                return extracted;
            }

            return false;
        } catch (error) {
            this.logger.error(`Failed to download/extract FFmpeg: ${error}`);
            // Cleanup on failure
            if (existsSync(archivePath)) {
                try { unlinkSync(archivePath); } catch {}
            }
            return false;
        }
    }

    public static async ensureStreamingServerFiles(): Promise<"ready" | "missing_server_js" | "missing_ffmpeg"> {
        try {
            // Create directory if it doesn't exist
            if (!existsSync(this.streamingServerDir)) {
                this.logger.info(`Creating streaming server directory: ${this.streamingServerDir}`);
                mkdirSync(this.streamingServerDir, { recursive: true });
            }

            // server.js is downloaded by checkServerJsUpdate(); still missing means that failed
            if (!existsSync(this.serverScriptPath)) {
                this.logger.warn("server.js not found (the download failed). Showing the manual steps.");
                return "missing_server_js";
            }

            // Check if we need to download ffmpeg/ffprobe
            // Only download if system versions are not available
            const systemFFmpeg = this.getSystemBinaryPath("ffmpeg");
            const systemFFprobe = this.getSystemBinaryPath("ffprobe");

            if (systemFFmpeg && systemFFprobe) {
                this.logger.info("Using system ffmpeg and ffprobe.");
            } else {
                // Need to download ffmpeg binaries
                const downloadedFFmpeg = process.platform == "win32"
                    ? join(this.streamingServerDir, "ffmpeg.exe")
                    : join(this.streamingServerDir, "ffmpeg");
                const downloadedFFprobe = process.platform == "win32"
                    ? join(this.streamingServerDir, "ffprobe.exe")
                    : join(this.streamingServerDir, "ffprobe");

                if (!existsSync(downloadedFFmpeg) || !existsSync(downloadedFFprobe)) {
                    this.logger.info("System ffmpeg/ffprobe not found. Downloading...");
                    const success = await this.downloadAndExtractFFmpeg();
                    if (!success) {
                        this.logger.error("Failed to download FFmpeg binaries and system ffmpeg not available.");
                        return "missing_ffmpeg";
                    }
                }
            }

            this.logger.info("All streaming server files are ready.");
            return "ready";

        } catch (error) {
            this.logger.error(`Failed to ensure streaming server files: ${error}`);
            return "missing_ffmpeg";
        }
    }

    public static async streamingServerDirExists() {
        // Check if server.js exists and we have ffmpeg/ffprobe available (either system or downloaded)
        if (!existsSync(this.streamingServerDir) || !existsSync(this.serverScriptPath)) {
            return false;
        }

        const ffmpegPath = this.getFFmpegPath();
        const ffprobePath = this.getFFprobePath();

        if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
            return false;
        }

        return true;
    }

    private static async fetchText(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.openHttps(url, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
                res.on('error', reject);
            }, reject);
        });
    }

    // Keeps Stremio's streaming server (server.js) present and current by itself: it's fetched from
    // Stremio's own download server, at the version Stremio Service currently ships
    public static async checkServerJsUpdate(): Promise<void> {
        let latestVersion = "";
        try {
            this.logger.info("Checking for server.js updates...");
            const tomlContent = await this.fetchText("https://raw.githubusercontent.com/Stremio/stremio-service/refs/heads/master/Cargo.toml");
            const match = tomlContent.match(/\[package\.metadata\.server\][\s\S]*?version\s*=\s*"([^"]+)"/);
            if (match) latestVersion = match[1];
            else this.logger.warn("Could not extract server.js version from Cargo.toml");
        } catch (error) {
            this.logger.warn("Couldn't check the latest server.js version: " + error);
        }

        const currentVersionPath = join(this.streamingServerDir, "version.txt");
        const currentVersion = existsSync(currentVersionPath) ? readFileSync(currentVersionPath, "utf8").trim() : "";
        const present = existsSync(this.serverScriptPath);

        if (present && (!latestVersion || currentVersion === latestVersion)) {
            this.logger.info(`server.js is up to date (${currentVersion || "unknown version"})`);
            return;
        }

        // No version found online: still fetch the known-good one when it's missing altogether
        const downloadUrl = latestVersion ? `https://dl.strem.io/server/${latestVersion}/desktop/server.js` : SERVER_JS_URL;
        this.latestServerJsUrl = downloadUrl;

        try {
            if (!existsSync(this.streamingServerDir)) mkdirSync(this.streamingServerDir, { recursive: true });
            const partial = this.serverScriptPath + ".download";
            this.logger.info(`Downloading server.js ${latestVersion || ""} from ${downloadUrl}...`);
            await this.downloadFile(downloadUrl, partial);
            // a real server.js is several megabytes; anything tiny is an error page
            if (statSync(partial).size < 100 * 1024) throw new Error("the download was incomplete");
            renameSync(partial, this.serverScriptPath);
            writeFileSync(currentVersionPath, latestVersion || "", "utf8");
            this.logger.info(`server.js ${latestVersion} is ready.`);
        } catch (error) {
            // An existing server.js keeps working; a missing one falls back to the manual steps
            this.logger.error("Failed to download server.js: " + error);
            try { unlinkSync(this.serverScriptPath + ".download"); } catch {}
        }
    }

    public static start() {
        if (!existsSync(this.streamingServerDir)) {
            this.logger.warn(`Streaming server directory not found, creating: ${this.streamingServerDir}.`);
            mkdirSync(this.streamingServerDir);
        }

        if (!existsSync(this.serverScriptPath)) {
            this.logger.error("Server script not found: " + this.serverScriptPath);
            process.exit(1);
        }

        const ffmpegPath = this.getFFmpegPath();
        const ffprobePath = this.getFFprobePath();

        if (!existsSync(ffmpegPath)) {
            this.logger.error(`FFmpeg not found: ${ffmpegPath}`);
        }

        if (!existsSync(ffprobePath)) {
            this.logger.error(`FFprobe not found: ${ffprobePath}`);
        }

        this.logger.info(`Using FFmpeg: ${ffmpegPath}`);
        this.logger.info(`Using FFprobe: ${ffprobePath}`);

        const logStream = createWriteStream(this.logFilePath, { flags: "a" });

        const execArgv: string[] = [];
        if (process.platform === "win32") {
            try {
                writeFileSync(this.hideWindowsPath, StreamingServer.HIDE_WINDOWS_JS, "utf8");
                execArgv.push("--require", this.hideWindowsPath);
            } catch (error) {
                this.logger.warn("Couldn't write the hidden-window helper: " + error);
            }
        }

        setTimeout(() => {
            const child = fork(this.serverScriptPath, [], {
                stdio: ["ignore", "pipe", "pipe", "ipc"],
                execArgv,
                env: {
                    ...process.env,
                    FFMPEG_BIN: ffmpegPath,
                    FFPROBE_BIN: ffprobePath,
                },
            });

            if (child.stdout) child.stdout.pipe(logStream);
            if (child.stderr) child.stderr.pipe(logStream);

            this.logger.info("Streaming server started with PID: " + child.pid);

            process.on("exit", () => {
                this.logger.info("Shutting down streaming server...");
                logStream.end();
                if (child && !child.killed) child.kill("SIGINT");
            });
        }, 0);
    }
}

export default StreamingServer;
