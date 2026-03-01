import { contextBridge, ipcRenderer } from "electron";

interface IMusicTags {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    year?: string;
    date?: string;
    genre?: string;
    comment?: string;
    lyrics?: string;
    artwork?: string;
}

interface IMusicTagsResult {
    success: boolean;
    tags?: IMusicTags;
    error?: string;
}

async function readTags(filePath: string): Promise<IMusicTagsResult> {
    return await ipcRenderer.invoke("@shared/music-tag/read", filePath);
}

async function readTagsWithoutArtwork(filePath: string): Promise<IMusicTagsResult> {
    return await ipcRenderer.invoke("@shared/music-tag/read-without-artwork", filePath);
}

async function writeTags(filePath: string, tags: IMusicTags): Promise<IMusicTagsResult> {
    return await ipcRenderer.invoke("@shared/music-tag/write", filePath, tags);
}

async function refreshBatchTags(filePaths: string[]): Promise<{ success: number; fail: number }> {
    return await ipcRenderer.invoke("@shared/music-tag/refresh-batch", filePaths);
}

const mod = {
    readTags,
    readTagsWithoutArtwork,
    writeTags,
    refreshBatchTags,
};

contextBridge.exposeInMainWorld("@shared/music-tag", mod);
