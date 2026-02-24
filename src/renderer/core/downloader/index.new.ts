import * as Comlink from "comlink";
import { getGlobalContext } from "@shared/global-context/renderer";
import AppConfig from "@shared/app-config/renderer";
import {
    addDownloadedMusicToList,
    isDownloaded,
    setupDownloadedMusicList,
} from "@renderer/core/downloader/downloaded-sheet";
import logger from "@shared/logger/renderer";
import PQueue from "p-queue";
import EventEmitter from "eventemitter3";
import { DownloadState, localPluginName } from "@/common/constant";
import { getQualityOrder, isSameMedia, setInternalData } from "@/common/media-util";
import { downloadingMusicStore } from "@renderer/core/downloader/store";
import PluginManager from "@shared/plugin-manager/renderer";
import MusicTag from "@shared/music-tag/renderer";

type ProxyMarkedFunction<T> = T &
    Comlink.ProxyMarked;


interface IDownloadFileOptions {
    onProgress?: (progress: ICommon.IDownloadFileSize) => void;
    onEnded?: () => void;
    onError?: (reason: Error) => void;
}

interface IDownloaderWorker {
    downloadFileNew: (mediaSource: IMusic.IMusicSource,
        filePath: string, options?: ProxyMarkedFunction<IDownloadFileOptions>) => void
}


export enum DownloaderEvent {
    DOWNLOAD_STATE_CHANGED = "downloader:download-state-changed",
    QUEUE_UPDATED = "queue_updated",
}

interface IDownloaderEvent {
    [DownloaderEvent.DOWNLOAD_STATE_CHANGED]: (musicItem: IMusic.IMusicItem, status: ITaskStatus) => void;
}

interface ITaskStatus {
    status: DownloadState,
    progress?: ICommon.IDownloadFileSize,
    error?: Error
}

class Downloader extends EventEmitter<IDownloaderEvent> {
    private worker: IDownloaderWorker;
    private static ConcurrencyLimit = 20;
    private downloadTaskQueue: PQueue;
    private currentTaskStatus: Map<string, Map<string, ITaskStatus>> = new Map();

    public isReady = false;

    constructor() {
        super();

        this.on(DownloaderEvent.DOWNLOAD_STATE_CHANGED, (...args) => {
            console.log("DOWNLOAD STATE CHANGE", ...args);
            console.log(this.downloadTaskQueue);
        });


    }

    public async setup() {
        // 1. config
        const downloadConcurrency = AppConfig.getConfig("download.concurrency");

        // 2. init worker
        const workerPath = getGlobalContext().workersPath.downloader;
        if (workerPath) {
            const worker = new Worker(workerPath);
            this.worker = Comlink.wrap(worker);
            this.isReady = true;
        } else {
            logger.logInfo("Worker path is not defined");
        }

        // 3. setup downloading queue
        this.downloadTaskQueue = new PQueue({
            concurrency: downloadConcurrency || 5,
            autoStart: false,
        });
        // @ts-ignore
        window.dd = this.downloadTaskQueue;

        // 4. setup musicsheet
        setupDownloadedMusicList();
    }

