import { App, PluginSettingTab, Setting, AbstractInputSuggest, TFolder, Notice, setIcon } from "obsidian";
import type IdeaCapturePlugin from "../main";
import { t, setLanguage, getSupportedLanguages } from "./i18n";
import { IMPlatform, PROVIDERS } from "./types";
import { BANNER_BASE64 } from "./assets/banner";

export class IdeaCaptureSettingTab extends PluginSettingTab {
    p: IdeaCapturePlugin; activeTab: "general" | "ai" = "general";
    constructor(app: App, p: IdeaCapturePlugin) { super(app, p); this.p = p; }
    
    display() {
        const { containerEl: c } = this; c.empty();
        // 确保语言环境在每次渲染前是对齐的
        setLanguage(this.p.settings.language);

        const head = c.createEl("div", { cls: "ideacapture-tab-header" });
        const t1 = head.createEl("div", { text: t("general"), cls: "ideacapture-tab-item " + (this.activeTab === "general" ? "is-active" : "") });
        const t2 = head.createEl("div", { text: t("ai"), cls: "ideacapture-tab-item " + (this.activeTab === "ai" ? "is-active" : "") });
        t1.onclick = () => { this.activeTab = "general"; this.display(); };
        t2.onclick = () => { this.activeTab = "ai"; this.display(); };
        const body = c.createEl("div", { cls: "ideacapture-tab-content" });
        if (this.activeTab === "general") this.renderG(body); else this.renderA(body);
    }

    renderG(el: HTMLElement) {
        // 渲染 Banner
        const banner = el.createEl("img", { cls: "ideacapture-banner" });
        banner.src = `data:image/jpeg;base64,${BANNER_BASE64}`;

        this.renderIMPlatform(el, this.p.settings.activePlatform);
        const group = el.createEl("div", { cls: "ideacapture-setting-group" });
        group.createEl("h4", { text: t("general") });
        new Setting(group).setName(t("inbox")).setDesc(t("inboxDesc")).addText(t => { t.setValue(this.p.settings.inboxFolder).onChange(async v => { this.p.settings.inboxFolder = v; await this.p.saveSettings(); }); new FolderSuggest(this.app, t.inputEl); }).settingEl.addClass("ideacapture-setting-item");
        new Setting(group).setName(t("buffer")).setDesc(t("bufferDesc")).addDropdown(d => { d.addOption("5", "5 " + t("minutes")); d.addOption("10", "10 " + t("minutes")); d.addOption("15", "15 " + t("minutes")); d.setValue(String(this.p.settings.bufferTime)).onChange(async v => { this.p.settings.bufferTime = Number(v); await this.p.saveSettings(); }); }).settingEl.addClass("ideacapture-setting-item");
        new Setting(group).setName(t("langName")).addDropdown(d => { getSupportedLanguages().forEach(l => d.addOption(l.code, l.name)); d.setValue(this.p.settings.language).onChange(async v => { this.p.settings.language = v; setLanguage(v); await this.p.saveSettings(); this.display(); }); }).settingEl.addClass("ideacapture-setting-item");
    }

