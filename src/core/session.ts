import { App, moment } from "obsidian";
import { SessionData } from "../types";

export class SessionManager {
    app: App;
    sessionDir: string;

    constructor(app: App, manifestDir: string) {
        this.app = app;
        this.sessionDir = manifestDir + '/sessions';
    }

    async init() {
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(this.sessionDir))) await adapter.mkdir(this.sessionDir);
    }

    async getSession(id: string): Promise<SessionData | null> {
        const adapter = this.app.vault.adapter;
        const path = this.sessionDir + '/' + id + '.json';
        if (await adapter.exists(path)) return JSON.parse(await adapter.read(path));
        return null;
    }

    async saveSession(s: SessionData) {
        const adapter = this.app.vault.adapter;
        const path = this.sessionDir + '/' + s.sessionId + '.json';
        s.lastUpdate = new Date().toISOString();
        await adapter.write(path, JSON.stringify(s, null, 2));
    }

    async generateNextId(): Promise<string> {
        const adapter = this.app.vault.adapter;
        const today = moment().format("YYYYMMDD");
        let c = 1; let id = today;
        while (await adapter.exists(this.sessionDir + '/' + id + '.json')) { c++; id = today + '_' + c; }
        return id;
    }

    async getRecentSessions(limit: number = 5): Promise<SessionData[]> {
        const adapter = this.app.vault.adapter;
        const files = await adapter.list(this.sessionDir);
        const ss = [];
        for (const f of files.files) {
            if (f.endsWith('.json')) ss.push(JSON.parse(await adapter.read(f)));
        }
        return ss.sort((a, b) => moment(b.lastUpdate).valueOf() - moment(a.lastUpdate).valueOf()).slice(0, limit);
    }

    async getLastSubstantialSession(): Promise<SessionData | null> {
        const adapter = this.app.vault.adapter;
        const files = await adapter.list(this.sessionDir);
        const ss: SessionData[] = [];
        for (const f of files.files) {
            if (f.endsWith('.json')) {
                const s = JSON.parse(await adapter.read(f));
                if (s.hasSubstance) ss.push(s);
            }
        }
        if (ss.length === 0) return null;
        return ss.sort((a, b) => moment(b.lastUpdate).valueOf() - moment(a.lastUpdate).valueOf())[0];
    }
}
