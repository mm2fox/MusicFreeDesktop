import Dexie, { Table } from "dexie";

interface ITranslationRecord {
    key: string;
    translation: string;
    timestamp: number;
}

class TranslationDB extends Dexie {
    translations!: Table<ITranslationRecord>;

    constructor() {
        super("translationCacheDB");
        this.version(1).stores({
            translations: "&key",
        });
    }
}

const db = new TranslationDB();

function getMusicKey(musicItem: IMusic.IMusicItem | null): string | null {
    if (!musicItem) return null;
    return `${musicItem.platform}_${musicItem.id}`;
}

export async function getCachedTranslation(
    musicItem: IMusic.IMusicItem | null
): Promise<string | null> {
    const key = getMusicKey(musicItem);
    if (!key) return null;
    
    try {
        const record = await db.translations.get(key);
        return record?.translation ?? null;
    } catch {
        return null;
    }
}

export async function saveCachedTranslation(
    musicItem: IMusic.IMusicItem | null,
    translation: string
): Promise<void> {
    const key = getMusicKey(musicItem);
    if (!key || !translation) return;
    
    try {
        await db.translations.put({
            key,
            translation,
            timestamp: Date.now(),
        });
    } catch {
        // ignore
    }
}

export async function clearAllCachedTranslations(): Promise<void> {
    try {
        await db.translations.clear();
    } catch {
        // ignore
    }
}

export default {
    getCachedTranslation,
    saveCachedTranslation,
    clearAllCachedTranslations,
};