    renderIMPlatform(el: HTMLElement, platform: IMPlatform) {
        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
        const config = this.p.settings.im[platform];
        const group = el.createEl("div", { cls: "ideacapture-setting-group" });
        group.createEl("h4", { text: t("im") });
        
        const canSwitch = this.p.authService.canSwitchPlatform();
        const imSetting = new Setting(group).setName(t("imPlatform")).addDropdown(d => { 
            d.addOption("telegram", "Telegram"); 
            d.addOption("discord", "Discord"); 
            d.setValue(platform).onChange(async v => { 
                this.p.settings.activePlatform = v as IMPlatform; 
                await this.p.saveSettings(); 
                this.p.chatHandler.activeSessions.clear(); 
                this.p.initIM(); 
                this.display(); 
            }); 
            if (!canSwitch) d.setDisabled(true); 
        });
        imSetting.settingEl.addClass("ideacapture-setting-item");
        
        if (!canSwitch) { 
            imSetting.setDesc(t("imBindingCheck").replace(/{name}/g, platformName)); 
            imSetting.descEl.addClass("ideacapture-success-text"); 
        }

        const isLocked = config.authorizedIds.length > 0;
        
        this.addPasswordSetting(group, `${platformName} ${t("botTokenLabel")}`, config.token, async (v) => { 
            config.token = v; 
            await this.p.saveSettings(); 
            this.p.initIM(); 
        }, isLocked);

        if (config.authorizedIds.length === 0) {
            let activationCode = this.p.authService.getActivationCode();
            const s = new Setting(group).setName(t("activationCode")).setDesc(`${t("activationCodeDesc").replace(/{name}/g, platformName).replace(/{code}/g, activationCode)}`);
            s.addText(text => {
                text.setValue(activationCode).setDisabled(true);
            })
            .addButton(btn => {
                btn.setIcon("refresh-cw").setTooltip(t("reset")).buttonEl.addClass("ideacapture-btn");
                btn.onClick(() => {
                    activationCode = this.p.authService.refreshActivationCode();
                    this.display();
                    new Notice("🔄 " + t("success"));
                });
            })
            .addButton(btn => {
                btn.setIcon("copy").setTooltip(t("success")).buttonEl.addClass("ideacapture-btn");
                btn.onClick(async () => {
                    const currentCode = this.p.authService.getActivationCode();
                    await navigator.clipboard.writeText(`/activate ${currentCode}`);
                    new Notice(`✓ ${t("success")}: /activate ${currentCode}`);
                });
            });
            s.settingEl.addClass("ideacapture-setting-item");
        } else {
            const devSection = group.createEl("div", { cls: "ideacapture-device-list" });
            config.authorizedIds.forEach(id => {
                const row = devSection.createEl("div", { cls: "ideacapture-device-item" });
                const info = row.createEl("div", { cls: "ideacapture-device-info" });
                info.createEl("div", { text: t("authorizedDevices"), cls: "ideacapture-device-label" });
                info.createEl("div", { text: t("chatId") + ": " + id, cls: "ideacapture-device-id" });
                const unbind = row.createEl("button", { text: t("unbind"), cls: "ideacapture-unbind-btn" });
                unbind.onclick = async () => { 
                    await this.p.authService.unbind(platform, id); 
                    new Notice("✅ " + t("unbindSuccess")); 
                    this.display(); 
                };
            });
        }
    }

    addPasswordSetting(container: HTMLElement, name: string, value: string, onChange: (v: string) => Promise<void>, disabled: boolean = false) {
        const decryptedValue = this.p.securityManager.decrypt(value);
        const s = new Setting(container).setName(name);
        s.addText(txt => { 
            txt.inputEl.type = "password"; 
            txt.setValue(decryptedValue).setDisabled(disabled).onChange(async v => { 
                await onChange(this.p.securityManager.encrypt(v)); 
            });
        })
        .addButton(btn => {
            btn.setIcon("eye-off").buttonEl.addClass("ideacapture-btn");
            btn.onClick(() => {
                const txtEl = s.controlEl.querySelector("input") as HTMLInputElement;
                if (txtEl.type === "password") {
                    txtEl.type = "text";
                    btn.setIcon("eye");
                } else {
                    txtEl.type = "password";
                    btn.setIcon("eye-off");
                }
            });
        });
        s.settingEl.addClass("ideacapture-setting-item");
    }

