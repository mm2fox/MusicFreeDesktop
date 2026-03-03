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
        
        artists.forEach(artist => newTagsSet.add(artist));
        
        if (artists.length > 1) {
            newTagsSet.add("合唱");
        }
        
        const newTags = Array.from(newTagsSet);
        
        try {
            await musicSheetDB.localMusicStore.update(
                [item.platform, item.id],
                { $$customTags: newTags },
            );
            
            const currentList = localMusicListStore.getValue();
            const updatedList = currentList.map(music => {
                if (music.id === item.id && music.platform === item.platform) {
                    return { ...music, $$customTags: newTags };
                }
                return music;
            });
            localMusicListStore.setValue(updatedList);
            
            successCount++;
        } catch (e) {
            console.error("[CustomTags] Failed to auto tag:", e);
        }
    }
    
    updateAllTagsStore();
    
    return { success: successCount, total };
}
