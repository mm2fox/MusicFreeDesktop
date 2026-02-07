export interface IXiaoaiDevice {
    deviceID: string;
    name: string;
    hardware: string;
    isOnline: boolean;
    isSleepMode: boolean;
    roomName?: string;
    serialNumber?: string;
    address?: string;
}

export interface IXiaoaiAuthConfig {
    username: string;
    password: string;
}

export interface IXiaoaiPlayOptions {
    url: string;
    title?: string;
    artist?: string;
    album?: string;
    duration?: number;
}

export interface IXiaoaiService {
    login(username: string, password: string): Promise<boolean>;
    getDevices(): Promise<IXiaoaiDevice[]>;
    play(deviceId: string, options: IXiaoaiPlayOptions): Promise<boolean>;
    pause(deviceId: string): Promise<boolean>;
    stop(deviceId: string): Promise<boolean>;
    next(deviceId: string): Promise<boolean>;
    prev(deviceId: string): Promise<boolean>;
    setVolume(deviceId: string, volume: number): Promise<boolean>;
    getVolume(deviceId: string): Promise<number>;
    isLoggedIn(): boolean;
    logout(): void;
}