    public async download(musicItems: IMusic.IMusicItem | IMusic.IMusicItem[]) {
        if (!this.worker) {
            await this.setup();
        }

        const _musicItems = Array.isArray(musicItems) ? musicItems : [musicItems];
        // 过滤掉已下载的、本地音乐、任务中的音乐
        const _validMusicItems = _musicItems.filter(
            (it) => !isDownloaded(it) && it.platform !== localPluginName,
        );

        const downloadTasks = _validMusicItems.map((it) => {

            this.setTaskStatus(it, {
                status: DownloadState.WAITING,
            });


            const task = async () => {
                if (!this.getTaskStatus(it)) {
                    return;
                }
                this.setTaskStatus(it, {
                    status: DownloadState.DOWNLOADING,
                    progress: {
                        currentSize: NaN,
                        totalSize: NaN,
                    },
                });

                const fileName = `${it.title}-${it.artist}`.replace(/[/|\\?*"<>:]/g, "_");

                await new Promise<void>((resolve) => {
                    this.downloadMusicImpl(it, fileName, {
                        onError: (e) => {
                            this.setTaskStatus(it, {
                                status: DownloadState.ERROR,
                                error: e,
                            });
                            resolve();
                        },
                        onProgress: (progress) => {
                            this.setTaskStatus(it, {
                                status: DownloadState.DOWNLOADING,
                                progress,
                            });
                        },
                        onEnded: () => {
                            this.setTaskStatus(it, {
                                status: DownloadState.DONE,
                            });
                            downloadingMusicStore.setValue((prev) =>
                                prev.filter((di) => !isSameMedia(it, di)),
                            );
                            resolve();
                        },
                    }).catch((e) => {
                        this.setTaskStatus(it, {
                            status: DownloadState.ERROR,
                            error: e,
                        });
                        resolve();
                    });

                });
            };

            task.musicItem = it;
            return task;
        });

        this.downloadTaskQueue.addAll(downloadTasks);
        downloadingMusicStore.setValue((prev) => [...prev, ..._validMusicItems]);
    }

    private async downloadMusicImpl(musicItem: IMusic.IMusicItem, fileName: string, options: IDownloadFileOptions) {
        const [defaultQuality, whenQualityMissing] = [
            AppConfig.getConfig("download.defaultQuality"),
            AppConfig.getConfig("download.whenQualityMissing"),
        ];
        const downloadBasePath =
            AppConfig.getConfig("download.path") ??
            getGlobalContext().appPath.downloads;

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
            } catch {
                // pass
            }
        }

        if (mediaSource?.url) {
            const ext = mediaSource.url.match(/.*\/.+\.([^./?#&]+)/)?.[1] ?? "mp3";

            const downloadPath = window.path.resolve(
                downloadBasePath,
                `./${fileName}.${ext}`,
            );
            this.worker.downloadFileNew(
                mediaSource,
                downloadPath,
                Comlink.proxy({
                    onError(reason) {
                        options?.onError(reason);
                    },
                    onProgress(progress) {
                        options?.onProgress?.(progress);
                    },
                    async onEnded() {
                        try {
                            await writeMusicTags(musicItem, downloadPath);
                        } catch (e) {
                            console.warn("[Downloader] Failed to write tags:", e);
                        }
                        options?.onEnded?.();
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
                    },
                }),
            );
        } else {
            throw new Error("Invalid Source");
        }

    }

    public setConcurrency(concurrency: number) {
        if (this.downloadTaskQueue) {
            this.downloadTaskQueue.concurrency = Math.min(
                concurrency < 1 ? 1 : concurrency,
                Downloader.ConcurrencyLimit,
            );
        }
    }

    public getTaskStatus(musicItem: IMusic.IMusicItem): ITaskStatus | null {
        const platform = "" + musicItem.platform;
        const id = "" + musicItem.id;

        return this.currentTaskStatus.get(platform)?.get(id) ?? null;
    }

    private setTaskStatus(musicItem: IMusic.IMusicItem, taskStatus: ITaskStatus) {
        const platform = "" + musicItem.platform;
        const id = "" + musicItem.id;

        if (!this.currentTaskStatus.has(platform)) {
            this.currentTaskStatus.set(platform, new Map());
        }

        if (taskStatus.status === DownloadState.DONE) {
            this.currentTaskStatus.get(platform)?.delete(id);
        } else {
            this.currentTaskStatus.get(platform)?.set(id, taskStatus);
        }
        this.emit(DownloaderEvent.DOWNLOAD_STATE_CHANGED, musicItem, taskStatus);
    }
}


async function writeMusicTags(musicItem: IMusic.IMusicItem, filePath: string) {
    console.log("[Downloader] writeMusicTags called for:", musicItem.title, "path:", filePath);
    const ext = filePath.split(".").pop()?.toLowerCase();
    if (ext !== "mp3" && ext !== "flac") {
        console.log("[Downloader] Skipping tag write for unsupported format:", ext);
        return;
    }

    const tags: import("@shared/music-tag/renderer").IMusicTags = {
        title: musicItem.title,
        artist: musicItem.artist,
        album: musicItem.album,
    };

    console.log("[Downloader] Getting lyrics for:", musicItem.title);
    try {
        const lyricSource = await PluginManager.callPluginDelegateMethod(
            musicItem,
            "getLyric",
            musicItem,
        );
        console.log("[Downloader] Lyric source result:", lyricSource ? "found" : "not found");
        if (lyricSource?.rawLrc) {
            tags.lyrics = lyricSource.rawLrc;
            console.log("[Downloader] Lyrics added, length:", lyricSource.rawLrc.length);
        }
    } catch (e) {
        console.warn("[Downloader] Failed to get lyrics:", e);
    }

    console.log("[Downloader] Getting artwork for:", musicItem.title, "artwork:", musicItem.artwork ? "exists" : "none");
    if (musicItem.artwork) {
        try {
            let artworkBase64: string;
            if (musicItem.artwork.startsWith("data:")) {
                artworkBase64 = musicItem.artwork;
            } else {
                console.log("[Downloader] Fetching artwork from URL:", musicItem.artwork);
                const response = await fetch(musicItem.artwork);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);
                let binary = "";
                for (let i = 0; i < uint8Array.length; i++) {
                    binary += String.fromCharCode(uint8Array[i]);
                }
                const base64 = btoa(binary);
                const mimeType = blob.type || "image/jpeg";
                artworkBase64 = `data:${mimeType};base64,${base64}`;
            }
            tags.artwork = artworkBase64;
            console.log("[Downloader] Artwork added, length:", artworkBase64.length);
        } catch (e) {
            console.warn("[Downloader] Failed to get artwork:", e);
        }
    }

    console.log("[Downloader] Writing tags to file:", filePath);
    const result = await MusicTag.writeTags(filePath, tags);
    if (!result.success) {
        console.warn("[Downloader] Failed to write tags:", result.error);
    } else {
        console.log("[Downloader] Tags written successfully for:", musicItem.title);
    }
}


export default new Downloader();
