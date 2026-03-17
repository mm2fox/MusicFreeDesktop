import "./index.scss";
import RadioGroupSettingItem from "../../components/RadioGroupSettingItem";
import CheckBoxSettingItem from "../../components/CheckBoxSettingItem";
import { useOutputAudioDevices } from "@/hooks/useMediaDevices";
import ListBoxSettingItem from "../../components/ListBoxSettingItem";
import trackPlayer from "@renderer/core/track-player";
import { useTranslation } from "react-i18next";
import AppConfig from "@shared/app-config/renderer";
import { useState, useEffect } from "react";
import XiaoaiService from "@renderer/services/xiaoai-service";
import { IXiaoaiDevice } from "@/types/xiaoai-service";
import { getUserPreference, setUserPreference } from "@/renderer/utils/user-perference";


export default function PlayMusic() {
    const audioDevices = useOutputAudioDevices();
    const { t } = useTranslation();

    const [xiaoaiUsername, setXiaoaiUsername] = useState("");
    const [xiaoaiPassword, setXiaoaiPassword] = useState("");
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [devices, setDevices] = useState<IXiaoaiDevice[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [useXiaoai, setUseXiaoai] = useState(false);

    useEffect(() => {
        const init = async () => {
            const savedDeviceId = getUserPreference("xiaoaiDeviceId");
            
            if (savedDeviceId) {
                setSelectedDeviceId(savedDeviceId);
            }
            
            // 启动时始终使用本地播放，不恢复小爱音箱模式
            setUseXiaoai(false);

            const savedUsername = getUserPreference("xiaoaiUsername") || "";
            const savedPassword = getUserPreference("xiaoaiPassword") || "";

            setXiaoaiUsername(savedUsername);
            setXiaoaiPassword(savedPassword);

            // 检查登录状态（自动登录已在 App 组件中处理）
            const loggedIn = await XiaoaiService.isLoggedIn();
            if (loggedIn) {
                setIsLoggedIn(true);
                await loadDevices();
            }
        };
        init();
    }, []);

    const loadDevices = async () => {
        try {
            setLoading(true);
            const deviceList = await XiaoaiService.getDevices();
            console.log("获取到设备列表:", deviceList);
            setDevices(deviceList);
        } catch (error) {
            console.error("获取设备列表失败:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        try {
            setLoading(true);
            const success = await XiaoaiService.login(xiaoaiUsername, xiaoaiPassword);
            if (success) {
                setUserPreference("xiaoaiUsername", xiaoaiUsername);
                setUserPreference("xiaoaiPassword", xiaoaiPassword);
                setIsLoggedIn(true);
                await loadDevices();
            } else {
                alert("登录失败,请检查用户名和密码");
                setXiaoaiPassword("");
            }
        } catch (_error) {
            alert("登录失败,请检查网络连接");
            setXiaoaiPassword("");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        XiaoaiService.logout();
        setIsLoggedIn(false);
        setDevices([]);
        setSelectedDeviceId(null);
        setUseXiaoai(false);
        setXiaoaiUsername("");
        setXiaoaiPassword("");
        setUserPreference("xiaoaiUsername", "");
        setUserPreference("xiaoaiPassword", "");
        setUserPreference("xiaoaiLoginMode", "direct");
        setUserPreference("xiaoaiDeviceId", "");
    };

    const handleDeviceSelect = async (deviceId: string) => {
        console.log("选择设备:", deviceId);
        setSelectedDeviceId(deviceId);
        setUserPreference("xiaoaiDeviceId", deviceId);
        
        // 如果当前是小米音箱输出模式，切换到 xiaoai 控制器
        if (useXiaoai) {
            await trackPlayer.setOutputController("xiaoai");
        }
    };

    const handleOutputModeChange = async (useXiaoaiMode: boolean) => {
        // 保存输出模式设置
        setUserPreference("useXiaoaiOutput", useXiaoaiMode);
        
        setUseXiaoai(useXiaoaiMode);
        if (useXiaoaiMode) {
            await trackPlayer.setOutputController("xiaoai");
        } else {
            await trackPlayer.setOutputController("audio");
        }
    };

    return (
        <div className="setting-view--play-music-container">
            <CheckBoxSettingItem
                keyPath="playMusic.caseSensitiveInSearch"
                label={t("settings.play_music.case_sensitive_in_search")}
            ></CheckBoxSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.default_play_quality")}
                keyPath="playMusic.defaultQuality"
                options={[
                    "low",
                    "standard",
                    "high",
                    "super",
                ]}
                renderItem={it => t("media.music_quality_" + it)}

            ></RadioGroupSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.when_quality_missing")}
                keyPath="playMusic.whenQualityMissing"
                options={["lower", "higher", "skip"]}
                renderItem={it => t("settings.play_music.play_" + it + "_quality_version")}
            ></RadioGroupSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.when_play_error")}
                keyPath="playMusic.playError"
                options={["pause", "skip"]}
                renderItem={it => {
                    if (it === "pause") {
                        return t("settings.play_music.pause");
                    } else {
                        return t("settings.play_music.skip_to_next");
                    }
                }}
            ></RadioGroupSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.double_click_music_list")}
                keyPath="playMusic.clickMusicList"
                options={["normal", "replace"]}
                renderItem={it => {
                    if (it === "normal") {
                        return t("settings.play_music.add_music_to_playlist");
                    } else {
                        return t("settings.play_music.replace_playlist_with_musiclist");
                    }
                }}

            ></RadioGroupSettingItem>

            <div className="setting-item">
                <div className="setting-item-label">播放输出设备</div>
                <div className="setting-item-content">
                    <div className="radio-group">
                        <label className="radio-item">
                            <input
                                type="radio"
                                checked={!useXiaoai}
                                onChange={() => handleOutputModeChange(false)}
                            />
                            <span>本地播放</span>
                        </label>
                        <label className="radio-item">
                            <input
                                type="radio"
                                checked={useXiaoai}
                                onChange={() => handleOutputModeChange(true)}
                            />
                            <span>小米音箱</span>
                        </label>
                    </div>
                </div>
            </div>

            {useXiaoai && (
                <>
                    {!isLoggedIn ? (
                        <div className="setting-item">
                            <div className="setting-item-label">小米账号登录</div>
                            <div className="setting-item-content">
                                <div className="xiaoai-login-form">
                                    <input
                                        type="text"
                                        placeholder="小米账号"
                                        value={xiaoaiUsername}
                                        onChange={(e) => setXiaoaiUsername(e.target.value)}
                                        className="input-field"
                                        disabled={loading}
                                    />
                                    <input
                                        type="password"
                                        placeholder="密码"
                                        value={xiaoaiPassword}
                                        onChange={(e) => setXiaoaiPassword(e.target.value)}
                                        className="input-field"
                                        disabled={loading}
                                    />
                                    <button
                                        onClick={handleLogin}
                                        disabled={loading || !xiaoaiUsername || !xiaoaiPassword}
                                        className="login-button"
                                    >
                                        {loading ? "登录中..." : "登录"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="setting-item">
                                <div className="setting-item-label">已登录</div>
                                <div className="setting-item-content">
                                    <button
                                        onClick={handleLogout}
                                        className="logout-button"
                                    >
                                        退出登录
                                    </button>
                                </div>
                            </div>

                            <div className="setting-item">
                                <div className="setting-item-label">选择设备</div>
                                <div className="setting-item-content">
                                    {loading ? (
                                        <div>加载中...</div>
                                    ) : devices.length === 0 ? (
                                        <div>暂无可用设备</div>
                                    ) : (
                                        <div className="device-list">
                                            {devices.map((device) => (
                                                <div
                                                    key={device.deviceID}
                                                    className={`device-item ${selectedDeviceId === device.deviceID ? "selected" : ""} ${!device.isOnline ? "offline" : ""}`}
                                                    onClick={() => {
                                                        console.log("点击设备:", device.deviceID, "在线状态:", device.isOnline);
                                                        if (device.isOnline) {
                                                            handleDeviceSelect(device.deviceID);
                                                        }
                                                    }}
                                                >
                                                    <div className="device-name">{device.name}</div>
                                                    <div className="device-info">
                                                        {device.roomName && <span>{device.roomName}</span>}
                                                        {!device.isOnline && <span className="offline-badge">离线</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            <ListBoxSettingItem
                label={t("settings.play_music.audio_output_device")}
                keyPath="playMusic.audioOutputDevice"
                renderItem={(item) => {
                    return item ? item.label : t("common.default");
                }}
                width={"320px"}
                onChange={async (evt, item) => {
                    evt.preventDefault();
                    await trackPlayer.setAudioOutputDevice(item.deviceId);
                    AppConfig.setConfig({
                        "playMusic.audioOutputDevice": item.toJSON(),
                    });
                }}
                options={audioDevices}
            ></ListBoxSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.default_volume")}
                keyPath="playMusic.defaultVolume"
                options={["0.3", "0.5", "0.7", "1"]}
                renderItem={it => `${Math.round(parseFloat(it) * 100)}%`}
            ></RadioGroupSettingItem>
            <RadioGroupSettingItem
                label={t("settings.play_music.when_device_removed")}
                keyPath="playMusic.whenDeviceRemoved"
                renderItem={it => {
                    if (it === "pause") {
                        return t("settings.play_music.pause");
                    } else {
                        return t("settings.play_music.continue_playing");
                    }
                }}
                options={["pause", "play"]}
            ></RadioGroupSettingItem>
        </div>
    );
}
