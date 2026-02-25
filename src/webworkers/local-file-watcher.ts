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

async function setupWatcher(initPaths?: string[]) {
    pendingFiles = [];
    isProcessing = false;
    
    watcher = chokidar.watch(initPaths ?? [], {
        depth: 10,
        persistent: true,
        ignorePermissionErrors: true,
        usePolling: false,
        ignoreInitial: false,
        awaitWriteFinish: {
            stabilityThreshold: 3000,
            pollInterval: 500,
        },
    });

    console.log("[LocalFileWatcher] Setting up watcher for paths:", initPaths);

    watcher.on("add", (fp, stats) => {
        if (
            stats.isFile() &&
            supportLocalMediaType.some((postfix) => fp.endsWith(postfix))
        ) {
            console.log("[LocalFileWatcher] Queuing file:", fp);
            queueFile(fp);
        }
    });

    watcher.on("ready", () => {
        console.log("[LocalFileWatcher] Initial scan complete, processing queue...");
        processFileQueue();
    });

    watcher.on("error", (error) => {
        console.error("[LocalFileWatcher] Watcher error:", error);
    });

    watcher.on("unlink", (fp) => {
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

async function flush() {
    if (scanTimer) {
        clearTimeout(scanTimer);
        scanTimer = null;
    }
    await processFileQueue();
}

async function changeWatchPath(addPaths?: string[], rmPaths?: string[]) {
    console.log(addPaths, rmPaths);
    try {
        if (addPaths?.length) {
            watcher.add(addPaths);
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
            });
        }
    } catch (e) {
        console.log(e);
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
