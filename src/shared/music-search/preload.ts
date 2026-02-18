import { contextBridge, ipcRenderer } from "electron";

type SearchEngine = "baidu" | "bing";

interface ISearchResult {
    title: string;
    snippet: string;
    url: string;
}

interface IMusicSearchResult {
    songInfo: {
        title?: string;
        artist?: string;
        album?: string;
        description?: string;
    };
    searchResults: ISearchResult[];
}

async function searchBaidu(query: string): Promise<ISearchResult[]> {
    return await ipcRenderer.invoke("@shared/music-search/baidu", query);
}

async function searchBing(query: string): Promise<ISearchResult[]> {
    return await ipcRenderer.invoke("@shared/music-search/bing", query);
}

async function setSearchEngine(engine: SearchEngine): Promise<boolean> {
    return await ipcRenderer.invoke("@shared/music-search/set-engine", engine);
}

async function getSearchEngine(): Promise<SearchEngine> {
    return await ipcRenderer.invoke("@shared/music-search/get-engine");
}

async function searchMusicInfo(title: string, artist?: string, album?: string): Promise<IMusicSearchResult> {
    return await ipcRenderer.invoke("@shared/music-search/baidu-music", title, artist, album);
}

const mod = {
    searchBaidu,
    searchBing,
    setSearchEngine,
    getSearchEngine,
    searchMusicInfo,
};

contextBridge.exposeInMainWorld("@shared/music-search", mod);
