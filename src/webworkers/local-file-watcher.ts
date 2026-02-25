import * as Comlink from "comlink";
import * as chokidar from "chokidar";
import path from "path";
import { supportLocalMediaType } from "@/common/constant";
import { parseLocalMusicItem } from "@/common/file-util";
import { setInternalData } from "@/common/media-util";

let watcher: chokidar.FSWatcher;

const addedMusicItems: IMusic.IMusicItem[] = [];
const removedFilePaths: string[] = [];
const BATCH_SIZE = 20;
const SCAN_DELAY = 100;

let _onAdd: (musicItems: IMusic.IMusicItem[]) => void;
let _onRemove: (filePaths: string[]) => void;

let isProcessing = false;
let pendingFiles: string[] = [];
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let currentWatchPaths: string[] = [];
let reconnectAttempts = 0;
let isReconnecting = false;
let watcherClosed = false;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 10000;

async function processFileQueue() {
    if (isProcessing || pendingFiles.length === 0) {
        return;
    }
    
    isProcessing = true;
    
    while (pendingFiles.length > 0) {
        const batch = pendingFiles.splice(0, BATCH_SIZE);
        
        for (const fp of batch) {
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
            } catch (e) {
                console.error("[LocalFileWatcher] Failed to parse:", fp, e);
            }
        }
        
        if (addedMusicItems.length > 0) {
            const copyOfAddedMusicItems = [...addedMusicItems];
            addedMusicItems.length = 0;
            _onAdd?.(copyOfAddedMusicItems);
        }
        
        if (pendingFiles.length > 0) {
            await new Promise(resolve => setTimeout(resolve, SCAN_DELAY));
        }
    }
    
    isProcessing = false;
}

function queueFile(fp: string) {
    if (!pendingFiles.includes(fp)) {
        pendingFiles.push(fp);
    }
    
    if (scanTimer) {
        clearTimeout(scanTimer);
    }
    scanTimer = setTimeout(() => {
        processFileQueue();
    }, 500);
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
        interval: 5000,
        binaryInterval: 10000,
        ignoreInitial: skipInitialScan,
        awaitWriteFinish: {
            stabilityThreshold: 3000,
            pollInterval: 500,
        },
    });

    console.log("[LocalFileWatcher] Setting up watcher for paths:", initPaths, "skipInitialScan:", skipInitialScan);

    watcher.on("add", (fp, stats) => {
        if (watcherClosed) return;
        if (
            stats.isFile() &&
            supportLocalMediaType.some((postfix) => fp.endsWith(postfix))
        ) {
            console.log("[LocalFileWatcher] Queuing file:", fp);
            queueFile(fp);
        }
    });

    watcher.on("ready", () => {
        if (watcherClosed) return;
        console.log("[LocalFileWatcher] Initial scan complete, processing queue...");
        reconnectAttempts = 0;
        processFileQueue();
    });

    watcher.on("error", handleWatcherError);

    watcher.on("unlink", (fp) => {
        if (watcherClosed) return;
        if (supportLocalMediaType.some((postfix) => fp.endsWith(postfix))) {
            const index = pendingFiles.indexOf(fp);
            if (index > -1) {
                pendingFiles.splice(index, 1);
            }
            removedFilePaths.push(fp);
            if (removedFilePaths.length > 0) {
                const batch = removedFilePaths.splice(0, BATCH_SIZE);
                _onRemove?.(batch);
            }
        }
    });
}

async function setupWatcher(initPaths?: string[]) {
    pendingFiles = [];
    isProcessing = false;
    currentWatchPaths = initPaths || [];
    reconnectAttempts = 0;
    isReconnecting = false;
    watcherClosed = false;
    
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
