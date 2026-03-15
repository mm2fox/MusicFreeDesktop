import {
    getInternalData,
    getMediaPrimaryKey,
    setInternalData,
} from "@/common/media-util";
import { LRUCache } from "lru-cache";
import musicSheetDB from "../db/music-sheet-db";
import PluginManager from "@shared/plugin-manager/renderer";

const linkLyricCache = new LRUCache({
    max: 500,
    allowStale: false,
});

const linkLyricKey = "associatedLrc";

export async function linkLyric(
    from: IMusic.IMusicItem,
    to: IMusic.IMusicItem,
) {
    // 如果歌曲已经入库，更新数据库中的meta信息
    const filteredMusicItem: IMedia.IUnique & { rawLrcTxt?: string } = {
        platform: to.platform,
        id: to.id,
    };
    for (const toPk of PluginManager.getPluginPrimaryKey(to)) {
        filteredMusicItem[toPk] = to[toPk];
    }
    if ((to as ILyric.ILyricItem).rawLrcTxt) {
        filteredMusicItem.rawLrcTxt = (to as ILyric.ILyricItem).rawLrcTxt;
    }
    const fromPk = getMediaPrimaryKey(from);
    linkLyricCache.set(fromPk, filteredMusicItem);

    try {
        await musicSheetDB.transaction("rw", musicSheetDB.musicStore, async () => {
            const musicItem = await musicSheetDB.musicStore.get([
                from.platform,
                from.id,
            ]);
            if (musicItem) {
                await musicSheetDB.musicStore.put(
                    setInternalData(musicItem, linkLyricKey, filteredMusicItem, true),
                );
            }
        });
    } catch (e) {
        console.log(e);
    }

    try {
        await musicSheetDB.transaction("rw", musicSheetDB.localMusicStore, async () => {
            const localMusicItem = await musicSheetDB.localMusicStore.get([
                from.platform,
                from.id,
            ]);
            if (localMusicItem) {
                await musicSheetDB.localMusicStore.put(
                    setInternalData(localMusicItem, linkLyricKey, filteredMusicItem, true),
                );
            }
        });
    } catch (e) {
        console.log(e);
    }
}

export async function unlinkLyric(musicItem: IMusic.IMusicItem) {
    const pk = getMediaPrimaryKey(musicItem);
    const cachedItem = linkLyricCache.get(pk);
    if (cachedItem) {
        linkLyricCache.delete(pk);
    }

    try {
        await musicSheetDB.transaction("rw", musicSheetDB.musicStore, async () => {
            const dbMusicItem = await musicSheetDB.musicStore.get([
                musicItem.platform,
                musicItem.id,
            ]);
            if (dbMusicItem) {
                await musicSheetDB.musicStore.put(
                    setInternalData(dbMusicItem, linkLyricKey, undefined, true),
                );
            }
        });
    } catch { }

    try {
        await musicSheetDB.transaction("rw", musicSheetDB.localMusicStore, async () => {
            const dbLocalMusicItem = await musicSheetDB.localMusicStore.get([
                musicItem.platform,
                musicItem.id,
            ]);
            if (dbLocalMusicItem) {
                await musicSheetDB.localMusicStore.put(
                    setInternalData(dbLocalMusicItem, linkLyricKey, undefined, true),
                );
            }
        });
    } catch { }
}

export async function getLinkedLyric(musicItem: IMusic.IMusicItem) {
    const pk = getMediaPrimaryKey(musicItem);

    const cachedItem = linkLyricCache.get(pk);

    if (cachedItem) {
        return cachedItem as IMusic.IMusicItem;
    }
    try {
        const result = await musicSheetDB.transaction(
            "r",
            musicSheetDB.musicStore,
            async () => {
                const dbMusicItem = await musicSheetDB.musicStore.get([
                    musicItem.platform,
                    musicItem.id,
                ]);
                if (dbMusicItem) {
                    const linkedLyric = getInternalData(dbMusicItem, linkLyricKey);
                    return linkedLyric;
                }
            },
        );
        if (result) {
            linkLyricCache.set(pk, result);
            return result;
        }
    } catch (e) {
        console.log(e);
    }

    try {
        const result = await musicSheetDB.transaction(
            "r",
            musicSheetDB.localMusicStore,
            async () => {
                const dbLocalMusicItem = await musicSheetDB.localMusicStore.get([
                    musicItem.platform,
                    musicItem.id,
                ]);
                if (dbLocalMusicItem) {
                    const linkedLyric = getInternalData(dbLocalMusicItem, linkLyricKey);
                    return linkedLyric;
                }
            },
        );
        if (result) {
            linkLyricCache.set(pk, result);
            return result;
        }
    } catch (e) {
        console.log(e);
    }
    return null;
}

const translationCache = new LRUCache<string, string>({
    max: 500,
    allowStale: false,
});

export async function saveTranslation(
    musicItem: IMusic.IMusicItem,
    translation: string,
) {
    const pk = getMediaPrimaryKey(musicItem);
    translationCache.set(pk, translation);

    try {
        await musicSheetDB.translationStore.put({
            id: musicItem.id,
            platform: musicItem.platform,
            translation: translation,
            updatedAt: Date.now(),
        });
    } catch (e) {
        console.log(e);
    }
}

export async function getSavedTranslation(musicItem: IMusic.IMusicItem): Promise<string | null> {
    const pk = getMediaPrimaryKey(musicItem);

    const cachedTranslation = translationCache.get(pk);
    if (cachedTranslation) {
        return cachedTranslation;
    }

    try {
        const record = await musicSheetDB.translationStore.get([
            musicItem.platform,
            musicItem.id,
        ]);
        if (record?.translation) {
            translationCache.set(pk, record.translation);
            return record.translation;
        }
    } catch (e) {
        console.log(e);
    }

    return null;
}