    addProviderSettings(container: HTMLElement, configPath: 'llm' | 'stt' | 'vision' | 'search') {
        const providersMeta = (PROVIDERS as any)[configPath];
        const conf = (this.p.settings as any)[configPath]; 
        const group = container.createEl("div", { cls: "ideacapture-setting-group" });
        
        if ('useLLM' in conf) { 
            new Setting(group).setName(t("useSameAsLLM")).setDesc(t("llm" + configPath.toUpperCase() + "Warning")).addToggle(tg => { 
                tg.setValue((conf as any).useLLM).onChange(async v => { 
                    (conf as any).useLLM = v; 
                    await this.p.saveSettings(); 
                    this.display(); 
                }); 
            }).settingEl.addClass("ideacapture-setting-item"); 
        }

        const isReusingLLM = (conf as any).useLLM;
        const activeConf = isReusingLLM ? this.p.settings.llm : conf;
        const activeId = isReusingLLM ? this.p.settings.llm.current : conf.current;
        const activeMeta = isReusingLLM ? (PROVIDERS.llm as any)[activeId] : providersMeta[activeId];

        if (isReusingLLM) {
            new Setting(group).setName(t(configPath + "Provider")).setDesc(t("reuseLlmWarning").replace(/{name}/g, activeMeta.label)).settingEl.addClass("ideacapture-setting-item");
        } else {
            new Setting(group).setName(t(configPath + "Provider")).setDesc(t(configPath + "Desc")).addDropdown(d => { 
                Object.keys(providersMeta).forEach(id => d.addOption(id, providersMeta[id].label || id)); 
                d.setValue(conf.current).onChange(async v => { 
                    conf.current = v; 
                    await this.p.saveSettings(); 
                    this.display(); 
                }); 
            }).settingEl.addClass("ideacapture-setting-item");
        }

        if (activeId !== 'none') {
            if (!activeConf.providers[activeId]) activeConf.providers[activeId] = { key: "" };
            const prov = activeConf.providers[activeId];
            const fields = activeMeta.fields || [];

            if (!isReusingLLM) {
                if (fields.includes('baseUrl')) {
                    const s = new Setting(group).setName(t("baseUrl"));
                    s.addText(txt => { 
                        if (!prov.url && activeMeta.url) { prov.url = activeMeta.url; this.p.saveSettings(); }
                        txt.setValue(prov.url).onChange(async v => { prov.url = v; await this.p.saveSettings(); }); 
                    })
                    .addButton(btn => {
                        btn.setIcon("rotate-ccw").setTooltip(t("reset")).buttonEl.addClass("ideacapture-btn");
                        btn.onClick(async () => {
                            prov.url = activeMeta.url || "";
                            await this.p.saveSettings();
                            this.display();
                        });
                    });
                    s.settingEl.addClass("ideacapture-setting-item");
                }

                if (fields.includes('model')) {
                    const s = new Setting(group).setName(t("modelName"));
                    s.addText(txt => {
                        if (!prov.model && activeMeta.model) { prov.model = activeMeta.model; this.p.saveSettings(); }
                        txt.setValue(prov.model).onChange(async v => { prov.model = v; await this.p.saveSettings(); });
                    })
                    .addButton(btn => {
                        btn.setIcon("rotate-ccw").setTooltip(t("reset")).buttonEl.addClass("ideacapture-btn");
                        btn.onClick(async () => {
                            prov.model = activeMeta.model || "";
                            await this.p.saveSettings();
                            this.display();
                        });
                    });
                    s.settingEl.addClass("ideacapture-setting-item");
                }
                if (fields.includes('apiKey')) {
                    this.addPasswordSetting(group, t("apiKey"), prov.key, async (v) => { prov.key = v; await this.p.saveSettings(); });
                }
            }

            new Setting(group).addButton(btn => {
                btn.buttonEl.addClass("ideacapture-btn");
                btn.setButtonText(t("testConnection")).onClick(async () => {
                    btn.setDisabled(true).setButtonText(t("testing"));
                    const modelName = prov.model || activeMeta.model || "Unknown";
                    try {
                        const res = await this.p.diagnosticsService.testConnection(configPath, activeId, prov);
                        if (res.success) { 
                            new Notice(`[${modelName}] ✅ ${t("success")}`); 
                        } else { 
                            new Notice(`[${modelName}] ❌ ${res.message}`); 
                        }
                    } catch(e) { 
                        new Notice(`[${modelName}] ❌ ${t("err_default")}: ${e.message}`); 
                    } finally { 
                        btn.setDisabled(false).setButtonText(t("testConnection")); 
                    }
                });
            });
        }
    }

    renderA(el: HTMLElement) {
        this.addProviderSettings(el, 'llm');
        this.addProviderSettings(el, 'stt');
        this.addProviderSettings(el, 'vision');
        this.addProviderSettings(el, 'search');
    }
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
    el: HTMLInputElement; constructor(app: App, el: HTMLInputElement) { super(app, el); this.el = el; }
    getSuggestions(q: string) { const f: TFolder[] = []; this.app.vault.getAllLoadedFiles().forEach(i => { if(i instanceof TFolder && i.path.toLowerCase().includes(q.toLowerCase())) f.push(i); }); return f; }
    renderSuggestion(f: TFolder, el: HTMLElement) { el.setText(f.path); }
    selectSuggestion(f: TFolder) { this.el.value = f.path; this.el.dispatchEvent(new Event("input")); this.close(); }
}
