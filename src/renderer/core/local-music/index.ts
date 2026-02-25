import localMusicListStore from "./store";
import { getUserPreferenceIDB } from "@/renderer/utils/user-perference";
import * as Comlink from "comlink";
import musicSheetDB from "../db/music-sheet-db";
import { getGlobalContext } from "@/shared/global-context/renderer";
import AppConfig from "@shared/app-config/renderer";

type ProxyMarkedFunction<T extends (...args: any) => void> = T &
    Comlink.ProxyMarked;

type IMusicItemWithLocalPath = IMusic.IMusicItem & { $$localPath: string };

interface ILocalFileWatcherWorker {
    setupWatcher: (initPaths?: string[]) => Promise<void>;
    changeWatchPath: (addPaths?: string[], rmPaths?: string[]) => Promise<void>;
    onAdd: (
        cb: ProxyMarkedFunction<
            (musicItems: Array<IMusicItemWithLocalPath>) => Promise<void>
        >
    ) => void;
    onRemove: (
        cb: ProxyMarkedFunction<(filePaths: string[]) => Promise<void>>
    ) => void;
    flush: () => Promise<void>;
}

let localFileWatcherWorker: ILocalFileWatcherWorker;

function isSubDir(parent: string, target: string) {
    if (!target) return false;
    const relative = window.path.relative(parent, target);
    return (
        relative && !relative.startsWith("..") && !window.path.isAbsolute(relative)
    );
}

async function setupLocalMusic() {
    try {
        const localWatchDir =
            (await getUserPreferenceIDB("localWatchDirChecked")) ?? [];


        const localFileWatcherWorkerPath =
            getGlobalContext().workersPath.localFileWatcher;
        if (localFileWatcherWorkerPath) {
            const worker = new Worker(localFileWatcherWorkerPath);
            localFileWatcherWorker = Comlink.wrap(worker);
            await localFileWatcherWorker.setupWatcher(localWatchDir);
        }

        const allMusic = await musicSheetDB.localMusicStore.toArray();

        localMusicListStore.setValue(allMusic);
        
        if (localFileWatcherWorker) {
            localFileWatcherWorker.onAdd(
                Comlink.proxy(async (musicItems: IMusicItemWithLocalPath[]) => {
                    try {
                        await musicSheetDB.localMusicStore.bulkPut(musicItems);
                        const autoRefresh = AppConfig.getConfig("localMusic.autoRefreshOnFileChange");
                        if (autoRefresh) {
                            localMusicListStore.setValue(await musicSheetDB.localMusicStore.toArray());
                        }
                    } catch (e) {
                        console.error("[LocalMusic] onAdd error:", e);
                    }
                }),
            );

            localFileWatcherWorker.onRemove(
                Comlink.proxy(async (filePaths: string[]) => {
                    try {
                        const tobeDeletedFilePaths = new Set(filePaths);
                        const allMusic = await musicSheetDB.localMusicStore.toArray();
                        const tobeDeletedPrimaryKeys: any[] = [];
                        allMusic.forEach((it) => {
                            if (it.$$localPath && tobeDeletedFilePaths.has(it.$$localPath)) {
                                tobeDeletedPrimaryKeys.push([it.platform, it.id]);
                            }
                        });
                        if (tobeDeletedPrimaryKeys.length > 0) {
                            await musicSheetDB.localMusicStore.bulkDelete(tobeDeletedPrimaryKeys);
                        }
                        const autoRefresh = AppConfig.getConfig("localMusic.autoRefreshOnFileChange");
                        if (autoRefresh) {
                            localMusicListStore.setValue(await musicSheetDB.localMusicStore.toArray());
                        }
                    } catch (e) {
                        console.error("[LocalMusic] onRemove error:", e);
                    }
                }),
            );
        }
    } catch (e) {
        console.error("[LocalMusic] setupLocalMusic error:", e);
    }
}

async function changeWatchPath(logs: Map<string, "add" | "delete">) {
    try {
        const tobeDeletedPaths: string[] = [];
        const tobeAddedPaths: string[] = [];
        logs.forEach((action, dirPath) => {
            if (action === "delete") {
                tobeDeletedPaths.push(dirPath);
            } else {
                tobeAddedPaths.push(dirPath);
            }
        });

        if (tobeDeletedPaths.length) {
            const localFiles = localMusicListStore.getValue();
            const tobeDeletedItems = localFiles
                .filter((it) => {
                    const localPath = it.$$localPath;
                    if (!localPath) return false;
                    return tobeDeletedPaths.some((deletePath) =>
                        isSubDir(deletePath, localPath),
                    );
                })
                .map((it) => [it.platform, it.id]);
            if (tobeDeletedItems.length > 0) {
                await musicSheetDB.localMusicStore.bulkDelete(tobeDeletedItems);
            }
        }

        if (localFileWatcherWorker) {
            await localFileWatcherWorker.changeWatchPath(tobeAddedPaths, tobeDeletedPaths);
            await localFileWatcherWorker.flush();
            await new Promise(resolve => setTimeout(resolve, 600));
        }

        localMusicListStore.setValue(await musicSheetDB.localMusicStore.toArray());
    } catch (e) {
        console.error("[LocalMusic] changeWatchPath error:", e);
    }
}

// async function syncLocalMusic() {
//   ipcRendererSend("sync-local-music");
// }

async function clearLocalMusic() {
    await musicSheetDB.localMusicStore.clear();
    localMusicListStore.setValue([]);
}

export default {
    setupLocalMusic,
    // syncLocalMusic,
    changeWatchPath,
    clearLocalMusic,
};
