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

interface IMod {
    searchBaidu: (query: string) => Promise<ISearchResult[]>;
    searchBing: (query: string) => Promise<ISearchResult[]>;
    setSearchEngine: (engine: SearchEngine) => Promise<boolean>;
    getSearchEngine: () => Promise<SearchEngine>;
    searchMusicInfo: (title: string, artist?: string, album?: string) => Promise<IMusicSearchResult>;
}

const mod = window["@shared/music-search" as any] as unknown as IMod;

const MusicSearch = {
    searchBaidu: mod?.searchBaidu ?? (async () => []),
    searchBing: mod?.searchBing ?? (async () => []),
    setSearchEngine: mod?.setSearchEngine ?? (async () => false),
    getSearchEngine: mod?.getSearchEngine ?? (async () => "baidu" as SearchEngine),
    searchMusicInfo: mod?.searchMusicInfo ?? (async () => ({ songInfo: {}, searchResults: [] })),
};

export default MusicSearch;

export type { ISearchResult, IMusicSearchResult, SearchEngine };
