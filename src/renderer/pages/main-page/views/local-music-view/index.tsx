import localMusicListStore from "@/renderer/core/local-music/store";
import { useTranslation } from "react-i18next";

import "./index.scss";
import { showModal } from "@/renderer/components/Modal";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useEffect, useState, useTransition } from "react";
import SwitchCase from "@/renderer/components/SwitchCase";
import ListView from "./views/list";
import ArtistView from "./views/artist";
import AlbumView from "./views/album";
import FolderView from "./views/folder";
import AppConfig from "@shared/app-config/renderer";
import { toast } from "react-toastify";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusic from "@/renderer/core/local-music";

enum DisplayView {
    LIST,
    ARTIST,
    ALBUM,
    FOLDER,
}

export default function LocalMusicView() {
    const { t } = useTranslation();
    const [displayView, setDisplayView] = useState(DisplayView.LIST);

    const localMusicList = localMusicListStore.useValue();
    const [inputSearch, setInputSearch] = useState("");
    const [filterMusicList, setFilterMusicList] = useState<
    IMusic.IMusicItem[] | null
    >(null);

    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (inputSearch.trim() === "") {
            setFilterMusicList(null);
        } else {
            startTransition(() => {
                const caseSensitive = AppConfig.getConfig(
                    "playMusic.caseSensitiveInSearch",
                );
                if (caseSensitive) {
                    setFilterMusicList(
                        localMusicListStore
                            .getValue()
                            .filter(
                                (item) =>
                                    item.title?.includes(inputSearch) ||
                  item.artist?.includes(inputSearch) ||
                  item.album?.includes(inputSearch),
                            ),
                    );
                } else {
                    const searchText = inputSearch.toLocaleLowerCase();
                    setFilterMusicList(
                        localMusicListStore
                            .getValue()
                            .filter(
                                (item) =>
                                    item.title?.toLocaleLowerCase()?.includes(searchText) ||
                  item.artist?.toLocaleLowerCase()?.includes(searchText) ||
                  item.album?.toLocaleLowerCase()?.includes(searchText),
                            ),
                    );
                }
            });
        }
    }, [inputSearch]);

    const finalMusicList = filterMusicList ?? localMusicList;
    const [refreshing, setRefreshing] = useState(false);
    const [rescanning, setRescanning] = useState(false);

    const handleRescan = async () => {
        if (rescanning) return;
        setRescanning(true);
        try {
            await localMusic.rescanLocalMusic();
            toast.success(t("local_music_page.rescan"));
        } catch (e) {
            console.error("[Rescan] Error:", e);
        } finally {
            setRescanning(false);
        }
    };

    const handleRefreshTags = async () => {
        if (refreshing) return;
        
        const musicList = localMusicListStore.getValue();
        if (musicList.length === 0) {
            toast.info(t("local_music_page.no_music_to_refresh"));
            return;
        }

        setRefreshing(true);
        toast.info(t("local_music_page.refreshing_tags"));

        let successCount = 0;
        let failCount = 0;
        const batchSize = 10;
        const totalItems = musicList.length;

        const processBatch = async (startIndex: number): Promise<void> => {
            const endIndex = Math.min(startIndex + batchSize, totalItems);
            
            for (let i = startIndex; i < endIndex; i++) {
                const musicItem = musicList[i];
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                if (!filePath) {
                    failCount++;
                    continue;
                }

                try {
                    const tagResult = await (window as any)["@shared/music-tag"].readTags(filePath);
                    if (tagResult.success && tagResult.tags) {
                        const updatedItem = {
                            ...musicItem,
                            title: tagResult.tags.title || musicItem.title,
                            artist: tagResult.tags.artist || musicItem.artist,
                            album: tagResult.tags.album || musicItem.album,
                            artwork: tagResult.tags.artwork || musicItem.artwork,
                            rawLrc: tagResult.tags.lyrics || undefined,
                        };
                        await musicSheetDB.localMusicStore.update(
                            [musicItem.platform, musicItem.id],
                            {
                                title: updatedItem.title,
                                artist: updatedItem.artist,
                                album: updatedItem.album,
                                artwork: updatedItem.artwork,
                                rawLrc: updatedItem.rawLrc,
                            },
                        );
                        musicList[i] = updatedItem;
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (e) {
                    console.error("[RefreshTags] Failed:", e);
                    failCount++;
                }
            }

            localMusicListStore.setValue([...musicList]);

            if (endIndex < totalItems) {
                await new Promise(resolve => setTimeout(resolve, 0));
                await processBatch(endIndex);
            }
        };

        await processBatch(0);

        setRefreshing(false);
        toast.success(t("local_music_page.refresh_tags_complete", { 
            success: successCount, 
            fail: failCount, 
        }));
    };

    return (
        <div
            id="page-container"
            className="page-container local-music-view--container"
            data-full-page={displayView !== DisplayView.LIST}
        >
            <div className="header">{t("local_music_page.local_music")}</div>
            <div className="operations">
                <div
                    data-type="normalButton"
                    role="button"
                    onClick={() => {
                        showModal("WatchLocalDir");
                    }}
                >
                    {t("local_music_page.auto_scan")}
                </div>
                <div
                    data-type="normalButton"
                    role="button"
                    onClick={handleRescan}
                    data-disabled={rescanning}
                >
                    {rescanning ? t("local_music_page.manual_scanning") : t("local_music_page.manual_scan")}
                </div>
                <div
                    data-type="normalButton"
                    role="button"
                    onClick={async () => {
                        await localMusic.clearLocalMusic();
                        toast.success(t("local_music_page.clear_local_music_success"));
                    }}
                >
                    {t("local_music_page.clear_local_music")}
                </div>
                <div
                    data-type="normalButton"
                    role="button"
                    onClick={handleRefreshTags}
                    data-disabled={refreshing}
                >
                    {refreshing ? t("local_music_page.refreshing") : t("local_music_page.refresh_tags")}
                </div>
                <div className="operations-layout">
                    <input
                        className="search-local-music"
                        spellCheck={false}
                        onChange={(evt) => {
                            setInputSearch(evt.target.value);
                        }}
                        placeholder={t("local_music_page.search_local_music")}
                    ></input>
                    <div
                        className="list-view-action"
                        data-selected={displayView === DisplayView.LIST}
                        title={t("local_music_page.list_view")}
                        onClick={() => {
                            setDisplayView(DisplayView.LIST);
                        }}
                    >
                        <SvgAsset iconName="musical-note"></SvgAsset>
                    </div>
                    <div
                        className="list-view-action"
                        data-selected={displayView === DisplayView.ARTIST}
                        title={t("local_music_page.artist_view")}
                        onClick={() => {
                            setDisplayView(DisplayView.ARTIST);
                        }}
                    >
                        <SvgAsset iconName="user"></SvgAsset>
                    </div>
                    <div
                        className="list-view-action"
                        data-selected={displayView === DisplayView.ALBUM}
                        title={t("local_music_page.album_view")}
                        onClick={() => {
                            setDisplayView(DisplayView.ALBUM);
                        }}
                    >
                        <SvgAsset iconName="cd"></SvgAsset>
                    </div>
                    <div
                        className="list-view-action"
                        data-selected={displayView === DisplayView.FOLDER}
                        title={t("local_music_page.folder_view")}
                        onClick={() => {
                            setDisplayView(DisplayView.FOLDER);
                        }}
                    >
                        <SvgAsset iconName="folder-open"></SvgAsset>
                    </div>
                </div>
            </div>
            <SwitchCase.Switch switch={displayView}>
                <SwitchCase.Case case={DisplayView.LIST}>
                    <ListView localMusicList={finalMusicList}></ListView>
                </SwitchCase.Case>
                <SwitchCase.Case case={DisplayView.ARTIST}>
                    <ArtistView localMusicList={finalMusicList}></ArtistView>
                </SwitchCase.Case>
                <SwitchCase.Case case={DisplayView.ALBUM}>
                    <AlbumView localMusicList={finalMusicList}></AlbumView>
                </SwitchCase.Case>
                <SwitchCase.Case case={DisplayView.FOLDER}>
                    <FolderView localMusicList={finalMusicList}></FolderView>
                </SwitchCase.Case>
            </SwitchCase.Switch>
        </div>
    );
}
