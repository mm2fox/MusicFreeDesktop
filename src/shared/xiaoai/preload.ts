import { contextBridge, ipcRenderer } from "electron";

export const xiaoai = {
    async login(username: string, password: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/login", { username, password });
    },
    async configure(serverUrl: string, username: string, password: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/configure", { serverUrl, username, password });
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
    async stop(deviceId: string): Promise<boolean> {
        return await ipcRenderer.invoke("@main/xiaoai/stop", { deviceId });
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
    async setDeviceLanIp(deviceId: string, lanIp: string): Promise<void> {
        return await ipcRenderer.invoke("@main/xiaoai/setDeviceLanIp", { deviceId, lanIp });
    },
};

contextBridge.exposeInMainWorld("@main/xiaoai", xiaoai);
