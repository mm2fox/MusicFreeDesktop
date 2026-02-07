import { IXiaoaiDevice, IXiaoaiPlayOptions } from "@/types/xiaoai-service";
import logger from "@shared/logger/renderer";

// 从 window 对象获取暴露的 API
function getXiaoai() {
    return (window as any)["@main/xiaoai"];
}

class XiaoaiService {
    async login(username: string, password: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.login(username, password);
            return success;
        } catch (error) {
            logger.logError("小米音箱登录失败", error);
            return false;
        }
    }

    async configure(serverUrl: string, username: string, password: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.configure(serverUrl, username, password);
            return success;
        } catch (error) {
            logger.logError("小米音箱配置失败", error);
            return false;
        }
    }

    async getDevices(): Promise<IXiaoaiDevice[]> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return [];
            }
            const devices = await xiaoai.getDevices();
            return devices || [];
        } catch (error) {
            logger.logError("获取小米音箱设备列表失败", error);
            return [];
        }
    }

    async play(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.play(deviceId, options);
            return success;
        } catch (error) {
            logger.logError("小米音箱播放失败", error);
            return false;
        }
    }

    async pause(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.pause(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱暂停失败", error);
            return false;
        }
    }

    async stop(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.stop(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱停止失败", error);
            return false;
        }
    }

    async next(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.next(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱下一首失败", error);
            return false;
        }
    }

    async prev(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.prev(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱上一首失败", error);
            return false;
        }
    }

    async setVolume(deviceId: string, volume: number): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const success = await xiaoai.setVolume(deviceId, volume);
            return success;
        } catch (error) {
            logger.logError("小米音箱设置音量失败", error);
            return false;
        }
    }

    async getVolume(deviceId: string): Promise<number> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return 0;
            }
            const volume = await xiaoai.getVolume(deviceId);
            return volume || 0;
        } catch (error) {
            logger.logError("小米音箱获取音量失败", error);
            return 0;
        }
    }

    async isLoggedIn(): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return false;
            }
            const loggedIn = await xiaoai.isLoggedIn();
            return loggedIn;
        } catch (error) {
            logger.logError("检查小米音箱登录状态失败", error);
            return false;
        }
    }

    async logout(): Promise<void> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return;
            }
            await xiaoai.logout();
        } catch (error) {
            logger.logError("小米音箱登出失败", error);
        }
    }

    async setDeviceLanIp(deviceId: string, lanIp: string): Promise<void> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化");
                return;
            }
            await xiaoai.setDeviceLanIp(deviceId, lanIp);
        } catch (error) {
            logger.logError("设置设备局域网 IP 失败", error);
        }
    }
}

export default new XiaoaiService();
