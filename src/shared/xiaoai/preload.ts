import { contextBridge, ipcRenderer } from "electron";

export const xiaoai = {
    async login(username: string, password: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/login", { username, password });
    },
    async autoLogin(username: string, password: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/autoLogin", { username, password });
    },
    async getDevices(): Promise<any> {
        return await ipcRenderer.invoke("@main/xiaoai/getDevices");
    },
    async play(deviceId: string, options: any): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/play", { deviceId, options });
    },
    async pause(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/pause", { deviceId });
    },
    async resume(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/resume", { deviceId });
    },
    async stop(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/stop", { deviceId });
    },
    async seek(deviceId: string, position: number): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/seek", { deviceId, position });
    },
    async next(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/next", { deviceId });
    },
    async prev(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/prev", { deviceId });
    },
    async setVolume(deviceId: string, volume: number): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/setVolume", { deviceId, volume });
    },
    async getVolume(deviceId: string): Promise<number> {
        return await ipcRenderer.invoke("@main/xiaoai/getVolume", { deviceId });
    },
    async isLoggedIn(): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/isLoggedIn");
    },
    async logout(): Promise<void> {
        return await ipcRenderer.invoke("@main/xiaoai/logout");
    },
};

contextBridge.exposeInMainWorld("@main/xiaoai", xiaoai);
