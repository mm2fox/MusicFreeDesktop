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

let flushTimer: ReturnType<typeof setTimeout> | null = null;
const pendingAdds: IMusicItemWithLocalPath[] = [];
const pendingRemoves: string[] = [];

function scheduleFlush() {
    if (flushTimer) {
        clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
        flushTimer = null;
        doFlush();
    }, 500);
}

async function doFlush() {
    try {
        const autoRefresh = AppConfig.getConfig("localMusic.autoRefreshOnFileChange");
        console.log("[LocalMusic] doFlush: autoRefresh:", autoRefresh, "pendingAdds:", pendingAdds.length, "pendingRemoves:", pendingRemoves.length);
        
        // 暂时禁用自动刷新来测试
        pendingAdds.length = 0;
        pendingRemoves.length = 0;
        return;
        
        /*
        if (!autoRefresh) {
            pendingAdds.length = 0;
            pendingRemoves.length = 0;
            return;
        }

        const currentList = localMusicListStore.getValue() || [];
        
        if (pendingRemoves.length > 0) {
            const removeSet = new Set(pendingRemoves);
            const filtered = currentList.filter(
                (it) => it && it.$$localPath && !removeSet.has(it.$$localPath)
            );
            pendingRemoves.length = 0;
            if (filtered.length !== currentList.length) {
                console.log("[LocalMusic] doFlush: removing items, new length:", filtered.length);
                localMusicListStore.setValue(filtered);
            }
        }

        if (pendingAdds.length > 0) {
            const currentListNow = localMusicListStore.getValue() || [];
            const existingPaths = new Set(
                currentListNow
                    .map((it) => it?.$$localPath)
                    .filter((p): p is string => typeof p === "string" && p.length > 0)
            );
            const newItems = pendingAdds.filter(
                (it) => {
                    if (!it || typeof it !== "object") return false;
                    const localPath = it.$$localPath;
                    if (typeof localPath !== "string" || localPath.length === 0) return false;
                    return !existingPaths.has(localPath);
                }
            );
            pendingAdds.length = 0;
            console.log("[LocalMusic] doFlush: adding items:", newItems.length, "existing:", existingPaths.size);
            if (newItems.length > 0) {
                localMusicListStore.setValue([...currentListNow, ...newItems]);
            }
        }
        */
    } catch (e) {
        console.error("[LocalMusic] doFlush error:", e);
        pendingAdds.length = 0;
        pendingRemoves.length = 0;
    }
}

async function setupLocalMusic() {
    try {
        const localWatchDir =
            (await getUserPreferenceIDB("localWatchDirChecked")) ?? [];

        // 暂时禁用 Worker 来测试
        console.log("[LocalMusic] setupLocalMusic: Worker disabled for testing");
        /*
        const localFileWatcherWorkerPath =
            getGlobalContext().workersPath.localFileWatcher;
        if (localFileWatcherWorkerPath) {
            const worker = new Worker(localFileWatcherWorkerPath);
            localFileWatcherWorker = Comlink.wrap(worker);
            await localFileWatcherWorker.setupWatcher(localWatchDir);
        }
        */

        const allMusic = await musicSheetDB.localMusicStore.toArray();

        localMusicListStore.setValue(allMusic || []);
        
        /*
        if (localFileWatcherWorker) {
            localFileWatcherWorker.onAdd(
                Comlink.proxy(async (musicItems: IMusicItemWithLocalPath[]) => {
                    // 暂时禁用回调来测试
                    console.log("[LocalMusic] onAdd called with:", musicItems?.length, "items (disabled)");
                    return;
                    
                    try {
                        if (!Array.isArray(musicItems) || musicItems.length === 0) return;
                        
                        const validItems = musicItems.filter(
                            (it) => it && typeof it === "object" && it.$$localPath
                        );
                        if (validItems.length === 0) return;
                        
                        await musicSheetDB.localMusicStore.bulkPut(validItems);
                        pendingAdds.push(...validItems);
                        scheduleFlush();
                    } catch (e) {
                        console.error("[LocalMusic] onAdd error:", e);
                    }
                    
                }),
            );

            localFileWatcherWorker.onRemove(
                Comlink.proxy(async (filePaths: string[]) => {
                    // 暂时禁用回调来测试
                    console.log("[LocalMusic] onRemove called with:", filePaths?.length, "items (disabled)");
                    return;
                    
                    try {
                        if (!Array.isArray(filePaths) || filePaths.length === 0) return;
                        
                        const validPaths = filePaths.filter(
                            (p) => typeof p === "string" && p.length > 0
                        );
                        if (validPaths.length === 0) return;
                        
                        const tobeDeletedFilePaths = new Set(validPaths);
                        const allMusic = await musicSheetDB.localMusicStore.toArray();
                        const tobeDeletedPrimaryKeys: any[] = [];
                        allMusic.forEach((it) => {
                            if (it?.$$localPath && tobeDeletedFilePaths.has(it.$$localPath)) {
                                tobeDeletedPrimaryKeys.push([it.platform, it.id]);
                            }
                        });
                        if (tobeDeletedPrimaryKeys.length > 0) {
                            await musicSheetDB.localMusicStore.bulkDelete(tobeDeletedPrimaryKeys);
                        }
                        pendingRemoves.push(...validPaths);
                        scheduleFlush();
                    } catch (e) {
                        console.error("[LocalMusic] onRemove error:", e);
                    }
                    
                }),
            );
        }
        */
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
            const localFiles = localMusicListStore.getValue() || [];
            const tobeDeletedItems = localFiles
                .filter((it) => {
                    const localPath = it?.$$localPath;
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

        localMusicListStore.setValue(await musicSheetDB.localMusicStore.toArray() || []);
    } catch (e) {
        console.error("[LocalMusic] changeWatchPath error:", e);
    }
}

async function clearLocalMusic() {
    await musicSheetDB.localMusicStore.clear();
    localMusicListStore.setValue([]);
}

export default {
    setupLocalMusic,
    changeWatchPath,
    clearLocalMusic,
};
