import TemplateCache from "../../utils/templateCache";
import Helpers from "../../utils/Helpers";

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
        .replace("{{ id }}", Helpers.escHtml(id))
        .replace("{{ title }}", Helpers.escHtml(title))
        .replace("{{ message }}", Helpers.escHtml(message))
        .replace("{{ status }}", toastStatus);
}
