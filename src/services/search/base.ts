import { requestUrl } from "obsidian";
import { t } from "../../i18n";

/**
 * 联网搜索服务商基类 (BaseSearchProvider)
 */
export abstract class BaseSearchProvider {
    id: string;
    label: string;
    config: {
        url: string;
        key: string;
    };

    constructor(id: string, label: string, config: { url: string; key: string }) {
        this.id = id;
        this.label = label;
        this.config = config;
    }

    abstract search(query: string): Promise<string>;

    protected buildHeaders(contentType: string = 'application/json'): Record<string, string> {
        return {
            'Content-Type': contentType
        };
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            await this.search("ping");
            return { success: true, message: t("success") };
        } catch (e) {
            return { success: false, message: this.normalizeError(e) };
        }
    }

    protected normalizeError(e: any): string {
        const status = e.status || 0;
        let detail = e.message || "Request Failed";
        try { if (e.json) detail = e.json.error?.message || e.json.message || JSON.stringify(e.json); } catch(err) { }

        let reasonKey = "err_default";
        if (status === 401) reasonKey = "err_401";
        else if (status === 403) reasonKey = "err_403";
        else if (status === 404) reasonKey = "err_404";
        else if (status === 429) reasonKey = "err_429";
        else if (status >= 500) reasonKey = "err_5xx";
        else if (status === 0 || status === -1) reasonKey = "err_net";

        return `[${this.label}] ${t("searchError")}: ${t(reasonKey)} (Code: ${status}, Detail: ${detail})`;
    }
}
