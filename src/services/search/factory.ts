import { IdeaCaptureSettings, PROVIDERS } from "../../types";
import { BaseSearchProvider } from "./base";
import { TavilyProvider } from "./providers/tavily";
import { SerperProvider } from "./providers/serper";
import { CustomSerperProvider } from "./providers/custom_serper";
import { CustomTavilyProvider } from "./providers/custom_tavily";

export class SearchProviderFactory {
    static getProvider(settings: IdeaCaptureSettings, decryptFn: (h: string) => string): BaseSearchProvider | null {
        const conf = settings.search;
        const currentId = conf.current;
        if (currentId === 'none') return null;
        
        const meta = (PROVIDERS.search as any)[currentId];
        const userConf = conf.providers[currentId];
        
        let finalKey = "";
        try { finalKey = decryptFn(userConf?.key || "").trim(); } catch(e) { }
        
        const config = {
            url: (userConf?.url || meta.url || "").trim(),
            key: finalKey
        };

        // 1. 精准路由分发 (物理隔离原则)
        switch (currentId) {
            case 'serper':
                return new SerperProvider(currentId, meta.label, config);
            case 'custom-serper':
                return new CustomSerperProvider(currentId, meta.label, config);
            case 'tavily':
                return new TavilyProvider(currentId, meta.label, config);
            case 'custom-tavily':
                return new CustomTavilyProvider(currentId, meta.label, config);
            default:
                // 默认回退到 Tavily 官方适配器
                return new TavilyProvider(currentId, meta.label, config);
        }
    }
}
