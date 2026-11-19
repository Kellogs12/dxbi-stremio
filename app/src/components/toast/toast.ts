import TemplateCache from "../../utils/templateCache";

function escHtml(value: string): string {
    return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function getToastTemplate(id: string, title: string, message: string, status: "success" | "fail" | "info"): Promise<string> {
    let template = TemplateCache.load(__dirname, 'toast');
    let toastStatus;

    switch(status) {
        case "success":
            toastStatus = "success-eIDTa";
            break;
        case "fail":
            toastStatus = "error-quyOd";
            break;
        case "info":
            toastStatus = "info-KEWq8";
            break;
    }
    
    return template
        .replace("{{ id }}", escHtml(id))
        .replace("{{ title }}", escHtml(title))
        .replace("{{ message }}", escHtml(message))
        .replace("{{ status }}", toastStatus);
}
