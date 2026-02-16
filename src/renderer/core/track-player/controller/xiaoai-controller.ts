import { IAudioController } from "@/types/audio-controller";
import { PlayerState } from "@/common/constant";
import { ErrorReason } from "@renderer/core/track-player/enum";
import ControllerBase from "@renderer/core/track-player/controller/controller-base";
import XiaoaiService from "@renderer/services/xiaoai-service";
import logger from "@shared/logger/renderer";
import { getUserPreference, setUserPreference } from "@/renderer/utils/user-perference";

class XiaoaiController extends ControllerBase implements IAudioController {
    private _playerState: PlayerState = PlayerState.None;
    private _volume: number = 1;
    private _speed: number = 1;
    private _deviceId: string | null = null;
    private _musicItem: IMusic.IMusicItem | null = null;
    private _progressTimer: ReturnType<typeof setInterval> | null = null;
    private _currentTime: number = 0;
    private _duration: number = 0;

    get playerState() {
        return this._playerState;
    }
    set playerState(value: PlayerState) {
        if (this._playerState !== value) {
            this.onPlayerStateChanged?.(value);
        }
        this._playerState = value;
    }

    get musicItem() {
        return this._musicItem;
    }

    get hasSource() {
        return !!this._musicItem;
    }

    get deviceId() {
        return this._deviceId;
    }

    set deviceId(deviceId: string | null) {
        this._deviceId = deviceId;
        if (deviceId) {
            setUserPreference("xiaoaiDeviceId", deviceId);
        } else {
            setUserPreference("xiaoaiDeviceId", null);
        }
    }

    constructor() {
        super();
        this._deviceId = getUserPreference("xiaoaiDeviceId");
    }

    async play(): Promise<void> {
        // 重新从用户偏好设置获取设备 ID，确保使用的是最新选择的设备
        this._deviceId = getUserPreference("xiaoaiDeviceId");

        if (!this.hasSource || !this._deviceId) {
            logger.logError("无法播放：没有音源或设备 ID", new Error(`hasSource: ${this.hasSource}, deviceId: ${this._deviceId}`));
            return;
        }

        try {
            logger.logInfo("开始播放", { deviceId: this._deviceId, url: this._currentUrl });
            const success = await XiaoaiService.play(this._deviceId, {
                url: this._currentUrl || "",
                title: this._musicItem?.title,
                artist: this._musicItem?.artist,
                album: this._musicItem?.album,
                duration: this._duration,
            });

            if (success) {
                this.playerState = PlayerState.Playing;
                this._startProgressTimer();
            } else {
                this.playerState = PlayerState.Paused;
            }
        } catch (error) {
            logger.logError("小米音箱播放失败", error);
            this.onError?.(ErrorReason.EmptyResource, error);
        }
    }

    async pause(): Promise<void> {
        if (!this._deviceId) {
            return;
        }

        try {
            await XiaoaiService.pause(this._deviceId);
            this.playerState = PlayerState.Paused;
            this._stopProgressTimer();
        } catch (error) {
            logger.logError("小米音箱暂停失败", error);
        }
    }

    async reset(): Promise<void> {
        this._stopProgressTimer();
        this.playerState = PlayerState.None;
        this._musicItem = null;
        this._currentUrl = null;
        this._currentTime = 0;
        this._duration = 0;
    }

    async seekTo(seconds: number): Promise<void> {
        if (!this._deviceId || !this._currentUrl) {
            return;
        }

        try {
            this._currentTime = seconds;
            await XiaoaiService.play(this._deviceId, {
                url: this._currentUrl,
                title: this._musicItem?.title,
                artist: this._musicItem?.artist,
                album: this._musicItem?.album,
                duration: this._duration,
            });
            this.onProgressUpdate?.({
                currentTime: seconds,
                duration: this._duration,
            });
        } catch (error) {
            logger.logError("小米音箱跳转失败", error);
        }
    }

    setLoop(_isLoop: boolean): void {
    }

    async setSinkId(deviceId: string): Promise<void> {
        this.deviceId = deviceId;
    }

    setSpeed(speed: number): void {
        this._speed = speed;
        this.onSpeedChange?.(speed);
    }

    setVolume(volume: number): void {
        this._volume = volume;
        this.onVolumeChange?.(volume);

        if (this._deviceId) {
            XiaoaiService.setVolume(this._deviceId, Math.round(volume * 100)).catch((error) => {
                logger.logError("小米音箱设置音量失败", error);
            });
        }
    }

    prepareTrack(musicItem: IMusic.IMusicItem): void {
        this._musicItem = { ...musicItem };
        this.playerState = PlayerState.None;
        this._stopProgressTimer();
    }

    async setTrackSource(trackSource: IMusic.IMusicSource, musicItem: IMusic.IMusicItem): Promise<void> {
        this._musicItem = { ...musicItem };
        this._currentUrl = trackSource.url || musicItem.url || null;
        this._duration = musicItem.duration || 0;
        this._currentTime = 0;
        logger.logInfo("setTrackSource", {
            url: this._currentUrl,
            trackSourceUrl: trackSource.url,
            musicItemUrl: musicItem.url,
            title: musicItem.title
        });
    }

    destroy(): void {
        this._stopProgressTimer();
        this.reset();
    }

    private _currentUrl: string | null = null;

    private _startProgressTimer(): void {
        this._stopProgressTimer();

        this._progressTimer = setInterval(() => {
            if (this.playerState === PlayerState.Playing) {
                this._currentTime += 1;
                this.onProgressUpdate?.({
                    currentTime: this._currentTime,
                    duration: this._duration,
                });
            }
        }, 1000);
    }

    private _stopProgressTimer(): void {
        if (this._progressTimer) {
            clearInterval(this._progressTimer);
            this._progressTimer = null;
        }
    }
}

export default XiaoaiController;
