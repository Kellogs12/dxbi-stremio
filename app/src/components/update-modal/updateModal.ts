import { marked } from "marked";
import TemplateCache from "../../utils/templateCache";

export async function getUpdateModalTemplate(currentVersion: string, latestVersion: string, releaseNotes: string): Promise<string> {
    let template = TemplateCache.load(__dirname, 'update-modal');
    const safeNotes = String(releaseNotes || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const markdown = await marked(safeNotes, { gfm: true, breaks: true });

    return template
        .replace("{{ releaseNotes }}", markdown)
        .replace(/\{\{\s*currentVersion\s*\}\}/g, currentVersion)
        .replace(/\{\{\s*newVersion\s*\}\}/g, latestVersion);
}
