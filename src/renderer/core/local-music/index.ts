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
    resetProcessedFiles: () => Promise<void>;
    rescan: () => Promise<void>;
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

        if (!autoRefresh) {
            pendingAdds.length = 0;
            pendingRemoves.length = 0;
            return;
        }

        const currentList = localMusicListStore.getValue() || [];

        // 处理删除
        if (pendingRemoves.length > 0) {
            const removeSet = new Set(pendingRemoves);
            const filtered = currentList.filter(
                (it) => it && it.$$localPath && !removeSet.has(it.$$localPath),
            );
            pendingRemoves.length = 0;
            if (filtered.length !== currentList.length) {
                localMusicListStore.setValue(filtered);
            }
        }

        // 处理添加 - 限制每次最多添加 50 个
        if (pendingAdds.length > 0) {
            const MAX_ADD_PER_FLUSH = 50;
            const batchToAdd = pendingAdds.splice(0, MAX_ADD_PER_FLUSH);

            const currentListNow = localMusicListStore.getValue() || [];
            const existingPaths = new Set(
                currentListNow
                    .map((it) => it?.$$localPath)
                    .filter((p): p is string => typeof p === "string" && p.length > 0),
            );
            const newItems = batchToAdd.filter(
                (it) => {
                    if (!it || typeof it !== "object") return false;
                    const localPath = it.$$localPath;
                    if (typeof localPath !== "string" || localPath.length === 0) return false;
                    return !existingPaths.has(localPath);
                },
            );
            if (newItems.length > 0) {
                localMusicListStore.setValue([...currentListNow, ...newItems]);
            }

            // 如果还有剩余项目，继续调度刷新
            if (pendingAdds.length > 0) {
                scheduleFlush();
            }
        }
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

        const localFileWatcherWorkerPath =
            getGlobalContext().workersPath.localFileWatcher;
        if (localFileWatcherWorkerPath) {
            const worker = new Worker(localFileWatcherWorkerPath);
            localFileWatcherWorker = Comlink.wrap(worker);
            await localFileWatcherWorker.setupWatcher(localWatchDir);
        }

        // 加载已有本地音乐
        const allMusic = await musicSheetDB.localMusicStore.toArray();
        localMusicListStore.setValue(allMusic || []);

        // 设置文件添加回调
        if (localFileWatcherWorker) {
            localFileWatcherWorker.onAdd(
                Comlink.proxy(async (musicItems: IMusicItemWithLocalPath[]) => {
                    try {
                        if (!Array.isArray(musicItems) || musicItems.length === 0) return;

                        const validItems = musicItems.filter(
                            (it) => it && typeof it === "object" && it.$$localPath,
                        );
                        if (validItems.length === 0) return;

                        // 分批写入数据库，每次最多 10 个
                        const batchSize = 10;
                        for (let i = 0; i < validItems.length; i += batchSize) {
                            const batch = validItems.slice(i, i + batchSize);
                            await musicSheetDB.localMusicStore.bulkPut(batch);
                        }

                        // 添加到待刷新列表
                        pendingAdds.push(...validItems);
                        scheduleFlush();
                    } catch (e) {
                        console.error("[LocalMusic] onAdd error:", e);
                    }
                }),
            );

            // 设置文件删除回调
            localFileWatcherWorker.onRemove(
                Comlink.proxy(async (filePaths: string[]) => {
                    try {
                        if (!Array.isArray(filePaths) || filePaths.length === 0) return;

                        const validPaths = filePaths.filter(
                            (p) => typeof p === "string" && p.length > 0,
                        );
                        if (validPaths.length === 0) return;

                        // 从数据库中删除
                        const tobeDeletedFilePaths = new Set(validPaths);
                        const allMusic = await musicSheetDB.localMusicStore.toArray();

                        const tobeDeletedPrimaryKeys: any[] = [];
                        for (const it of allMusic) {
                            if (it?.$$localPath && tobeDeletedFilePaths.has(it.$$localPath)) {
                                tobeDeletedPrimaryKeys.push([it.platform, it.id]);
                            }
                        }

                        if (tobeDeletedPrimaryKeys.length > 0) {
                            await musicSheetDB.localMusicStore.bulkDelete(tobeDeletedPrimaryKeys);
                        }

                        // 添加到待刷新列表
                        pendingRemoves.push(...validPaths);
                        scheduleFlush();
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

        // 删除文件夹时，同时删除该文件夹下的所有音乐
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

        // 更新监听器
        if (localFileWatcherWorker) {
            await localFileWatcherWorker.changeWatchPath(tobeAddedPaths, tobeDeletedPaths);
            await localFileWatcherWorker.flush();
            await new Promise(resolve => setTimeout(resolve, 600));
        }

        // 刷新列表
        localMusicListStore.setValue(await musicSheetDB.localMusicStore.toArray() || []);
    } catch (e) {
        console.error("[LocalMusic] changeWatchPath error:", e);
    }
}

async function clearLocalMusic() {
    pendingAdds.length = 0;
    pendingRemoves.length = 0;
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    await musicSheetDB.localMusicStore.clear();
    localMusicListStore.setValue([]);
    if (localFileWatcherWorker) {
        await localFileWatcherWorker.rescan();
    }
}

async function rescanLocalMusic() {
    pendingAdds.length = 0;
    pendingRemoves.length = 0;
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (localFileWatcherWorker) {
        await localFileWatcherWorker.resetProcessedFiles();
        await localFileWatcherWorker.rescan();
        await localFileWatcherWorker.flush();
    }
}

export default {
    setupLocalMusic,
    changeWatchPath,
    clearLocalMusic,
    rescanLocalMusic,
};
