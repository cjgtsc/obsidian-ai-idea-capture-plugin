import en from "./i18n/en";
import zh from "./i18n/zh";
import zhTw from "./i18n/zh-tw";
import ja from "./i18n/ja";
import ko from "./i18n/ko";
import vi from "./i18n/vi";
import th from "./i18n/th";
import de from "./i18n/de";
import fr from "./i18n/fr";
import it from "./i18n/it";
import es from "./i18n/es";
import pt from "./i18n/pt";

export const TRANSLATIONS: Record<string, any> = {
    "en": en,
    "zh": zh,
    "zh-tw": zhTw,
    "ja": ja,
    "ko": ko,
    "vi": vi,
    "th": th,
    "de": de,
    "fr": fr,
    "it": it,
    "es": es,
    "pt": pt
};

/**
 * 核心全局字典引用，确保多模块共享同一状态
 */
let _G_DICT: any = TRANSLATIONS.en;

/**
 * 设置当前语言
 */
export const setLanguage = (langCode: string) => {
    const code = langCode.toLowerCase();
    _G_DICT = TRANSLATIONS[code] || 
              TRANSLATIONS[code.split("-")[0]] || 
              TRANSLATIONS.en;
};

/**
 * 翻译函数 (t)
 */
export const t = (k: string): string => {
    // 处理嵌套错误 Key
    if (k.startsWith("err_") || k.endsWith("Error")) {
        return _G_DICT.errors?.[k] || TRANSLATIONS.en.errors[k] || k;
    }
    // 处理主字典
    return _G_DICT[k] || TRANSLATIONS.en[k] || k;
};

/**
 * 只返回 12 种核心语言，解决下拉菜单臃肿问题
 */
export const getSupportedLanguages = () => [
    { code: "zh", name: "简体中文" },
    { code: "zh-tw", name: "繁體中文" },
    { code: "en", name: "English" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "th", name: "ไทย" },
    { code: "de", name: "Deutsch" },
    { code: "fr", name: "Français" },
    { code: "it", name: "Italiano" },
    { code: "es", name: "Español" },
    { code: "pt", name: "Português" }
];
