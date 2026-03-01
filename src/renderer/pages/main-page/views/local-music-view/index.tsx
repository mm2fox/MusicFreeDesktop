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

    const handleRefreshTags = async (includeArtwork: boolean = false) => {
        if (refreshing) return;
        
        const musicList = localMusicListStore.getValue();
        if (musicList.length === 0) {
            toast.info(t("local_music_page.no_music_to_refresh"));
            return;
        }

        // 如果包含封面，过滤掉已有封面的文件
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
        // 包含封面时，一次只处理 1 个文件，并增加延迟
        const batchSize = includeArtwork ? 1 : 5;
        const totalItems = itemsToRefresh.length;
        let lastUpdateTime = Date.now();

        console.log(`[RefreshTags] 开始刷新，总数: ${totalItems}，包含封面: ${includeArtwork}`);

        for (let i = 0; i < totalItems; i += batchSize) {
            const endIndex = Math.min(i + batchSize, totalItems);
            const batchUpdates: Array<{ item: IMusic.IMusicItem; updates: Partial<IMusic.IMusicItem> }> = [];
            
            for (let j = i; j < endIndex; j++) {
                const musicItem = itemsToRefresh[j];
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                
                // 输出当前处理的文件
                console.log(`[RefreshTags] 进度: ${j + 1}/${totalItems} - ${musicItem.title || '未知标题'} - ${filePath || '无路径'}`);
                
                if (!filePath) {
                    console.warn(`[RefreshTags] 跳过无路径文件: ${musicItem.title}`);
                    failCount++;
                    continue;
                }

                try {
                    console.log(`[RefreshTags] 正在读取标签: ${filePath}`);
                    const tagResult = includeArtwork 
                        ? await (window as any)["@shared/music-tag"].readTags(filePath)
                        : await (window as any)["@shared/music-tag"].readTagsWithoutArtwork(filePath);
                    
                    console.log(`[RefreshTags] 标签读取完成: ${filePath}, 成功: ${tagResult.success}`);
                        
                    if (tagResult.success && tagResult.tags) {
                        const updatesForItem: Partial<IMusic.IMusicItem> = {};
                        
                        if (tagResult.tags.title) updatesForItem.title = tagResult.tags.title;
                        if (tagResult.tags.artist) updatesForItem.artist = tagResult.tags.artist;
                        if (tagResult.tags.album) updatesForItem.album = tagResult.tags.album;
                        if (tagResult.tags.lyrics) updatesForItem.rawLrc = tagResult.tags.lyrics;
                        if (includeArtwork && tagResult.tags.artwork) {
                            updatesForItem.artwork = tagResult.tags.artwork;
                            console.log(`[RefreshTags] 封面大小: ${Math.round(tagResult.tags.artwork.length / 1024)}KB`);
                        }
                        
                        if (Object.keys(updatesForItem).length > 0) {
                            await musicSheetDB.localMusicStore.update(
                                [musicItem.platform, musicItem.id],
                                updatesForItem,
                            );
                            // 包含封面时，不更新 store，避免内存累积
                            // 封面数据会在播放时从 IndexedDB 读取
                            if (!includeArtwork) {
                                batchUpdates.push({ item: musicItem, updates: updatesForItem });
                            }
                        }
                        successCount++;
                        console.log(`[RefreshTags] 成功: ${musicItem.title}`);
                    } else {
                        console.warn(`[RefreshTags] 失败: ${filePath}, 错误: ${tagResult.error}`);
                        failCount++;
                    }
                    
                    // 清理引用，帮助 GC
                    tagResult.tags = null;
                } catch (e) {
                    console.error(`[RefreshTags] 异常: ${filePath}`, e);
                    failCount++;
                }
            }

            if (batchUpdates.length > 0) {
                localMusicListStore.setValue(prevList => {
                    const newList = [...prevList];
                    for (const { item, updates } of batchUpdates) {
                        const idx = newList.findIndex(m => m.platform === item.platform && m.id === item.id);
                        if (idx !== -1) {
                            newList[idx] = { ...newList[idx], ...updates };
                        }
                    }
                    return newList;
                });
                // 清空数组，帮助 GC
                batchUpdates.length = 0;
            }

            // 输出内存使用情况
            if (includeArtwork && (i % 10 === 0 || endIndex >= totalItems)) {
                const memInfo = (performance as any).memory;
                if (memInfo) {
                    console.log(`[RefreshTags] 内存使用: ${Math.round(memInfo.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)}MB`);
                }
            }

            // 包含封面时，增加延迟并让出主线程
            if (endIndex < totalItems) {
                const now = Date.now();
                const elapsed = now - lastUpdateTime;
                // 包含封面时，延迟更长，给 GC 更多时间
                const minDelay = includeArtwork ? 800 : 100;
                if (elapsed < minDelay) {
                    await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
                }
                // 让出主线程，防止 UI 卡死，也给 GC 机会
                await new Promise(resolve => setTimeout(resolve, includeArtwork ? 100 : 0));
                lastUpdateTime = Date.now();
            }
        }

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
