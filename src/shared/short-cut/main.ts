import { globalShortcut, ipcMain } from "electron";
import AppConfig from "@shared/app-config/main";
import { IAppConfig } from "@/types/app-config";
import { shortCutKeys, shortCutKeysCommands } from "@/common/constant";
import messageBus from "@shared/message-bus/main";

type IShortCutKeys = keyof IAppConfig["shortCut.shortcuts"];

class ShortCut {
    private pendingShortCuts: Map<IShortCutKeys, string[]> = new Map();
    private retryTimer: NodeJS.Timeout | null = null;
    private readonly RETRY_INTERVAL = 5000;

    async setup() {
        await this.registerAllGlobalShortCuts();
        this.startRetryTimer();

        ipcMain.on("@shared/short-cut/register-global-short-cut", async (_, key, shortCut) => {
            await this.registerGlobalShortCut(key, shortCut);
        });

        ipcMain.on("@shared/short-cut/unregister-global-short-cut", async (_, key) => {
            await this.unregisterGlobalShortCut(key);
        });
    }

    private startRetryTimer() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
        }
        this.retryTimer = setInterval(() => {
            if (this.pendingShortCuts.size > 0) {
                this.retryPendingShortCuts();
            }
        }, this.RETRY_INTERVAL);
    }

    public stopRetryTimer() {
        if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
        }
    }

    public async registerAllGlobalShortCuts() {
        try {
            const shortCuts = AppConfig.getConfig("shortCut.shortcuts");
            const enableGlobal = AppConfig.getConfig("shortCut.enableGlobal");
            
            if (!enableGlobal) {
                return;
            }

            for (const shortCutKey of shortCutKeys) {
                const globalShortCutConfig = shortCuts?.[shortCutKey]?.global;

                if (globalShortCutConfig?.length) {
                    this.pendingShortCuts.set(shortCutKey as IShortCutKeys, globalShortCutConfig);
                    await this.registerGlobalShortCut(shortCutKey as IShortCutKeys, globalShortCutConfig);
                }
            }
        } catch {
            // pass;
        }
    }

    public unregisterAllGlobalShortCuts() {
        globalShortcut.unregisterAll();
    }


    public async registerGlobalShortCut(key: IShortCutKeys, shortCut: string[]) {
        try {
            if (shortCut.length) {
                const prevConfig = AppConfig.getConfig("shortCut.shortcuts");

                if (prevConfig?.[key]?.global?.length) {
                    globalShortcut.unregister(prevConfig[key].global.join("+"));
                }

                const reg = globalShortcut.register(shortCut.join("+"), () => {
                    messageBus.sendCommand(shortCutKeysCommands[key]);
                });

                if (reg) {
                    this.pendingShortCuts.delete(key);
                    const newConfig = {
                        ...(prevConfig || {} as any),
                        [key]: {
                            ...(prevConfig?.[key] || {}),
                            global: shortCut,
                        },
                    };
                    AppConfig.setConfig({
                        "shortCut.shortcuts": newConfig,
                    });
                } else {
                    this.pendingShortCuts.set(key, shortCut);
                }
            }
        } catch {
            // pass
        }
    }

    public retryPendingShortCuts() {
        for (const [key, shortCut] of this.pendingShortCuts) {
            this.registerGlobalShortCut(key, shortCut);
        }
    }


    public async unregisterGlobalShortCut(key: IShortCutKeys) {
        const prevShortCut = AppConfig.getConfig("shortCut.shortcuts")?.[key]?.global;
        if (prevShortCut?.length) {
            // 1. 注销快捷键
            globalShortcut.unregister(prevShortCut.join("+"));
            // 2. 更新配置
            const prevConfig = AppConfig.getConfig("shortCut.shortcuts");
            const newConfig = {
                ...(prevConfig || {} as any),
                [key]: {
                    ...(prevConfig?.[key] || {}),
                    global: null,
                },
            } as IAppConfig["shortCut.shortcuts"];
            AppConfig.setConfig({
                "shortCut.shortcuts": newConfig,
            });
        }
    }
}


const shortCut = new ShortCut();
export default shortCut;
