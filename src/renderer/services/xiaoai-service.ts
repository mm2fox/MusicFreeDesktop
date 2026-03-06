import { IXiaoaiDevice, IXiaoaiPlayOptions } from "@/types/xiaoai-service";
import logger from "@shared/logger/renderer";

function getXiaoai() {
    return (window as any)["@main/xiaoai"];
}

class XiaoaiService {
    async login(username: string, password: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.login(username, password);
            return success;
        } catch (error) {
            logger.logError("小米音箱登录失败", error as Error);
            return false;
        }
    }

    async autoLogin(username: string, password: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.autoLogin(username, password);
            return success;
        } catch (error) {
            logger.logError("小米音箱自动登录失败", error as Error);
            return false;
        }
    }

    async getDevices(): Promise<IXiaoaiDevice[]> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return [];
            }
            const devices = await xiaoai.getDevices();
            return devices || [];
        } catch (error) {
            logger.logError("获取小米音箱设备列表失败", error as Error);
            return [];
        }
    }

    async play(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.play(deviceId, options);
            return success;
        } catch (error) {
            logger.logError("小米音箱播放失败", error as Error);
            return false;
        }
    }

    async pause(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.pause(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱暂停失败", error as Error);
            return false;
        }
    }

    async resume(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.resume(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱恢复播放失败", error as Error);
            return false;
        }
    }

    async stop(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.stop(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱停止失败", error as Error);
            return false;
        }
    }

    async seek(deviceId: string, position: number): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.seek(deviceId, position);
            return success;
        } catch (error) {
            logger.logError("小米音箱跳转失败", error as Error);
            return false;
        }
    }

    async next(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.next(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱下一首失败", error as Error);
            return false;
        }
    }

    async prev(deviceId: string): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.prev(deviceId);
            return success;
        } catch (error) {
            logger.logError("小米音箱上一首失败", error as Error);
            return false;
        }
    }

    async setVolume(deviceId: string, volume: number): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const success = await xiaoai.setVolume(deviceId, volume);
            return success;
        } catch (error) {
            logger.logError("小米音箱设置音量失败", error as Error);
            return false;
        }
    }

    async getVolume(deviceId: string): Promise<number> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return 0;
            }
            const volume = await xiaoai.getVolume(deviceId);
            return volume || 0;
        } catch (error) {
            logger.logError("小米音箱获取音量失败", error as Error);
            return 0;
        }
    }

    async isLoggedIn(): Promise<boolean> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return false;
            }
            const loggedIn = await xiaoai.isLoggedIn();
            return loggedIn;
        } catch (error) {
            logger.logError("检查小米音箱登录状态失败", error as Error);
            return false;
        }
    }

    async logout(): Promise<void> {
        try {
            const xiaoai = getXiaoai();
            if (!xiaoai) {
                logger.logError("xiaoai API 未初始化", new Error("xiaoai API not initialized"));
                return;
            }
            await xiaoai.logout();
        } catch (error) {
            logger.logError("小米音箱登出失败", error as Error);
        }
    }
}

export default new XiaoaiService();
