import * as Comlink from "comlink";
import * as chokidar from "chokidar";
import path from "path";
import { supportLocalMediaType } from "@/common/constant";
import { parseLocalMusicItem } from "@/common/file-util";
import { setInternalData } from "@/common/media-util";

let watcher: chokidar.FSWatcher;

const BATCH_SIZE = 20;
const SCAN_DELAY = 200;

let _onAdd: (musicItems: IMusic.IMusicItem[]) => void;
let _onRemove: (filePaths: string[]) => void;

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
let lastProcessTime = 0;
const MIN_PROCESS_INTERVAL = 2000;

async function processFileQueue() {
    if (isProcessing) {
        return;
    }
    
    const now = Date.now();
    if (now - lastProcessTime < MIN_PROCESS_INTERVAL) {
        return;
    }
    
    if (pendingFiles.length === 0 && pendingRemoves.length === 0) {
        return;
    }
    
    isProcessing = true;
    lastProcessTime = now;
    
    try {
        // 处理删除
        if (pendingRemoves.length > 0) {
            const batch = pendingRemoves.splice(0, BATCH_SIZE);
            _onRemove?.(batch);
        }
        
        // 处理添加
        if (pendingFiles.length > 0) {
            const addedMusicItems: IMusic.IMusicItem[] = [];
            const batch = pendingFiles.splice(0, BATCH_SIZE);
            
            for (const fp of batch) {
                if (processedFiles.has(fp)) {
                    continue;
                }
                
                try {
                    const musicItem = await parseLocalMusicItem(fp);
                    musicItem.$$localPath = fp;
                    setInternalData<IMusic.IMusicItemInternalData>(
                        musicItem,
                        "downloadData",
                        {
                            path: fp,
                            quality: "standard",
                        },
                    );
                    addedMusicItems.push(musicItem);
                    processedFiles.add(fp);
                } catch (e) {
                    console.error("[LocalFileWatcher] Failed to parse:", fp, e);
                }
            }
            
            if (addedMusicItems.length > 0) {
                _onAdd?.(addedMusicItems);
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
            console.log(`[LocalFileWatcher] Attempting reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_DELAY}ms...`);
            
            setTimeout(async () => {
                try {
                    await restartWatcher();
                } finally {
                    isReconnecting = false;
                }
            }, RECONNECT_DELAY);
        } else {
            console.error("[LocalFileWatcher] Max reconnect attempts reached. Stopping watcher. Network may be unstable.");
            watcherClosed = true;
            try {
                await watcher?.close();
            } catch {}
        }
    }
}

async function restartWatcher() {
    try {
        if (watcher) {
            try {
                await watcher.close();
            } catch {}
        }
        await createWatcher(currentWatchPaths, true);
        console.log("[LocalFileWatcher] Reconnected successfully");
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

    console.log("[LocalFileWatcher] Setting up watcher for paths:", initPaths, "skipInitialScan:", skipInitialScan);

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
        console.log("[LocalFileWatcher] Initial scan complete");
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
    lastProcessTime = 0;
    
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
    console.log("[LocalFileWatcher] changeWatchPath:", addPaths, rmPaths);
    
    if (watcherClosed && addPaths?.length) {
        console.log("[LocalFileWatcher] Watcher was closed, restarting with new paths...");
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

Comlink.expose({
    setupWatcher,
    changeWatchPath,
    onAdd,
    onRemove,
    flush,
});
