import * as Comlink from "comlink";
import * as chokidar from "chokidar";
import path from "path";
import { supportLocalMediaType } from "@/common/constant";
import debounce from "lodash.debounce";
import { parseLocalMusicItem } from "@/common/file-util";
import { setInternalData } from "@/common/media-util";

let watcher: chokidar.FSWatcher;

const addedMusicItems: IMusic.IMusicItem[] = [];
const removedFilePaths: string[] = [];

let _onAdd: (musicItems: IMusic.IMusicItem[]) => void;
let _onRemove: (filePaths: string[]) => void;

async function setupWatcher(initPaths?: string[]) {
    watcher = chokidar.watch(initPaths ?? [], {
        depth: 10,
        persistent: true,
        ignorePermissionErrors: true,
        usePolling: true,
        interval: 1000,
        binaryInterval: 3000,
        ignoreInitial: false,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100,
        },
    });

    console.log("[LocalFileWatcher] Setting up watcher for paths:", initPaths);

    watcher.on("add", async (fp, stats) => {
        if (
            stats.isFile() &&
      supportLocalMediaType.some((postfix) => fp.endsWith(postfix))
        ) {
            console.log("[LocalFileWatcher] Found file:", fp);
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
                syncAddedMusic();
            } catch (e) {
                console.error("[LocalFileWatcher] Failed to parse:", fp, e);
            }
        }
    });

    watcher.on("ready", () => {
        console.log("[LocalFileWatcher] Initial scan complete");
    });

    watcher.on("error", (error) => {
        console.error("[LocalFileWatcher] Watcher error:", error);
    });

    watcher.on("unlink", (fp) => {
        if (supportLocalMediaType.some((postfix) => fp.endsWith(postfix))) {
            removedFilePaths.push(fp);
            syncRemovedFilePaths();
        }
    });
}

const syncAddedMusic = debounce(
    () => {
        const copyOfAddedMusicItems = [...addedMusicItems];
        addedMusicItems.length = 0;
        _onAdd?.(copyOfAddedMusicItems);
    },
    2000,
    {
        leading: false,
        trailing: true,
    },
);

const syncRemovedFilePaths = debounce(
    () => {
        const copyOfRemovedFilePaths = [...removedFilePaths];
        removedFilePaths.length = 0;
        _onRemove?.(copyOfRemovedFilePaths);
    },
    2000,
    {
        leading: false,
        trailing: true,
    },
);

async function flush() {
    syncAddedMusic.flush();
    syncRemovedFilePaths.flush();
    await new Promise(resolve => setTimeout(resolve, 100));
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
