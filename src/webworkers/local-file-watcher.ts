import * as Comlink from "comlink";
import * as chokidar from "chokidar";
import path from "path";
import fs from "fs";
import { supportLocalMediaType } from "@/common/constant";
import { parseLocalMusicItemWithoutTags } from "@/common/file-util";
import { setInternalData } from "@/common/media-util";

let watcher: chokidar.FSWatcher | null = null;

const SCAN_DELAY = 200;

let _onAdd: ((musicItems: IMusic.IMusicItem[]) => Promise<void> | void) | null = null;
let _onRemove: ((filePaths: string[]) => Promise<void> | void) | null = null;

let isProcessing = false;
let pendingFiles: string[] = [];
let pendingRemoves: string[] = [];
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let currentWatchPaths: string[] = [];
let reconnectAttempts = 0;
let isReconnecting = false;
let watcherClosed = false;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 10000;

const processedFiles = new Set<string>();
const MAX_PROCESSED_FILES = 50000;
let ignoreRemoveEvents = false;

function addToProcessedFiles(filePath: string) {
    if (processedFiles.size >= MAX_PROCESSED_FILES) {
        const iterator = processedFiles.values();
        const toDelete = Math.floor(MAX_PROCESSED_FILES * 0.2);
        for (let i = 0; i < toDelete; i++) {
            const oldest = iterator.next().value;
            if (oldest) {
                processedFiles.delete(oldest);
            }
        }
    }
    processedFiles.add(filePath);
}

async function processFileQueue() {
    if (isProcessing) {
        return;
    }

    if (pendingFiles.length === 0 && pendingRemoves.length === 0) {
        return;
    }

    isProcessing = true;

    try {
        if (pendingRemoves.length > 0) {
            const allRemoves = [...pendingRemoves];
            pendingRemoves = [];
            await _onRemove?.(allRemoves);
        }

        if (pendingFiles.length > 0) {
            const BATCH_SIZE = 50;

            while (pendingFiles.length > 0) {
                const batch = pendingFiles.splice(0, BATCH_SIZE);
                const addedMusicItems: IMusic.IMusicItem[] = [];

                const parsePromises = batch.map(async (fp) => {
                    if (processedFiles.has(fp)) {
                        return null;
                    }

                    try {
                        const musicItem = await parseLocalMusicItemWithoutTags(fp);
                        musicItem.$$localPath = fp;
                        setInternalData<IMusic.IMusicItemInternalData>(
                            musicItem,
                            "downloadData",
                            {
                                path: fp,
                                quality: "standard",
                            },
                        );
                        addToProcessedFiles(fp);
                        return musicItem;
                    } catch (e) {
                        console.error("[LocalFileWatcher] Failed to parse:", fp, e);
                        return null;
                    }
                });

                const results = await Promise.all(parsePromises);
                for (const musicItem of results) {
                    if (musicItem) {
                        addedMusicItems.push(musicItem);
                    }
                }

                if (addedMusicItems.length > 0) {
                    await _onAdd?.(addedMusicItems);
                }

                if (pendingFiles.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        }
    } finally {
        isProcessing = false;
    }
}

function queueFile(fp: string) {
    if (processedFiles.has(fp)) {
        return;
    }

    if (!pendingFiles.includes(fp)) {
        pendingFiles.push(fp);
    }

    scheduleProcess();
}

function queueRemove(fp: string) {
    if (ignoreRemoveEvents) {
        return;
    }

    // 检查文件是否真的被删除了（解决根目录监听时的误报问题）
    try {
        const exists = fs.existsSync(fp);
        if (exists) {
            return;
        }
    } catch (e) {
        // 忽略错误
    }

    processedFiles.delete(fp);

    const index = pendingFiles.indexOf(fp);
    if (index > -1) {
        pendingFiles.splice(index, 1);
    }

    if (!pendingRemoves.includes(fp)) {
        pendingRemoves.push(fp);
    }

    scheduleProcess();
}

function scheduleProcess() {
    if (scanTimer) {
        return;
    }

    scanTimer = setTimeout(() => {
        scanTimer = null;
        processFileQueue();
    }, SCAN_DELAY);
}

async function handleWatcherError(error: Error) {
    console.error("[LocalFileWatcher] Watcher error:", error.message);

    if (watcherClosed || isReconnecting) return;

    if (error.message?.includes("ECONNRESET") || error.message?.includes("ENOTCONN") || error.message?.includes("EPERM")) {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            isReconnecting = true;
            reconnectAttempts++;

            setTimeout(async () => {
                try {
                    await restartWatcher();
                } finally {
                    isReconnecting = false;
                }
            }, RECONNECT_DELAY);
        } else {
            console.error("[LocalFileWatcher] Max reconnect attempts reached. Stopping watcher.");
            watcherClosed = true;
            try {
                await watcher?.close();
            } catch { }
        }
    }
}

async function restartWatcher() {
    try {
        if (watcher) {
            try {
                await watcher.close();
            } catch { }
        }
        await createWatcher(currentWatchPaths, true);
    } catch (e) {
        console.error("[LocalFileWatcher] Reconnect failed:", e);
    }
}

async function createWatcher(initPaths?: string[], skipInitialScan = false) {
    watcherClosed = false;

    watcher = chokidar.watch(initPaths ?? [], {
        depth: 10,
        persistent: true,
        ignorePermissionErrors: true,
        usePolling: true,
        interval: 10000,
        binaryInterval: 20000,
        ignoreInitial: skipInitialScan,
        awaitWriteFinish: {
            stabilityThreshold: 5000,
            pollInterval: 1000,
        },
    });

    watcher.on("add", (fp, stats) => {
        if (watcherClosed) return;
        if (
            stats.isFile() &&
            supportLocalMediaType.some((postfix) => fp.endsWith(postfix))
        ) {
            queueFile(fp);
        }
    });

    watcher.on("ready", () => {
        if (watcherClosed) return;
        reconnectAttempts = 0;
    });

    watcher.on("error", handleWatcherError);

    watcher.on("unlink", (fp) => {
        if (watcherClosed) return;
        if (supportLocalMediaType.some((postfix) => fp.endsWith(postfix))) {
            queueRemove(fp);
        }
    });
}

async function setupWatcher(initPaths?: string[]) {
    pendingFiles = [];
    pendingRemoves = [];
    isProcessing = false;
    currentWatchPaths = initPaths || [];
    reconnectAttempts = 0;
    isReconnecting = false;
    watcherClosed = false;
    processedFiles.clear();
    ignoreRemoveEvents = false;

    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }

    await createWatcher(initPaths, false);
}

