import {
    getMediaPrimaryKey,
    getQualityOrder,
    isSameMedia,
    setInternalData,
} from "@/common/media-util";
import * as Comlink from "comlink";
import { DownloadState, localPluginName } from "@/common/constant";
import PQueue from "p-queue";
import {
    addDownloadedMusicToList,
    isDownloaded,
    removeDownloadedMusic,
    setupDownloadedMusicList,
    useDownloaded,
    useDownloadedMusicList,
} from "./downloaded-sheet";
import { getGlobalContext } from "@/shared/global-context/renderer";
import Store from "@/common/store";
import { useEffect, useState } from "react";
import { DownloadEvts, ee } from "./ee";
import AppConfig from "@shared/app-config/renderer";
import PluginManager from "@shared/plugin-manager/renderer";
import MusicTag from "@shared/music-tag/renderer";


export interface IDownloadStatus {
    state: DownloadState;
    downloaded?: number;
    total?: number;
    msg?: string;
}

const downloadingMusicStore = new Store<Array<IMusic.IMusicItem>>([]);
const downloadingProgress = new Map<string, IDownloadStatus>();

type ProxyMarkedFunction<T extends (...args: any) => void> = T &
    Comlink.ProxyMarked;

type IOnStateChangeFunc = (data: IDownloadStatus) => void;

interface IDownloaderWorker {
    downloadFile: (
        mediaSource: IMusic.IMusicSource,
        filePath: string,
        onStateChange: ProxyMarkedFunction<IOnStateChangeFunc>
    ) => Promise<void>;
}

let downloaderWorker: IDownloaderWorker;

async function setupDownloader() {
    setupDownloaderWorker();
    setupDownloadedMusicList();
}

function setupDownloaderWorker() {
    // 初始化worker
    const downloaderWorkerPath = getGlobalContext().workersPath.downloader;
    if (downloaderWorkerPath) {
        const worker = new Worker(downloaderWorkerPath);
        downloaderWorker = Comlink.wrap(worker);
    }
    setDownloadingConcurrency(AppConfig.getConfig("download.concurrency"));
}

const concurrencyLimit = 20;
const downloadingQueue = new PQueue({
    concurrency: 5,
});

function setDownloadingConcurrency(concurrency: number) {
    if (isNaN(concurrency)) {
        return;
    }
    downloadingQueue.concurrency = Math.min(
        concurrency < 1 ? 1 : concurrency,
        concurrencyLimit,
    );
}

