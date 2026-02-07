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

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 30000,
        });
    }

    async login(username: string, password: string): Promise<boolean> {
        try {
            logger.logInfo("开始小米账号登录", { username });

            // 生成设备ID
            this.deviceId = getRandom(16).toUpperCase();
            this.userId = username;

            // Step 1: 获取初始登录参数
            const loginResp = await this.serviceLogin(this.sid);
            logger.logInfo("serviceLogin 响应", loginResp);

            if (loginResp.code !== 0) {
                // Step 2: 提交用户名和密码
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
                logger.logInfo("serviceLoginAuth2 响应", authResp);

                if (authResp.code !== 0) {
                    logger.logError("小米账号登录失败", authResp);
                    return false;
                }

                this.passToken = authResp.passToken;
                this.userId = authResp.userId;
                this.ssecurity = authResp.ssecurity;

                // 更新 cookieJar
                this.cookieJar["userId"] = String(authResp.userId);
                this.cookieJar["passToken"] = authResp.passToken;

                // Step 3: 获取 serviceToken
                // 使用 nonceStr（从原始响应中提取的字符串）避免 JavaScript 数字精度问题
                const nonceToUse = authResp.nonceStr || String(authResp.nonce);
                this.serviceToken = await this.securityTokenService(
                    authResp.location,
                    nonceToUse,
                    authResp.ssecurity,
                );

                logger.logInfo("小米账号登录成功", {
                    userId: this.userId,
                    hasServiceToken: !!this.serviceToken,
                });

                this.isConfigured = true;
                this.useServerMode = false;
                return true;
            }

            // 如果 code 为 0，说明已经登录
            this.userId = loginResp.userId;
            this.passToken = loginResp.passToken;
            this.isConfigured = true;
            this.useServerMode = false;
            return true;
        } catch (error) {
            logger.logError("小米账号登录失败", error);
            return false;
        }
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
        // 使用 serviceLoginAuth2 返回的 nonce（字符串）计算签名
        // 这是 MiService 的做法
        const nsec = `nonce=${nonce}&${ssecurity}`;
        const clientSign = crypto.createHash("sha1").update(nsec).digest("base64");
        const url = `${location}&clientSign=${encodeURIComponent(clientSign)}`;

        // 清除过期的 serviceToken
        delete this.cookieJar["serviceToken"];

        const headers: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 9) AppleWebKit/537.36",
            "Cookie": this.getCookieString(),
        };

        logger.logInfo("请求 securityTokenService", {
            url: url.substring(0, 200),
            nonce,
            ssecurity: ssecurity.substring(0, 10) + "...",
            clientSign: clientSign.substring(0, 20) + "...",
            nsec: nsec.substring(0, 50) + "...",
            cookies: this.getCookieString(),
        });

        // 直接请求，允许重定向，但捕获所有响应
        try {
            const response = await axios.get(url, {
                headers,
                maxRedirects: 10,
                timeout: 30000,
                validateStatus: () => true, // 接受任何状态码
            });

            logger.logInfo("securityTokenService 响应状态", { status: response.status });
            logger.logInfo("securityTokenService 响应头", response.headers);
            logger.logInfo("securityTokenService 响应数据", response.data);

            // 更新 cookies
            if (response.headers["set-cookie"]) {
                logger.logInfo("收到 set-cookie", response.headers["set-cookie"]);
                this.updateCookies(response.headers["set-cookie"]);
            }

            // 从响应头中获取 serviceToken
            if (response.headers["set-cookie"]) {
                for (const cookie of response.headers["set-cookie"]) {
                    const match = cookie.match(/serviceToken=([^;]+)/);
                    if (match && match[1] !== "EXPIRED") {
                        logger.logInfo("获取到 serviceToken", match[1].substring(0, 20) + "...");
                        return match[1];
                    }
                }
            }

            // 从 cookieJar 中获取
            if (this.cookieJar["serviceToken"] && this.cookieJar["serviceToken"] !== "EXPIRED") {
                return this.cookieJar["serviceToken"];
            }

            throw new Error(`无法获取 serviceToken，响应状态: ${response.status}`);
        } catch (error: any) {
            logger.logError("securityTokenService 请求失败", error.message);
            throw error;
        }
    }

    async configure(serverUrl: string, username: string, password: string): Promise<boolean> {
        try {
            logger.logInfo("配置 xiaomusic 服务器", { serverUrl });

            this.config = { serverUrl, username, password };
            this.useServerMode = true;

            // 尝试获取设备列表来验证连接
            const response = await this.axiosInstance.get(
                `${serverUrl}/devices`,
            );

            logger.logInfo("连接测试响应", JSON.stringify(response.data, null, 2));

            if (response.status === 200) {
                this.isConfigured = true;
                logger.logInfo("xiaomusic 连接成功");
                return true;
            }

            logger.logError("xiaomusic 连接失败", response.data);
            return false;
        } catch (error) {
            logger.logError("xiaomusic 连接失败", error);
            return false;
        }
    }

    async getDevices(): Promise<IXiaoaiDevice[]> {
        if (!this.isConfigured) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        // 如果是直接小米账号登录模式，使用小米 API 获取设备列表
        if (!this.useServerMode && this.serviceToken) {
            return this.getDevicesFromXiaoai();
        }

        // xiaomusic 服务器模式
        if (!this.config) {
            throw new Error("未配置 xiaomusic 服务器");
        }

        try {
            logger.logInfo("获取设备列表", { serverUrl: this.config.serverUrl });

            const response = await this.axiosInstance.get(
                `${this.config.serverUrl}/devices`,
            );

            logger.logInfo("获取设备响应", JSON.stringify(response.data, null, 2));

            // FastAPI 通常直接返回数据，不需要 code 字段
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
            logger.logError("获取设备列表失败", error);
            return [];
        }
    }

    private async getDevicesFromXiaoai(): Promise<IXiaoaiDevice[]> {
        try {
            logger.logInfo("从小米 API 获取设备列表");

            const url = "https://api2.mina.mi.com/admin/v2/device_list";
            const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; MI 9) AppleWebKit/537.36",
                "Cookie": `userId=${this.userId}; serviceToken=${this.serviceToken}`,
            };

            const response = await axios.get(url, { headers });

            logger.logInfo("小米 API 设备列表响应", response.data);

            if (response.data?.code === 0 && response.data?.data) {
                this.deviceList = response.data.data.map((device: any) => ({
                    deviceID: device.miotDID || device.deviceID,
                    name: device.name,
                    hardware: device.hardware,
                    isOnline: device.presence === "online",
                    isSleepMode: device.isSleepMode || false,
                    roomName: device.roomName || "",
                    serialNumber: device.serialNumber || "",
                    address: device.address || "unknown",
                }));
                return this.deviceList;
            }

            return [];
        } catch (error) {
            logger.logError("从小米 API 获取设备列表失败", error);
            return [];
        }
    }

    async play(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        // 如果是直接小米账号登录模式，使用小米 API
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
            logger.logError("播放失败", error);
            return false;
        }
    }

    private deviceList: IXiaoaiDevice[] = [];

    // 局域网 IP 映射表 (设备ID -> 局域网IP)
    private lanIpMap: Map<string, string> = new Map();

    async setDeviceLanIp(deviceId: string, lanIp: string): Promise<void> {
        this.lanIpMap.set(deviceId, lanIp);
        logger.logInfo("设置设备局域网 IP", { deviceId, lanIp });
    }

    private async playFromXiaoai(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            logger.logInfo("从小米 API 播放", { deviceId, url: options.url, title: options.title });

            // 确保音乐服务器已启动
            if (!musicServer.isRunning()) {
                logger.logInfo("启动音乐服务器...");
                await musicServer.start(0);
                logger.logInfo("音乐服务器已启动", { url: musicServer.getServerUrl() });
            }

            // 将本地文件路径转换为可通过网络访问的 URL
            let playUrl = options.url;
            if (playUrl.startsWith("file:///")) {
                // 从 file:/// 路径提取实际文件路径
                const filePath = decodeURIComponent(playUrl.slice("file:///".length));
                playUrl = musicServer.getMusicUrl(filePath);
                logger.logInfo("转换后的播放 URL", { original: options.url, converted: playUrl });
            }

            // 获取设备信息
            const device = this.deviceList.find(d => d.deviceID === deviceId);
            const hardware = device?.hardware || "";
            logger.logInfo("设备硬件型号", { deviceId, hardware });

            // 使用小米云端 API 播放音乐
            // 参考 xiaomusic 的实现，使用 ubus 接口
            const url = "https://api2.mina.mi.com/remote/ubus";
            const headers: Record<string, string> = {
                "User-Agent": "MiHome/6.0.103 (com.xiaomi.mihome; build:6.0.103.1; iOS 14.4.0) Alamofire/6.0.103 MICO/iOSApp/appStore/6.0.103",
                "Cookie": `userId=${this.userId}; serviceToken=${this.serviceToken}`,
            };

            // 根据 xiaomusic 的逻辑，根据设备硬件型号选择播放方法
            // 需要使用 play_by_music_url 的设备型号
            const NEED_USE_PLAY_MUSIC_API = ["X08C", "X08E", "X8F", "X4B", "LX05", "OH2", "OH2P", "X6A"];
            const useMusicApi = NEED_USE_PLAY_MUSIC_API.includes(hardware);

            logger.logInfo("选择播放方法", { hardware, useMusicApi });

            if (useMusicApi) {
                // 使用 play_by_music_url 方法
                const musicParams = new URLSearchParams();
                musicParams.append("deviceId", deviceId);
                musicParams.append("path", "mediaplayer");
                musicParams.append("method", "play_by_music_url");
                musicParams.append("message", JSON.stringify({
                    url: playUrl,
                    audio_id: "1582971365183456177",  // 默认音频 ID
                }));

                logger.logInfo("使用 play_by_music_url 方法", { deviceId, url: playUrl });
                const musicResponse = await axios.post(url, musicParams, { headers });
                logger.logInfo("play_by_music_url 响应", musicResponse.data);

                if (musicResponse.data?.code === 0) {
                    return true;
                }
            } else {
                // 使用 play_by_url 方法
                const playByUrlParams = new URLSearchParams();
                playByUrlParams.append("deviceId", deviceId);
                playByUrlParams.append("path", "mediaplayer");
                playByUrlParams.append("method", "play_by_url");
                playByUrlParams.append("message", JSON.stringify({
                    url: playUrl,
                }));

                logger.logInfo("使用 play_by_url 方法", { deviceId, url: playUrl });
                const playByUrlResponse = await axios.post(url, playByUrlParams, { headers });
                logger.logInfo("play_by_url 响应", playByUrlResponse.data);

                if (playByUrlResponse.data?.code === 0) {
                    return true;
                }
            }

            // 如果上述方法都失败，尝试使用 player_play_url 方法
            logger.logInfo("尝试 player_play_url 方法");
            const params = new URLSearchParams();
            params.append("deviceId", deviceId);
            params.append("path", "mediaplayer");
            params.append("method", "player_play_url");
            params.append("message", JSON.stringify({
                url: playUrl,
                type: 2,  // 0: 普通音乐, 1: 电台, 2: URL
                media: "app_ios",
            }));

            const response = await axios.post(url, params, { headers });
            logger.logInfo("player_play_url 响应", response.data);

            return response.data?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 播放失败", error);
            return false;
        }
    }

    private async playByLan(deviceIp: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            logger.logInfo("尝试局域网播放", { deviceIp, url: options.url });

            // 首先尝试 miio 协议 (端口 54321)
            try {
                const success = await this.sendMiioCommand(deviceIp, 54321, {
                    method: "player_play_url",
                    params: {
                        url: options.url,
                        type: 2,
                    },
                });
                if (success) {
                    logger.logInfo("miio 协议播放成功");
                    return true;
                }
            } catch (miioError: any) {
                logger.logInfo(`miio 协议失败: ${miioError.message}，尝试 HTTP 接口`);
            }

            // 尝试多个可能的 HTTP 端口
            const ports = [8080, 8095, 49152, 49153];

            for (const port of ports) {
                try {
                    // 尝试小米音箱的局域网 HTTP 接口
                    const url = `http://${deviceIp}:${port}/play`;
                    const response = await axios.post(url, {
                        url: options.url,
                        name: options.title,
                    }, {
                        timeout: 3000,
                    });

                    logger.logInfo(`局域网播放成功 (端口 ${port})`, response.data);
                    return true;
                } catch (portError: any) {
                    if (portError.response?.status === 404) {
                        logger.logInfo(`端口 ${port} 返回 404，尝试下一个端口`);
                        continue;
                    }
                    // 其他错误（如连接超时）也尝试下一个端口
                    logger.logInfo(`端口 ${port} 失败: ${portError.message}，尝试下一个端口`);
                    continue;
                }
            }

            logger.logError("所有端口都失败");
            return false;
        } catch (error) {
            logger.logError("局域网播放失败", error);
            return false;
        }
    }

    private async sendMiioCommand(deviceIp: string, port: number, command: any): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                const socket = dgram.createSocket("udp4");

                // 构建 miio 协议数据包
                // miio 协议格式: 0x21 0x31 + 长度(2字节) + 未知(4字节) + 设备ID(4字节) + 时间戳(4字节) + 校验和(4字节) + 数据
                const data = Buffer.from(JSON.stringify(command));
                const header = Buffer.alloc(32);
                header.writeUInt8(0x21, 0);  // 魔数
                header.writeUInt8(0x31, 1);  // 魔数
                header.writeUInt16BE(32 + data.length, 2);  // 总长度
                header.writeUInt32BE(0, 4);  // 未知
                header.writeUInt32BE(0, 8);  // 设备ID (需要从设备获取)
                header.writeUInt32BE(Math.floor(Date.now() / 1000), 12);  // 时间戳

                // 计算校验和
                const checksum = crypto.createHash("md5").update(header.slice(0, 16)).update(data).digest();
                checksum.copy(header, 16);

                const packet = Buffer.concat([header, data]);

                logger.logInfo("发送 miio 命令", { deviceIp, port, command });

                socket.send(packet, port, deviceIp, (err) => {
                    if (err) {
                        socket.close();
                        reject(err);
                        return;
                    }

                    // 设置超时
                    const timeout = setTimeout(() => {
                        socket.close();
                        reject(new Error("miio 命令超时"));
                    }, 5000);

                    // 监听响应
                    socket.on("message", (msg) => {
                        clearTimeout(timeout);
                        socket.close();

                        logger.logInfo("收到 miio 响应", msg.toString());

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
            logger.logError("暂停失败", error);
            return false;
        }
    }

    async stop(deviceId: string): Promise<boolean> {
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
            logger.logError("停止失败", error);
            return false;
        }
    }

    async next(deviceId: string): Promise<boolean> {
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
            logger.logError("下一首失败", error);
            return false;
        }
    }

    async prev(deviceId: string): Promise<boolean> {
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
            logger.logError("上一首失败", error);
            return false;
        }
    }

    async setVolume(deviceId: string, volume: number): Promise<boolean> {
        // 如果是直接小米账号登录模式，使用小米 API
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
            logger.logError("设置音量失败", error);
            return false;
        }
    }

    private async setVolumeFromXiaoai(deviceId: string, volume: number): Promise<boolean> {
        try {
            logger.logInfo("从小米 API 设置音量", { deviceId, volume });

            const url = "https://api2.mina.mi.com/remote/ubus";
            const headers: Record<string, string> = {
                "User-Agent": "MiHome/6.0.103 (com.xiaomi.mihome; build:6.0.103.1; iOS 14.4.0) Alamofire/6.0.103 MICO/iOSApp/appStore/6.0.103",
                "Cookie": `userId=${this.userId}; serviceToken=${this.serviceToken}`,
            };

            const params = new URLSearchParams();
            params.append("deviceId", deviceId);
            params.append("path", "mediaplayer");
            params.append("method", "player_set_volume");
            params.append("message", JSON.stringify({
                volume,
                media: "app_ios",
            }));

            const response = await axios.post(url, params, { headers });

            logger.logInfo("小米 API 设置音量响应", response.data);

            return response.data?.code === 0;
        } catch (error) {
            logger.logError("从小米 API 设置音量失败", error);
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
            logger.logError("获取音量失败", error);
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