async function flush() {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    await processFileQueue();
}

async function changeWatchPath(addPaths?: string[], rmPaths?: string[]) {
    if (watcherClosed && addPaths?.length) {
        currentWatchPaths = [...addPaths];
        reconnectAttempts = 0;
        isReconnecting = false;
        processedFiles.clear();
        await createWatcher(addPaths, false);
        return;
    }

    try {
        if (addPaths?.length) {
            watcher.add(addPaths);
            currentWatchPaths.push(...addPaths);
        }
        if (rmPaths?.length) {
            // 暂时忽略删除事件，避免取消监听时触发大量删除
            ignoreRemoveEvents = true;
            // 清空待删除队列，避免处理之前积累的删除事件
            pendingRemoves = [];
            watcher.unwatch(rmPaths);
            rmPaths.forEach((it) => {
                // @ts-ignore
                const watchedDirEntry = watcher._watched.get(it);
                if (watchedDirEntry) {
                    watchedDirEntry._removeWatcher(
                        path.dirname(it),
                        path.basename(it),
                        true,
                    );
                }
                const index = currentWatchPaths.indexOf(it);
                if (index > -1) {
                    currentWatchPaths.splice(index, 1);
                }
            });
            // 延迟恢复删除事件监听，等待 unwatch 完成
            setTimeout(() => {
                ignoreRemoveEvents = false;
            }, 2000);
        }
    } catch (e) {
        console.error("[LocalFileWatcher] changeWatchPath error:", e);
    }
}

async function onAdd(fn: (musicItems: IMusic.IMusicItem[]) => void) {
    _onAdd = fn;
}

async function onRemove(fn: (filePaths: string[]) => void) {
    _onRemove = fn;
}

async function resetProcessedFiles() {
    processedFiles.clear();
}

async function rescan() {
    if (!currentWatchPaths || currentWatchPaths.length === 0) {
        return;
    }

    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }

    ignoreRemoveEvents = true;
    processedFiles.clear();
    pendingFiles = [];
    pendingRemoves = [];

    for (const watchPath of currentWatchPaths) {
        try {
            await scanDirectory(watchPath);
        } catch (e) {
            console.error("[LocalFileWatcher] Failed to scan:", watchPath, e);
        }
    }

    while (pendingFiles.length > 0 || isProcessing) {
        if (!isProcessing) {
            await processFileQueue();
        }
        if (pendingFiles.length > 0 || isProcessing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    setTimeout(() => {
        ignoreRemoveEvents = false;
    }, 1000);
}

async function scanDirectory(dirPath: string) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
            await scanDirectory(fullPath);
        } else if (file.isFile() && supportLocalMediaType.some((postfix) => fullPath.endsWith(postfix))) {
            if (!processedFiles.has(fullPath) && !pendingFiles.includes(fullPath)) {
                pendingFiles.push(fullPath);
            }
        }
    }
}

async function terminate() {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }

    pendingFiles = [];
    pendingRemoves = [];
    isProcessing = false;
    processedFiles.clear();
    currentWatchPaths = [];
    _onAdd = null;
    _onRemove = null;

    if (watcher) {
        try {
            await watcher.close();
        } catch (e) {
            console.error("[LocalFileWatcher] Error closing watcher:", e);
        }
        watcher = null;
    }
}

Comlink.expose({
    setupWatcher,
    changeWatchPath,
    onAdd,
    onRemove,
    flush,
    resetProcessedFiles,
    rescan,
    terminate,
});