async function startDownload(
    musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
) {
    if (!downloaderWorker) {
        setupDownloaderWorker();
    }

    const _musicItems = Array.isArray(musicItems) ? musicItems : [musicItems];
    // 过滤掉已下载的、本地音乐、任务中的音乐
    const _validMusicItems = _musicItems.filter(
        (it) => !isDownloaded(it) && it.platform !== localPluginName,
    );

    if (_validMusicItems.length === 0) {
        return;
    }

    const downloadCallbacks = _validMusicItems.map((it) => {
        const pk = getMediaPrimaryKey(it);
        downloadingProgress.set(pk, {
            state: DownloadState.WAITING,
        });

        return async () => {
            // Not on waiting list
            if (!downloadingProgress.has(pk)) {
                return;
            }

            downloadingProgress.get(pk).state = DownloadState.DOWNLOADING;
            let fileName = `${it.title}-${it.artist}`.replace(/[/|\\?*"<>:]/g, "_");
            if (fileName.length > 100) {
                fileName = fileName.substring(0, 100);
            }
            await new Promise<void>((resolve) => {
                downloadMusicImpl(it, fileName, (stateData) => {
                    downloadingProgress.set(pk, stateData);
                    ee.emit(DownloadEvts.DownloadStatusUpdated, it, stateData);
                    if (stateData.state === DownloadState.DONE) {
                        downloadingMusicStore.setValue((prev) =>
                            prev.filter((di) => !isSameMedia(it, di)),
                        );
                        downloadingProgress.delete(pk);
                        resolve();
                    } else if (stateData.state === DownloadState.ERROR) {
                        resolve();
                    }
                });
            });
        };
    });

    downloadingMusicStore.setValue((prev) => [...prev, ..._validMusicItems]);
    downloadingQueue.addAll(downloadCallbacks);
}

async function downloadMusicImpl(
    musicItem: IMusic.IMusicItem,
    fileName: string,
    onStateChange: IOnStateChangeFunc,
) {
    const [defaultQuality, whenQualityMissing] = [
        AppConfig.getConfig("download.defaultQuality"),
        AppConfig.getConfig("download.whenQualityMissing"),
    ];
    const qualityOrder = getQualityOrder(defaultQuality, whenQualityMissing);
    let mediaSource: IPlugin.IMediaSourceResult | null = null;
    let realQuality: IMusic.IQualityKey = qualityOrder[0];
    for (const quality of qualityOrder) {
        try {
            mediaSource = await PluginManager.callPluginDelegateMethod(
                musicItem,
                "getMediaSource",
                musicItem,
                quality,
            );
            if (!mediaSource?.url) {
                continue;
            }
            realQuality = quality;
            break;
        } catch { }
    }

    try {
        if (mediaSource?.url) {
            const ext = mediaSource.url.match(/.*\/.+\.([^./?#&]+)/)?.[1] ?? "mp3";
            const downloadBasePath =
                AppConfig.getConfig("download.path") ??
                getGlobalContext().appPath.downloads;
            
            const downloadPath = window.path.resolve(
                downloadBasePath,
                `./${fileName}.${ext}`,
            );
            
            const { toast } = await import("react-toastify");
            const { fsUtil } = await import("@shared/utils/renderer");
            
            try {
                const dirExists = await fsUtil.isFolder(downloadBasePath);
                if (!dirExists) {
                    const errorMsg = `下载目录不存在: ${downloadBasePath}`;
                    console.error("[Downloader]", errorMsg);
                    toast.error(errorMsg);
                    onStateChange({
                        state: DownloadState.ERROR,
                        msg: errorMsg,
                    });
                    return;
                }
            } catch (e) {
                console.error("[Downloader] Failed to check download path:", e);
            }
            
            let downloadCompleted = false;
            
            downloaderWorker.downloadFile(
                mediaSource,
                downloadPath,
                Comlink.proxy(async (dataState) => {
                    onStateChange(dataState);
                    if (dataState.state === DownloadState.DONE && !downloadCompleted) {
                        downloadCompleted = true;
                        try {
                            await writeMusicTags(musicItem, downloadPath);
                        } catch (e) {
                            console.warn("[Downloader] Failed to write tags:", e);
                        }
                        addDownloadedMusicToList(
                            setInternalData<IMusic.IMusicItemInternalData>(
                                musicItem as any,
                                "downloadData",
                                {
                                    path: downloadPath,
                                    quality: realQuality,
                                },
                                true,
                            ) as IMusic.IMusicItem,
                        );
                    } else if (dataState.state === DownloadState.ERROR) {
                        downloadCompleted = true;
                    }
                }),
            );
        } else {
            throw new Error("Invalid Source");
        }
    } catch (e) {
        console.error("[Downloader] Exception:", e);
        onStateChange({
            state: DownloadState.ERROR,
            msg: e?.message,
        });
    }
}

function useDownloadStatus(musicItem: IMusic.IMusicItem) {
    const [downloadStatus, setDownloadStatus] = useState<IDownloadStatus | null>(
        null,
    );

    useEffect(() => {
        setDownloadStatus(
            downloadingProgress.get(getMediaPrimaryKey(musicItem)) || null,
        );

        const updateFn = (mi: IMusic.IMusicItem, stateData: IDownloadStatus) => {
            if (isSameMedia(mi, musicItem)) {
                setDownloadStatus(stateData);
            }
        };

        ee.on(DownloadEvts.DownloadStatusUpdated, updateFn);

        return () => {
            ee.off(DownloadEvts.DownloadStatusUpdated, updateFn);
        };
    }, [musicItem]);

    return downloadStatus;
}

async function writeMusicTags(musicItem: IMusic.IMusicItem, filePath: string) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext !== "mp3" && ext !== "flac") {
        return;
    }

    const tags: import("@shared/music-tag/renderer").IMusicTags = {
        title: musicItem.title,
        artist: musicItem.artist,
        album: musicItem.album,
    };

    try {
        const lyricSource = await PluginManager.callPluginDelegateMethod(
            musicItem,
            "getLyric",
            musicItem,
        );
        if (lyricSource?.rawLrc) {
            tags.lyrics = lyricSource.rawLrc;
        }
    } catch (e) {
        // ignore
    }

    if (musicItem.artwork) {
        try {
            let artworkBase64: string;
            if (musicItem.artwork.startsWith("data:")) {
                artworkBase64 = musicItem.artwork;
            } else {
                const response = await fetch(musicItem.artwork);
                const blob = await response.blob();
                artworkBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }
            tags.artwork = artworkBase64;
        } catch (e) {
            // ignore
        }
    }

    await MusicTag.writeTags(filePath, tags);
}

// 下载状态
function useDownloadState(musicItem: IMusic.IMusicItem) {
    const musicStatus = useDownloadStatus(musicItem);
    const downloaded = useDownloaded(musicItem);

    return (
        musicStatus?.state || (downloaded ? DownloadState.DONE : DownloadState.NONE)
    );
}

function getDownloadState(musicItem: IMusic.IMusicItem | null) {
    if (!musicItem) {
        return DownloadState.NONE;
    }
    const pk = getMediaPrimaryKey(musicItem);
    const progress = downloadingProgress.get(pk);
    if (progress) {
        return progress.state;
    }
    return isDownloaded(musicItem) ? DownloadState.DONE : DownloadState.NONE;
}

const Downloader = {
    setupDownloader,
    startDownload,
    useDownloadStatus,
    useDownloadingMusicList: downloadingMusicStore.useValue,
    useDownloaded,
    isDownloaded,
    useDownloadedMusicList,
    removeDownloadedMusic,
    setDownloadingConcurrency,
    useDownloadState,
    getDownloadState,
};
export default Downloader;
