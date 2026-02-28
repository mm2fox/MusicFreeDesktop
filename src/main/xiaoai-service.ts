import axios from "axios";
import { ipcMain } from "electron";
import { IXiaoaiDevice, IXiaoaiPlayOptions } from "@/types/xiaoai-service";
import logger from "@shared/logger/main";
import crypto from "crypto";
import dgram from "dgram";
import { musicServer } from "./music-server";

interface IXiaoaiConfig {
    serverUrl: string;
    username: string;
    password: string;
}

// 生成随机字符串
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
    private config: IXiaoaiConfig | null = null;
    private isConfigured: boolean = false;
    private useServerMode: boolean = false;

    // 小米账号登录相关
    private serviceToken: string | null = null;
    private userId: string | null = null;
    private deviceId: string | null = null;
    private passToken: string | null = null;
    private ssecurity: string | null = null;
    private sid: string = "micoapi";
    private deviceHardwareMap: Map<string, string> = new Map();

    // 存储登录凭据以便自动重新登录
    private savedUsername: string | null = null;
    private savedPassword: string | null = null;

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 30000,
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
                this.useServerMode = false;
                return true;
            }

            this.userId = loginResp.userId;
            this.passToken = loginResp.passToken;
            this.isConfigured = true;
            this.useServerMode = false;
            return true;
        } catch (error) {
            logger.logError("小米账号登录失败", error as Error);
            return false;
        }
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
                timeout: 30000,
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

    async configure(serverUrl: string, username: string, password: string): Promise<boolean> {
        try {
            this.config = { serverUrl, username, password };
            this.useServerMode = true;

            const response = await this.axiosInstance.get(
                `${serverUrl}/devices`,
            );

            if (response.status === 200) {
                this.isConfigured = true;
                return true;
            }

            logger.logError("xiaomusic 连接失败", new Error(JSON.stringify(response.data)));
            return false;
        } catch (error) {
            logger.logError("xiaomusic 连接失败", error as Error);
            return false;
        }
    }

    async getDevices(): Promise<IXiaoaiDevice[]> {
        if (!this.isConfigured) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        if (!this.useServerMode && this.serviceToken) {
            return this.getDevicesFromXiaoai();
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.get(
                `${this.config.serverUrl}/devices`,
            );

            const devices = response.data?.devices || response.data || [];
            return devices.map((device: any) => ({
                deviceID: device.deviceID || device.did,
                name: device.name,
                hardware: device.hardware,
                isOnline: device.isOnline !== false,
                isSleepMode: device.isSleepMode || false,
                roomName: device.roomName || "",
                serialNumber: device.serialNumber || "",
            }));
        } catch (error) {
            logger.logError("获取设备列表失败", error as Error);
            return [];
        }
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
        if (!this.useServerMode && this.serviceToken) {
            return this.playFromXiaoai(deviceId, options);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/play`,
                {
                    did: deviceId,
                    url: options.url,
                    name: options.title,
                },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("播放失败", error as Error);
            return false;
        }
    }

    private deviceList: IXiaoaiDevice[] = [];

    private lanIpMap: Map<string, string> = new Map();

    async setDeviceLanIp(deviceId: string, lanIp: string): Promise<void> {
        this.lanIpMap.set(deviceId, lanIp);
    }

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

            if (playUrl.startsWith("file:///")) {
                const filePath = decodeURIComponent(playUrl.slice("file:///".length));
                playUrl = musicServer.getMusicUrl(filePath);
            } else if (playUrl.startsWith("http://") || playUrl.startsWith("https://")) {
                playUrl = musicServer.getProxyUrl(playUrl);
            }

            const hardware = this.deviceHardwareMap.get(deviceId) || "";

            const USE_PLAY_MUSIC_API = [
                "LX04", "LX05", "L05B", "L05C", "L06", "L06A",
                "X08A", "X10A", "X08C", "M01", "X08E", "X8F",
            ];
            const useMusicApi = USE_PLAY_MUSIC_API.includes(hardware);

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

    private async playByLan(deviceIp: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            try {
                const success = await this.sendMiioCommand(deviceIp, 54321, {
                    method: "player_play_url",
                    params: {
                        url: options.url,
                        type: 2,
                    },
                });
                if (success) {
                    return true;
                }
            } catch (miioError: any) {
            }

            const ports = [8080, 8095, 49152, 49153];

            for (const port of ports) {
                try {
                    const url = `http://${deviceIp}:${port}/play`;
                    const response = await axios.post(url, {
                        url: options.url,
                        name: options.title,
                    }, {
                        timeout: 3000,
                    });

                    return true;
                } catch (portError: any) {
                    if (portError.response?.status === 404) {
                        continue;
                    }
                    continue;
                }
            }

            logger.logError("所有端口都失败", new Error("All ports failed"));
            return false;
        } catch (error) {
            logger.logError("局域网播放失败", error as Error);
            return false;
        }
    }

    private async sendMiioCommand(deviceIp: string, port: number, command: any): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                const socket = dgram.createSocket("udp4");

                const data = Buffer.from(JSON.stringify(command));
                const header = Buffer.alloc(32);
                header.writeUInt8(0x21, 0);
                header.writeUInt8(0x31, 1);
                header.writeUInt16BE(32 + data.length, 2);
                header.writeUInt32BE(0, 4);
                header.writeUInt32BE(0, 8);
                header.writeUInt32BE(Math.floor(Date.now() / 1000), 12);

                const checksum = crypto.createHash("md5").update(header.slice(0, 16)).update(data).digest();
                checksum.copy(header, 16);

                const packet = Buffer.concat([header, data]);

                socket.send(packet, port, deviceIp, (err) => {
                    if (err) {
                        socket.close();
                        reject(err);
                        return;
                    }

                    const timeout = setTimeout(() => {
                        socket.close();
                        reject(new Error("miio 命令超时"));
                    }, 5000);

                    socket.on("message", (msg) => {
                        clearTimeout(timeout);
                        socket.close();

                        try {
                            const response = JSON.parse(msg.slice(32).toString());
                            resolve(response.result === "ok");
                        } catch (e) {
                            resolve(false);
                        }
                    });
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async pause(deviceId: string): Promise<boolean> {
        if (!this.useServerMode && this.serviceToken) {
            return this.pauseFromXiaoai(deviceId);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/pause`,
                { did: deviceId },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("暂停失败", error as Error);
            return false;
        }
    }

    private async pauseFromXiaoai(deviceId: string): Promise<boolean> {
        try {
            const result = await this.ubusRequest(deviceId, "player_play_operation", "mediaplayer", {
                action: "pause",
                media: "app_ios",
            });

            return result?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 暂停失败", error as Error);
            return false;
        }
    }

    async stop(deviceId: string): Promise<boolean> {
        if (!this.useServerMode && this.serviceToken) {
            return this.stopFromXiaoai(deviceId);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/stop`,
                { did: deviceId },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("停止失败", error as Error);
            return false;
        }
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

    async next(deviceId: string): Promise<boolean> {
        if (!this.useServerMode && this.serviceToken) {
            return this.nextFromXiaoai(deviceId);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/next`,
                { did: deviceId },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("下一首失败", error as Error);
            return false;
        }
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
        if (!this.useServerMode && this.serviceToken) {
            return this.prevFromXiaoai(deviceId);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/prev`,
                { did: deviceId },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("上一首失败", error as Error);
            return false;
        }
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
        if (!this.useServerMode && this.serviceToken) {
            return this.setVolumeFromXiaoai(deviceId, volume);
        }

        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.post(
                `${this.config.serverUrl}/volume`,
                { did: deviceId, volume },
            );

            return response.status === 200 || response.data?.code === 0;
        } catch (error) {
            logger.logError("设置音量失败", error as Error);
            return false;
        }
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
        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            const response = await this.axiosInstance.get(
                `${this.config.serverUrl}/volume`,
                { params: { did: deviceId } },
            );

            return response.data?.volume || response.data?.data?.volume || 0;
        } catch (error) {
            logger.logError("获取音量失败", error as Error);
            return 0;
        }
    }

    isLoggedIn(): boolean {
        return this.isConfigured;
    }

    async logout(): Promise<void> {
        this.config = null;
        this.isConfigured = false;
    }

    init() {
        ipcMain.handle("@main/xiaoai/login", async (_event, { username, password }) => {
            return await this.login(username, password);
        });

        ipcMain.handle("@main/xiaoai/configure", async (_event, { serverUrl, username, password }) => {
            return await this.configure(serverUrl, username, password);
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

        ipcMain.handle("@main/xiaoai/stop", async (_event, { deviceId }) => {
            return await this.stop(deviceId);
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

        ipcMain.handle("@main/xiaoai/setDeviceLanIp", async (_event, { deviceId, lanIp }) => {
            await this.setDeviceLanIp(deviceId, lanIp);
        });
    }
}

export const xiaoaiService = new XiaoaiService();
