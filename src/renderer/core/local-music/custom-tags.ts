import Store from "@/common/store";
import localMusicListStore from "./store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";

export type LocalMusicItem = IMusic.IMusicItem & {
    $$localPath: string;
    $$customTags?: string[];
};

const allCustomTagsStore = new Store<string[]>([]);

function updateAllTagsStore() {
    const musicList = localMusicListStore.getValue();
    const tagSet = new Set<string>();
    
    musicList.forEach(item => {
        if (item.$$customTags && item.$$customTags.length > 0) {
            item.$$customTags.forEach(tag => tagSet.add(tag));
        }
    });
    
    allCustomTagsStore.setValue(Array.from(tagSet).sort((a, b) => a.localeCompare(b)));
}

export function getAllCustomTags(): string[] {
    return allCustomTagsStore.getValue();
}

export function useAllCustomTags(): string[] {
    return allCustomTagsStore.useValue();
}

export function getMusicTags(musicItem: IMusic.IMusicItem): string[] {
    const localItem = musicItem as LocalMusicItem;
    return localItem.$$customTags || [];
}

export function hasTag(musicItem: IMusic.IMusicItem, tag: string): boolean {
    const tags = getMusicTags(musicItem);
    return tags.includes(tag);
}

export async function addTagToMusic(musicItem: IMusic.IMusicItem, tag: string): Promise<boolean> {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return false;
    
    const currentTags = getMusicTags(musicItem);
    if (currentTags.includes(trimmedTag)) return false;
    
    const newTags = [...currentTags, trimmedTag];
    
    try {
        await musicSheetDB.localMusicStore.update(
            [musicItem.platform, musicItem.id],
            { $$customTags: newTags },
        );
        
        const currentList = localMusicListStore.getValue();
        const updatedList = currentList.map(item => {
            if (item.id === musicItem.id && item.platform === musicItem.platform) {
                return { ...item, $$customTags: newTags };
            }
            return item;
        });
        localMusicListStore.setValue(updatedList);
        updateAllTagsStore();
        
        return true;
    } catch (e) {
        console.error("[CustomTags] Failed to add tag:", e);
        return false;
    }
}

export async function removeTagFromMusic(musicItem: IMusic.IMusicItem, tag: string): Promise<boolean> {
    const currentTags = getMusicTags(musicItem);
    const newTags = currentTags.filter(t => t !== tag);
    
    if (newTags.length === currentTags.length) return false;
    
    try {
        await musicSheetDB.localMusicStore.update(
            [musicItem.platform, musicItem.id],
            { $$customTags: newTags.length > 0 ? newTags : undefined },
        );
        
        const currentList = localMusicListStore.getValue();
        const updatedList = currentList.map(item => {
            if (item.id === musicItem.id && item.platform === musicItem.platform) {
                return { ...item, $$customTags: newTags.length > 0 ? newTags : undefined };
            }
            return item;
        });
        localMusicListStore.setValue(updatedList);
        updateAllTagsStore();
        
        return true;
    } catch (e) {
        console.error("[CustomTags] Failed to remove tag:", e);
        return false;
    }
}

export async function setMusicTags(musicItem: IMusic.IMusicItem, tags: string[]): Promise<boolean> {
    const cleanedTags = tags.map(t => t.trim()).filter(t => t.length > 0);
    
    try {
        await musicSheetDB.localMusicStore.update(
            [musicItem.platform, musicItem.id],
            { $$customTags: cleanedTags.length > 0 ? cleanedTags : undefined },
        );
        
        const currentList = localMusicListStore.getValue();
        const updatedList = currentList.map(item => {
            if (item.id === musicItem.id && item.platform === musicItem.platform) {
                return { ...item, $$customTags: cleanedTags.length > 0 ? cleanedTags : undefined };
            }
            return item;
        });
        localMusicListStore.setValue(updatedList);
        updateAllTagsStore();
        
        return true;
    } catch (e) {
        console.error("[CustomTags] Failed to set tags:", e);
        return false;
    }
}

export async function addTagToMultipleMusic(musicItems: IMusic.IMusicItem[], tag: string): Promise<number> {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return 0;
    
    let successCount = 0;
    
    for (const item of musicItems) {
        const result = await addTagToMusic(item, trimmedTag);
        if (result) successCount++;
    }
    
    return successCount;
}

export async function removeTagFromMultipleMusic(musicItems: IMusic.IMusicItem[], tag: string): Promise<number> {
    let successCount = 0;
    
    for (const item of musicItems) {
        const result = await removeTagFromMusic(item, tag);
        if (result) successCount++;
    }
    
    return successCount;
}

export function getMusicByTag(tag: string): LocalMusicItem[] {
    const musicList = localMusicListStore.getValue();
    return musicList.filter(item => item.$$customTags?.includes(tag));
}

export function initCustomTagsStore() {
    updateAllTagsStore();
}

export { allCustomTagsStore };

export async function autoTagFromArtist(musicItems: IMusic.IMusicItem[]): Promise<{ success: number; total: number }> {
    let successCount = 0;
    const total = musicItems.length;
    
    const updates: Array<{ platform: string; id: string; tags: string[] }> = [];
    
    for (const item of musicItems) {
        if (!item.artist) continue;
        
        const artistStr = item.artist.trim();
        if (!artistStr) continue;
        
        const artists = artistStr
            .split(/[,，、\/\\&]/)
            .map(a => a.trim())
            .filter(a => a.length > 0);
        
        if (artists.length === 0) continue;
        
        const currentTags = getMusicTags(item);
        const newTagsSet = new Set(currentTags);
        
        if (artists.length > 1) {
            newTagsSet.add("合唱");
        }
        
        const newTags = Array.from(newTagsSet);
        updates.push({ platform: item.platform, id: item.id, tags: newTags });
    }
    
    if (updates.length > 0) {
        const batchSize = 50;
        for (let i = 0; i < updates.length; i += batchSize) {
            const batch = updates.slice(i, i + batchSize);
            
            for (const update of batch) {
                try {
                    await musicSheetDB.localMusicStore.update(
                        [update.platform, update.id],
                        { $$customTags: update.tags },
                    );
                    successCount++;
                } catch (e) {
                    console.error("[CustomTags] Failed to update tag:", e);
                }
            }
        }
        
        const currentList = localMusicListStore.getValue();
        const updatedList = currentList.map(music => {
            const update = updates.find(u => u.id === music.id && u.platform === music.platform);
            if (update) {
                return { ...music, $$customTags: update.tags };
            }
            return music;
        });
        localMusicListStore.setValue(updatedList);
    }
    
    updateAllTagsStore();
    
    return { success: successCount, total };
}
