import { requestUrl } from "obsidian";
import { IntentResult, SessionData } from "../../types";
import { t } from "../../i18n";

/**
 * 大语言模型服务商基类契约 (BaseLLMProvider)
 */
export abstract class BaseLLMProvider {
    id: string;
    label: string;
    config: {
        url: string;
        model: string;
        key: string;
    };

    constructor(id: string, label: string, config: { url: string; model: string; key: string }) {
        this.id = id;
        this.label = label;
        this.config = config;
    }

    async chat(system: string, user: string, maxTokens: number = 4096): Promise<{ content: string }> {
        try {
            const payload = this.preparePayload(this.config.model, system, user, maxTokens);
            const res = await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload)
            });
            const raw = this.parseResponse(res.json);
            return { content: raw.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, "").trim() };
        } catch (e) {
            throw new Error(`FATAL_LLM_ERROR:${this.normalizeError(e)}`);
        }
    }

    async getIntent(input: string, history: string, systemPrompt: string): Promise<IntentResult> {
        try {
            // 将用户实际输入作为 user message，确保 LLM 充分理解上下文
            const userMessage = history 
                ? `请分析以下输入的意图：\n\n当前输入：${input}\n\n最近历史：${history}`
                : `请分析以下输入的意图：\n\n${input}`;
            const payload = this.preparePayload(this.config.model, systemPrompt, userMessage, 2048);
            const res = await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload)
            });
            const raw = this.parseResponse(res.json);
            return this.safeJsonParse(raw);
        } catch (e) {
            throw new Error(`FATAL_LLM_ERROR:${this.normalizeError(e)}`);
        }
    }

    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const payload = this.preparePayload(this.config.model, "hi", "ping", 10);
            await requestUrl({
                url: this.config.url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(payload)
            });
            return { success: true, message: t("success") };
        } catch (e) {
            return { success: false, message: this.normalizeError(e) };
        }
    }

    protected buildHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.config.key}`
        };
    }

    protected preparePayload(model: string, system: string, user: string, maxTokens: number): any {
        return {
            model: model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user }
            ],
            max_tokens: maxTokens,
            stream: false
        };
    }

    protected parseResponse(json: any): string {
        return json.choices?.[0]?.message?.content || "";
    }

    private safeJsonParse(raw: string): any {
        let clean = raw.replace(/<(?:think|thought)>[\s\S]*?<\/(?:think|thought)>/gi, "").trim();
        clean = clean.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        try {
            return JSON.parse(clean);
        } catch (e) {
            const match = clean.match(/\{[\s\S]*\}/);
            if (match) {
                let candidate = match[0];
                try { return JSON.parse(candidate); } catch(e2) {
                    while (candidate.split('{').length > candidate.split('}').length) { candidate += '}'; }
                    try { return JSON.parse(candidate); } catch(e3) { throw e; }
                }
            }
            throw e;
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

        return `[${this.label}] ${t("llmError")}: ${t(reasonKey)} (Code: ${status}, Detail: ${detail})`;
    }
}
