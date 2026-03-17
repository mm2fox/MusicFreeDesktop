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
import TagView from "./views/tag";
import AppConfig from "@shared/app-config/renderer";
import { toast } from "react-toastify";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusic from "@/renderer/core/local-music";
import { autoTagFromArtist } from "@/renderer/core/local-music/custom-tags";
import { showContextMenu, IContextMenuItem } from "@/renderer/components/ContextMenu";

enum DisplayView {
    LIST,
    ARTIST,
    ALBUM,
    FOLDER,
    TAG,
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

    const handleRefreshTags = async (includeArtwork: boolean = false) => {
        if (refreshing) return;
        
        const musicList = localMusicListStore.getValue();
        if (musicList.length === 0) {
            toast.info(t("local_music_page.no_music_to_refresh"));
            return;
        }

        const itemsToRefresh = includeArtwork 
            ? musicList.filter(item => !item.artwork)
            : musicList;
            
        if (itemsToRefresh.length === 0) {
            toast.info(t("local_music_page.all_have_artwork"));
            return;
        }

        const skippedCount = musicList.length - itemsToRefresh.length;
        if (skippedCount > 0) {
            toast.info(t("local_music_page.skipped_have_artwork", { count: skippedCount }));
        }

        setRefreshing(true);
        toast.info(t("local_music_page.refreshing_tags"));

        let successCount = 0;
        let failCount = 0;
        const batchSize = includeArtwork ? 1 : 5;
        const totalItems = itemsToRefresh.length;

        for (let i = 0; i < totalItems; i += batchSize) {
            const endIndex = Math.min(i + batchSize, totalItems);
            
            for (let j = i; j < endIndex; j++) {
                const musicItem = itemsToRefresh[j];
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                
                if (!filePath) {
                    failCount++;
                    continue;
                }

                try {
                    const tagResult = includeArtwork 
                        ? await (window as any)["@shared/music-tag"].readTags(filePath)
                        : await (window as any)["@shared/music-tag"].readTagsWithoutArtwork(filePath);
                        
                    if (tagResult.success && tagResult.tags) {
                        const updatesForItem: Partial<IMusic.IMusicItem> = {};
                        
                        if (tagResult.tags.title) updatesForItem.title = tagResult.tags.title;
                        if (tagResult.tags.artist) updatesForItem.artist = tagResult.tags.artist;
                        if (tagResult.tags.album) updatesForItem.album = tagResult.tags.album;
                        if (tagResult.tags.lyrics) updatesForItem.rawLrc = tagResult.tags.lyrics;
                        if (tagResult.tags.duration) updatesForItem.duration = tagResult.tags.duration;
                        if (includeArtwork && tagResult.tags.artwork) {
                            updatesForItem.artwork = tagResult.tags.artwork;
                        }
                        
                        if (Object.keys(updatesForItem).length > 0) {
                            await musicSheetDB.localMusicStore.update(
                                [musicItem.platform, musicItem.id],
                                updatesForItem,
                            );
                        }
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (e) {
                    failCount++;
                }
            }
        }

        await localMusic.reloadLocalMusic();

        setRefreshing(false);
        toast.success(t("local_music_page.refresh_tags_complete", { 
            success: successCount, 
            fail: failCount, 
        }));
    };

    const showRefreshTagsDialog = () => {
        if (refreshing) return;
        
        showModal("SelectOne", {
            title: t("local_music_page.refresh_tags_options_title"),
            choices: [
                { label: t("local_music_page.refresh_tags_without_artwork"), value: false },
                { label: t("local_music_page.refresh_tags_with_artwork"), value: true },
            ],
            onOk: (value: boolean) => {
                handleRefreshTags(value);
            },
        });
    };

    const [autoTagging, setAutoTagging] = useState(false);

    const handleAutoTag = async () => {
        if (autoTagging) return;
        
        const musicList = localMusicListStore.getValue();
        if (musicList.length === 0) {
            toast.info(t("local_music_page.no_music_to_auto_tag"));
            return;
        }

        setAutoTagging(true);
        toast.info(t("local_music_page.auto_tagging"));

        try {
            const result = await autoTagFromArtist(musicList);
            toast.success(t("local_music_page.auto_tag_complete", { 
                success: result.success, 
                total: result.total,
            }));
        } catch (e) {
            console.error("[AutoTag] Error:", e);
            toast.error(t("local_music_page.auto_tag_failed"));
        } finally {
            setAutoTagging(false);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const menuItems: IContextMenuItem[] = [
            {
                icon: "chevron-double-up",
                title: t("local_music_page.scroll_to_top"),
                onClick: () => {
                    const container = document.querySelector("#page-container");
                    if (container) {
                        container.scrollTo({ top: 0, behavior: "smooth" });
                    }
                },
            },
            {
                divider: true,
            },
            {
                icon: "trash",
                title: t("local_music_page.clear_local_music"),
                onClick: async () => {
                    await localMusic.clearLocalMusic();
                    toast.success(t("local_music_page.clear_local_music_success"));
                },
            },
            {
                divider: true,
            },
            {
                icon: "code-bracket-square",
                title: t("local_music_page.format_convert"),
                onClick: () => {
                    const musicList = localMusicListStore.getValue();
                    if (musicList.length === 0) {
                        toast.info(t("file_converter.no_music_to_convert"));
                        return;
                    }
                    showModal("FileConverter", {
                        musicItems: musicList,
                        defaultFormat: "flac",
                    });
                },
            },
            {
                icon: "tag",
                title: t("local_music_page.tag_sheet_convert"),
                onClick: () => {
                    showModal("TagSheetConverter");
                },
            },
            {
                icon: "tag",
                title: t("local_music_page.auto_tag"),
                onClick: handleAutoTag,
            },
            {
                divider: true,
            },
            {
                icon: "musical-note",
                title: t("local_music_page.manage_duplicates"),
                onClick: () => {
                    showModal("DuplicateMusicManager");
                },
            },
            {
                icon: "document-plus",
                title: t("file_operation_log.title"),
                onClick: () => {
                    showModal("FileOperationLog");
                },
            },
            {
                icon: "pencil-square",
                title: t("path_replacer.title"),
                onClick: () => {
                    showModal("PathReplacer");
                },
            },
        ];

        showContextMenu({
            menuItems,
            x: e.clientX,
            y: e.clientY,
        });
    };

    return (
        <div
            id="page-container"
            className="page-container local-music-view--container"
            data-full-page={displayView !== DisplayView.LIST}
        >
            <div className="header" onContextMenu={handleContextMenu}>{t("local_music_page.local_music")}</div>
            <div className="operations" onContextMenu={handleContextMenu}>
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
                    onClick={showRefreshTagsDialog}
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
                    <div
                        className="list-view-action"
                        data-selected={displayView === DisplayView.TAG}
                        title={t("local_music_page.tag_view")}
                        onClick={() => {
                            setDisplayView(DisplayView.TAG);
                        }}
                    >
                        <SvgAsset iconName="tag"></SvgAsset>
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
                <SwitchCase.Case case={DisplayView.TAG}>
                    <TagView localMusicList={finalMusicList}></TagView>
                </SwitchCase.Case>
            </SwitchCase.Switch>
        </div>
    );
}
