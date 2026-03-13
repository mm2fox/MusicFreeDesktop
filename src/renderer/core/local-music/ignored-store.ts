import Store from "@/common/store";

export interface IgnoredItem {
    platform: string;
    id: string;
    title: string;
    artist: string;
    removedAt: number;
}

const IGNORED_ITEMS_KEY = "local-music-ignored-items";

function loadIgnoredItems(): IgnoredItem[] {
    try {
        const data = localStorage.getItem(IGNORED_ITEMS_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveIgnoredItems(items: IgnoredItem[]): void {
    localStorage.setItem(IGNORED_ITEMS_KEY, JSON.stringify(items));
}

export const ignoredItemsStore = new Store<IgnoredItem[]>(loadIgnoredItems());

export function addToIgnored(item: IMusic.IMusicItem): void {
    const items = ignoredItemsStore.getValue();
    const exists = items.some(i => i.platform === item.platform && i.id === item.id);
    if (!exists) {
        const newItem: IgnoredItem = {
            platform: item.platform,
            id: item.id,
            title: item.title || "",
            artist: item.artist || "",
            removedAt: Date.now(),
        };
        const updated = [...items, newItem];
        saveIgnoredItems(updated);
        ignoredItemsStore.setValue(updated);
    }
}

export function removeFromIgnored(platform: string, id: string): void {
    const items = ignoredItemsStore.getValue();
    const updated = items.filter(i => !(i.platform === platform && i.id === id));
    saveIgnoredItems(updated);
    ignoredItemsStore.setValue(updated);
}

export function isInIgnored(platform: string, id: string): boolean {
    const items = ignoredItemsStore.getValue();
    return items.some(i => i.platform === platform && i.id === id);
}

export function clearIgnoredItems(): void {
    saveIgnoredItems([]);
    ignoredItemsStore.setValue([]);
}
