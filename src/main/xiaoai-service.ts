import axios from "axios";
import { ipcMain } from "electron";
import { IXiaoaiDevice, IXiaoaiPlayOptions } from "@/types/xiaoai-service";
import logger from "@shared/logger/main";
import crypto from "crypto";
import { musicServer } from "./music-server";

function getRandom(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

class XiaoaiService {
    private axiosInstance: any;
    private isConfigured: boolean = false;

    private serviceToken: string | null = null;
    private userId: string | null = null;
    private deviceId: string | null = null;
    private passToken: string | null = null;
    private ssecurity: string | null = null;
    private sid: string = "micoapi";
    private deviceHardwareMap: Map<string, string> = new Map();

    private savedUsername: string | null = null;
    private savedPassword: string | null = null;

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 15000,
        });
    }

    async login(username: string, password: string): Promise<boolean> {
        try {
            this.savedUsername = username;
            this.savedPassword = password;

            this.deviceId = getRandom(16).toUpperCase();
            this.userId = username;

            const loginResp = await this.serviceLogin(this.sid);

            if (loginResp.code !== 0) {
                const data = {
                    _json: "true",
                    qs: loginResp.qs,
                    sid: loginResp.sid,
                    _sign: loginResp._sign,
                    callback: loginResp.callback,
                    user: username,
                    hash: crypto.createHash("md5").update(password).digest("hex").toUpperCase(),
                };

                const authResp = await this.serviceLoginAuth2(data);

                if (authResp.code !== 0) {
                    logger.logError("小米账号登录失败", new Error(JSON.stringify(authResp)));
                    this.resetLoginState();
                    return false;
                }

                this.passToken = authResp.passToken;
                this.userId = authResp.userId;
                this.ssecurity = authResp.ssecurity;

                this.cookieJar["userId"] = String(authResp.userId);
                this.cookieJar["passToken"] = authResp.passToken;

                const nonceToUse = authResp.nonceStr || String(authResp.nonce);
                this.serviceToken = await this.securityTokenService(
                    authResp.location,
                    nonceToUse,
                    authResp.ssecurity,
                );

                this.isConfigured = true;
                return true;
            }

            this.userId = loginResp.userId;
            this.passToken = loginResp.passToken;
            this.isConfigured = true;
            return true;
        } catch (error) {
            logger.logError("小米账号登录失败", error as Error);
            this.resetLoginState();
            return false;
        }
    }

    private resetLoginState(): void {
        this.serviceToken = null;
        this.passToken = null;
        this.ssecurity = null;
        this.isConfigured = false;
        this.cookieJar = {};
    }

    private async relogin(): Promise<boolean> {
        if (!this.savedUsername || !this.savedPassword) {
            logger.logError("无法重新登录：未保存登录凭据", new Error("No saved credentials"));
            return false;
        }

        this.serviceToken = null;
        this.cookieJar = {};

        return await this.login(this.savedUsername, this.savedPassword);
    }

    private cookieJar: Record<string, string> = {};

    private getCookieString(): string {
        return Object.entries(this.cookieJar)
            .map(([key, value]) => `${key}=${value}`)
            .join("; ");
    }

    private updateCookies(setCookieHeader: string[]): void {
        for (const cookie of setCookieHeader) {
            const [keyValue] = cookie.split(";");
            const [key, value] = keyValue.trim().split("=");
            if (key && value) {
                this.cookieJar[key] = value;
            }
        }
    }

    private async serviceLogin(sid: string): Promise<any> {
        const url = `https://account.xiaomi.com/pass/serviceLogin?sid=${sid}&_json=true`;
        const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 9) AppleWebKit/537.36",
        };

        // 设置初始 cookies，保留 userId 和 passToken（如果存在）
        const existingUserId = this.cookieJar["userId"];
        const existingPassToken = this.cookieJar["passToken"];
        this.cookieJar = {
            sdkVersion: "3.9",
            deviceId: this.deviceId || "",
        };
        if (existingUserId) this.cookieJar["userId"] = existingUserId;
        if (existingPassToken) this.cookieJar["passToken"] = existingPassToken;
        headers["Cookie"] = this.getCookieString();

        const response = await axios.get(url, { headers });

        // 更新 cookies
        if (response.headers["set-cookie"]) {
            this.updateCookies(response.headers["set-cookie"]);
        }

        const raw = response.data;
        // 小米返回的数据格式: &&&START&&&{json}
        const jsonStr = raw.replace(/^&&&START&&&/, "");
        return JSON.parse(jsonStr);
    }

    private async serviceLoginAuth2(data: any): Promise<any> {
        const url = "https://account.xiaomi.com/pass/serviceLoginAuth2";
        const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 9) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Cookie": this.getCookieString(),
        };

        const params = new URLSearchParams();
        Object.entries(data).forEach(([key, value]) => {
            params.append(key, String(value));
        });

        const response = await axios.post(url, params, { headers });

        // 更新 cookies
        if (response.headers["set-cookie"]) {
            this.updateCookies(response.headers["set-cookie"]);
        }

        const raw = response.data;
        const jsonStr = raw.replace(/^&&&START&&&/, "");

        // 使用正则表达式提取 nonce，避免 JavaScript 数字精度问题
        const nonceMatch = jsonStr.match(/"nonce":(\d+)/);
        const nonceStr = nonceMatch ? nonceMatch[1] : null;

        const result = JSON.parse(jsonStr);

        // 如果提取到 nonce 字符串，添加到结果中
        if (nonceStr) {
            result.nonceStr = nonceStr;
        }

        return result;
    }

    private async securityTokenService(location: string, nonce: string, ssecurity: string): Promise<string> {
        const nsec = `nonce=${nonce}&${ssecurity}`;
        const clientSign = crypto.createHash("sha1").update(nsec).digest("base64");
        const url = `${location}&clientSign=${encodeURIComponent(clientSign)}`;

        delete this.cookieJar["serviceToken"];

        const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 9) AppleWebKit/537.36",
            "Cookie": this.getCookieString(),
        };

        try {
            const response = await axios.get(url, {
                headers,
                maxRedirects: 10,
                timeout: 15000,
                validateStatus: () => true,
            });

            if (response.headers["set-cookie"]) {
                this.updateCookies(response.headers["set-cookie"]);
            }

            if (response.headers["set-cookie"]) {
                for (const cookie of response.headers["set-cookie"]) {
                    const match = cookie.match(/serviceToken=([^;]+)/);
                    if (match && match[1] !== "EXPIRED") {
                        return match[1];
                    }
                }
            }

            if (this.cookieJar["serviceToken"] && this.cookieJar["serviceToken"] !== "EXPIRED") {
                return this.cookieJar["serviceToken"];
            }

            throw new Error(`无法获取 serviceToken，响应状态: ${response.status}`);
        } catch (error: any) {
            logger.logError("securityTokenService 请求失败", new Error(error.message));
            throw error;
        }
    }

    async getDevices(): Promise<IXiaoaiDevice[]> {
        if (!this.isConfigured || !this.serviceToken) {
            throw new Error("未登录小米账号");
        }

        return this.getDevicesFromXiaoai();
    }

    private async minaRequest(uri: string, data: Record<string, any> | null = null, relogin: boolean = true): Promise<any> {
        const requestId = "app_ios_" + getRandom(30);
        const headers: Record<string, string> = {
            "User-Agent": "MiHome/6.0.103 (com.xiaomi.mihome; build:6.0.103.1; iOS 14.4.0) Alamofire/6.0.103 MICO/iOSApp/appStore/6.0.103",
            "Cookie": `userId=${this.userId}; serviceToken=${this.serviceToken}`,
        };

        let url = `https://api2.mina.mi.com${uri}`;
        let response: any;

        if (data !== null) {
            data.requestId = requestId;
            response = await axios.post(url, new URLSearchParams(data as any), { headers });
        } else {
            url += (url.includes("?") ? "&" : "?") + `requestId=${requestId}`;
            response = await axios.get(url, { headers });
        }

        if (response.data?.code === 1 &&
            (response.data?.message?.toLowerCase().includes("auth") ||
                response.data?.message?.toLowerCase().includes("admin"))) {

            if (relogin && await this.relogin()) {
                return this.minaRequest(uri, data, false);
            }
        }

        return response.data;
    }

    private async getDevicesFromXiaoai(): Promise<IXiaoaiDevice[]> {
        try {
            const result = await this.minaRequest("/admin/v2/device_list?master=0");

            if (result?.code === 0 && result?.data) {
                this.deviceList = result.data.map((device: any) => {
                    const deviceId = String(device.deviceID || device.deviceId || device.did || "");
                    const hardware = device.hardware || "";
                    if (deviceId && hardware) {
                        this.deviceHardwareMap.set(deviceId, hardware);
                    }
                    return {
                        deviceID: deviceId,
                        name: device.name,
                        hardware: hardware,
                        isOnline: device.presence === "online",
                        isSleepMode: device.isSleepMode || false,
                        roomName: device.roomName || "",
                        serialNumber: device.serialNumber || "",
                        address: device.address || "unknown",
                    };
                });
                return this.deviceList;
            }

            return [];
        } catch (error) {
            logger.logError("从小米 API 获取设备列表失败", error as Error);
            return [];
        }
    }

    async play(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        logger.logInfo(`play 调用: deviceId=${deviceId}, hasServiceToken=${!!this.serviceToken}`);
        
        try {
            if (!this.serviceToken) {
                logger.logError("未登录小米账号", new Error("No serviceToken"));
                return false;
            }

            logger.logInfo("进入云端播放模式");
            return await this.playFromXiaoai(deviceId, options);
        } catch (error) {
            logger.logError("播放失败", error as Error);
            return false;
        }
    }

    private deviceList: IXiaoaiDevice[] = [];
    private currentSessionId: string | null = null;
    private currentPlayUrl: string | null = null;
    private currentDeviceId: string | null = null;

    private async playFromXiaoai(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            if (!this.serviceToken) {
                logger.logError("serviceToken 为空，请重新登录", new Error("serviceToken is null"));
                return false;
            }

            if (!musicServer.isRunning()) {
                await musicServer.start(0);
            }

            let playUrl = options.url;
            if (!playUrl) {
                logger.logError("播放 URL 为空", new Error("playUrl is empty"));
                return false;
            }

            logger.logInfo(`原始播放URL: ${playUrl}`);

            // 创建流会话以支持暂停/恢复/跳转
            let sessionId: string | null = null;
            if (playUrl.startsWith("file:///")) {
                const filePath = decodeURIComponent(playUrl.slice("file:///".length));
                sessionId = musicServer.createStreamSession(filePath);
                if (sessionId) {
                    playUrl = musicServer.getStreamUrl(sessionId);
                    logger.logInfo(`本地文件创建流会话: ${sessionId}`);
                } else {
                    playUrl = musicServer.getMusicUrl(filePath);
                }
            } else if (playUrl.startsWith("file://")) {
                sessionId = musicServer.createStreamSession(playUrl);
                if (sessionId) {
                    playUrl = musicServer.getStreamUrl(sessionId);
                    logger.logInfo(`网络文件创建流会话: ${sessionId}`);
                } else {
                    playUrl = musicServer.getProxyUrl(playUrl);
                }
            } else if (playUrl.startsWith("http://") || playUrl.startsWith("https://")) {
                playUrl = musicServer.getProxyUrl(playUrl);
                logger.logInfo(`HTTP URL转换为代理URL: ${playUrl}`);
            }

            this.currentSessionId = sessionId;
            this.currentPlayUrl = playUrl;
            this.currentDeviceId = deviceId;
            logger.logInfo(`最终播放URL: ${playUrl}, sessionId: ${sessionId}`);

            const hardware = this.deviceHardwareMap.get(deviceId) || "";
            logger.logInfo(`设备硬件: ${hardware}`);

            const USE_PLAY_MUSIC_API = [
                "LX04", "LX05", "L05B", "L05C", "L06", "L06A",
                "X08A", "X10A", "X08C", "M01", "X08E", "X8F",
            ];
            const useMusicApi = USE_PLAY_MUSIC_API.includes(hardware);
            logger.logInfo(`使用 Music API: ${useMusicApi}`);

            let message: any;
            let method: string;

            if (useMusicApi) {
                const audioId = "1582971365183456177";
                const music = {
                    payload: {
                        audio_type: "",
                        audio_items: [
                            {
                                item_id: {
                                    audio_id: audioId,
                                    cp: {
                                        album_id: "-1",
                                        episode_index: 0,
                                        id: "355454500",
                                        name: "xiaowei",
                                    },
                                },
                                stream: { url: playUrl },
                            },
                        ],
                        list_params: {
                            listId: "-1",
                            loadmore_offset: 0,
                            origin: "xiaowei",
                            type: "MUSIC",
                        },
                    },
                    play_behavior: "REPLACE_ALL",
                };

                method = "player_play_music";
                message = {
                    startaudioid: audioId,
                    music: JSON.stringify(music),
                };
            } else {
                method = "player_play_url";
                message = {
                    url: playUrl,
                    type: 2,
                    media: "app_ios",
                };
            }

            const result = await this.ubusRequest(deviceId, method, "mediaplayer", message);
            logger.logInfo(`云端播放结果: ${JSON.stringify(result)}`);

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 播放失败", error as Error);
            return false;
        }
    }

    private async ubusRequest(deviceId: string, method: string, path: string, message: any, relogin: boolean = true): Promise<any> {
        const data = {
            deviceId: deviceId,
            path: path,
            method: method,
            message: JSON.stringify(message),
        };

        const result = await this.minaRequest("/remote/ubus", data, relogin);
        return result;
    }

    async pause(deviceId: string): Promise<boolean> {
        logger.logInfo(`pause 调用: deviceId=${deviceId}`);
        
        // 使用云端暂停命令
        if (this.serviceToken) {
            return await this.pauseFromXiaoai(deviceId);
        }

        return false;
    }

    private async pauseFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            logger.logInfo(`发送暂停命令: deviceId=${deviceId}`);
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "pause",
                media: "app_ios",
            });
            logger.logInfo(`暂停结果: ${JSON.stringify(result)}`);

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 暂停失败", error as Error);
            return false;
        }
    }

    async resume(deviceId: string): Promise<boolean> {
        logger.logInfo(`resume 调用: deviceId=${deviceId}`);
        
        // 使用云端恢复命令（可能会从头开始，这是小米音箱的限制）
        if (this.serviceToken) {
            return await this.resumeFromXiaoai(deviceId);
        }

        return false;
    }

    private async resumeFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            logger.logInfo(`发送恢复命令: deviceId=${deviceId}`);
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "play",
                media: "app_ios",
            });
            logger.logInfo(`恢复结果: ${JSON.stringify(result)}`);

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 恢复失败", error as Error);
            return false;
        }
    }

    async stop(deviceId: string): Promise<boolean> {
        logger.logInfo(`stop 调用: deviceId=${deviceId}`);
        
        if (this.serviceToken) {
            return await this.stopFromXiaoai(deviceId);
        }

        return true;
    }

    private async stopFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "stop",
                media: "app_ios",
            });

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 停止失败", error as Error);
            return false;
        }
    }

    async seek(deviceId: string, positionBytes: number): Promise<boolean> {
        logger.logInfo(`seek 调用: deviceId=${deviceId}, position=${positionBytes}`);
        
        // 小米音箱不支持跳转，这是硬件限制
        logger.logError("小米音箱不支持跳转播放位置", new Error("Seek not supported"));
        return false;
    }

    getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }

    async next(deviceId: string): Promise<boolean> {
        if (!this.serviceToken) {
            logger.logError("未登录小米账号", new Error("No serviceToken"));
            return false;
        }
        return this.nextFromXiaoai(deviceId);
    }

    private async nextFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "next",
                media: "app_ios",
            });

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 下一首失败", error as Error);
            return false;
        }
    }

    async prev(deviceId: string): Promise<boolean> {
        if (!this.serviceToken) {
            logger.logError("未登录小米账号", new Error("No serviceToken"));
            return false;
        }
        return this.prevFromXiaoai(deviceId);
    }

    private async prevFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "prev",
                media: "app_ios",
            });

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 上一首失败", error as Error);
            return false;
        }
    }

    async setVolume(deviceId: string, volume: number): Promise<boolean> {
        if (!this.serviceToken) {
            logger.logError("未登录小米账号", new Error("No serviceToken"));
            return false;
        }
        return this.setVolumeFromXiaoai(deviceId, volume);
    }

    private async setVolumeFromXiaoai(deviceId: string, volume: number): Promise<boolean> {
        try {
            const result = await this.ubusRequest(deviceId, "player_set_volume", "mediaplayer", {
                volume,
                media: "app_ios",
            });

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 设置音量失败", error as Error);
            return false;
        }
    }

    async getVolume(deviceId: string): Promise<number> {
        if (!this.serviceToken) {
            logger.logError("未登录小米账号", new Error("No serviceToken"));
            return 0;
        }
        return this.getVolumeFromXiaoai(deviceId);
    }

    private async getVolumeFromXiaoai(deviceId: string): Promise<number> {
        try {
            const result = await this.ubusRequest(deviceId, "player_get_volume", "mediaplayer", {});
            return result?.data?.volume || 0;
        } catch (error) {
            logger.logError("从小米 API 获取音量失败", error as Error);
            return 0;
        }
    }

    isLoggedIn(): boolean {
        return this.isConfigured;
    }

    async logout(): Promise<void> {
        this.isConfigured = false;
        this.serviceToken = null;
        this.cookieJar = {};
    }

    async autoLogin(username: string, password: string): Promise<boolean> {
        if (this.isConfigured) {
            return true;
        }
        return await this.login(username, password);
    }

    init() {
        ipcMain.handle("@main/xiaoai/login", async (_event, { username, password }) => {
            return await this.login(username, password);
        });

        ipcMain.handle("@main/xiaoai/autoLogin", async (_event, { username, password }) => {
            return await this.autoLogin(username, password);
        });

        ipcMain.handle("@main/xiaoai/getDevices", async () => {
            return await this.getDevices();
        });

        ipcMain.handle("@main/xiaoai/play", async (_event, { deviceId, options }) => {
            return await this.play(deviceId, options);
        });

        ipcMain.handle("@main/xiaoai/pause", async (_event, { deviceId }) => {
            return await this.pause(deviceId);
        });

        ipcMain.handle("@main/xiaoai/resume", async (_event, { deviceId }) => {
            return await this.resume(deviceId);
        });

        ipcMain.handle("@main/xiaoai/stop", async (_event, { deviceId }) => {
            return await this.stop(deviceId);
        });

        ipcMain.handle("@main/xiaoai/seek", async (_event, { deviceId, position }) => {
            return await this.seek(deviceId, position);
        });

        ipcMain.handle("@main/xiaoai/next", async (_event, { deviceId }) => {
            return await this.next(deviceId);
        });

        ipcMain.handle("@main/xiaoai/prev", async (_event, { deviceId }) => {
            return await this.prev(deviceId);
        });

        ipcMain.handle("@main/xiaoai/setVolume", async (_event, { deviceId, volume }) => {
            return await this.setVolume(deviceId, volume);
        });

        ipcMain.handle("@main/xiaoai/getVolume", async (_event, { deviceId }) => {
            return await this.getVolume(deviceId);
        });

        ipcMain.handle("@main/xiaoai/isLoggedIn", async () => {
            return this.isLoggedIn();
        });

        ipcMain.handle("@main/xiaoai/logout", async () => {
            await this.logout();
        });
    }
}

export const xiaoaiService = new XiaoaiService();
