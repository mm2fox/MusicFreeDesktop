import { ColumnDef, createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from "@tanstack/react-table";
import { useEffect, useState, useRef, memo, useCallback } from "react";
import { i18n } from "@/shared/i18n/renderer";
import { secondsToDuration } from "@/common/time-util";
import { localPluginName, RequestStateCode , internalDataKey } from "@/common/constant";
import { IContextMenuItem, showContextMenu } from "@/renderer/components/ContextMenu";
import { showModal, hideModal } from "@/renderer/components/Modal";
import { toast } from "react-toastify";
import hotkeys from "hotkeys-js";
import trackPlayer from "@renderer/core/track-player";
import MusicSheet from "@/renderer/core/music-sheet";
import Downloader from "@/renderer/core/downloader";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusicListStore from "@/renderer/core/local-music/store";
import SvgAsset from "@/renderer/components/SvgAsset";
import SwitchCase from "@/renderer/components/SwitchCase";
import Condition, { IfTruthy } from "@/renderer/components/Condition";
import Empty from "@/renderer/components/Empty";
import BottomLoadingState from "@/renderer/components/BottomLoadingState";
import MusicFavorite from "@/renderer/components/MusicFavorite";
import MusicDownloaded from "@/renderer/components/MusicDownloaded";
import MusicInfo from "@/renderer/components/MusicInfo";
import Tag from "@/renderer/components/Tag";
import useVirtualList from "@/hooks/useVirtualList";
import AppConfig from "@shared/app-config/renderer";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import { shellUtil, fsUtil } from "@shared/utils/renderer";
import { locateMusicStore } from "@/renderer/components/MusicSheetlikeView/store";
import { navigateTo } from "@/renderer/utils/navigate";
import { getMusicTags, useAllCustomTags } from "@/renderer/core/local-music/custom-tags";
import { getInternalData, setInternalData } from "@/common/media-util";
import fileOperationLogger from "@/renderer/core/file-operation-log";


interface ILocalMusicListProps {
    localMusicList: IMusic.IMusicItem[];
}

const columnHelper = createColumnHelper<IMusic.IMusicItem>();

const estimizeItemHeight = 2.6 * 13;

function showLocalMusicContextMenu(
    musicItems: IMusic.IMusicItem | IMusic.IMusicItem[],
    x: number,
    y: number,
) {
    const isArray = Array.isArray(musicItems);
    const menuItems: IContextMenuItem[] = [];

    menuItems.push(
        {
            title: i18n.t("music_list_context_menu.tag_management"),
            icon: "tag",
            onClick() {
                showModal("CustomTagsEditor", { 
                    musicItem: isArray ? musicItems[0] : musicItems,
                    musicItems: isArray ? musicItems : [musicItems],
                });
            },
        },
        {
            divider: true,
        },
    );

    if (!isArray) {
        menuItems.push(
            {
                title: `${i18n.t("media.media_title")}: ${musicItems.title ?? i18n.t("media.unknown_title")}`,
                icon: "musical-note",
                onClick() {
                    const title = musicItems.title ?? i18n.t("media.unknown_title");
                    navigateTo(`/main/search/${encodeURIComponent(title)}`);
                },
            },
            {
                title: `${i18n.t("media.media_type_artist")}: ${musicItems.artist ?? i18n.t("media.unknown_artist")}`,
                icon: "user",
                onClick() {
                    const artist = musicItems.artist ?? i18n.t("media.unknown_artist");
                    navigateTo(`/main/search/${encodeURIComponent(artist)}`);
                },
            },
            {
                title: `${i18n.t("media.media_type_album")}: ${musicItems.album ?? i18n.t("media.unknown_album")}`,
                icon: "album",
                show: !!musicItems.album,
                onClick() {
                    if (musicItems.album) {
                        navigateTo(`/main/search/${encodeURIComponent(musicItems.album)}`);
                    }
                },
            },
            {
                divider: true,
            },
        );
    }

    menuItems.push(
        {
            title: i18n.t("music_list_context_menu.next_play"),
            icon: "motion-play",
            onClick() {
                trackPlayer.addNext(musicItems);
            },
        },
        {
            title: i18n.t("music_list_context_menu.add_to_my_sheets"),
            icon: "document-plus",
            onClick() {
                showModal("AddMusicToSheet", { musicItems });
            },
        },
        {
            divider: true,
        },
        {
            title: `${i18n.t("music_list_context_menu.edit_tags")} (Alt+E)`,
            icon: "tag",
            show: !isArray,
            onClick() {
                showModal("TagEditor", { musicItem: musicItems as IMusic.IMusicItem });
            },
        },
        {
            title: i18n.t("music_list_context_menu.refresh_tag"),
            icon: "arrow-path",
            show: !isArray,
            onClick() {
                const musicItem = musicItems as IMusic.IMusicItem;
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                if (!filePath) {
                    toast.error(i18n.t("music_list_context_menu.refresh_tag_failed"));
                    return;
                }

                (async () => {
                    try {
                        const tagResult = await (window as any)["@shared/music-tag"].readTags(filePath);
                        if (tagResult.success && tagResult.tags) {
                            await musicSheetDB.localMusicStore.update(
                                [musicItem.platform, musicItem.id],
                                {
                                    title: tagResult.tags.title || musicItem.title,
                                    artist: tagResult.tags.artist || musicItem.artist,
                                    album: tagResult.tags.album || musicItem.album,
                                    artwork: tagResult.tags.artwork || musicItem.artwork,
                                    rawLrc: tagResult.tags.lyrics || undefined,
                                    duration: tagResult.tags.duration || musicItem.duration,
                                },
                            );

                            const currentList = localMusicListStore.getValue();
                            const updatedList = currentList.map(item => {
                                if (item.id === musicItem.id && item.platform === musicItem.platform) {
                                    return {
                                        ...item,
                                        title: tagResult.tags.title || item.title,
                                        artist: tagResult.tags.artist || item.artist,
                                        album: tagResult.tags.album || item.album,
                                        artwork: tagResult.tags.artwork || item.artwork,
                                        rawLrc: tagResult.tags.lyrics || undefined,
                                        duration: tagResult.tags.duration || item.duration,
                                    };
                                }
                                return item;
                            });
                            localMusicListStore.setValue(updatedList);

                            toast.success(i18n.t("music_list_context_menu.refresh_tag_success"));
                        } else {
                            toast.error(i18n.t("music_list_context_menu.refresh_tag_failed"));
                        }
                    } catch (e) {
                        console.error("[RefreshTag] Error:", e);
                        toast.error(i18n.t("music_list_context_menu.refresh_tag_failed"));
                    }
                })();
            },
        },
        {
            divider: true,
        },
        {
            title: i18n.t("music_list_context_menu.reveal_local_music_in_file_explorer"),
            icon: "folder-open",
            show: !isArray,
            async onClick() {
                try {
                    const musicItem = musicItems as IMusic.IMusicItem;
                    const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                    if (!filePath) {
                        toast.error(i18n.t("music_list_context_menu.reveal_local_music_in_file_explorer_fail"));
                        return;
                    }
                    const result = await shellUtil.showItemInFolder(filePath);
                    if (!result) {
                        throw new Error();
                    }
                } catch (e) {
                    toast.error(
                        `${i18n.t("music_list_context_menu.reveal_local_music_in_file_explorer_fail")} ${e?.message ?? ""}`,
                    );
                }
            },
        },
        {
            title: i18n.t("music_list_context_menu.rename_local_file"),
            icon: "pencil-square",
            show: !isArray,
            onClick() {
                const musicItem = musicItems as IMusic.IMusicItem;
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                if (!filePath) {
                    toast.error(i18n.t("music_list_context_menu.rename_local_file_failed"));
                    return;
                }

                const fileName = window.path.basename(filePath);
                const ext = window.path.extname(fileName);
                const baseName = window.path.basename(fileName, ext);
                const dirPath = window.path.dirname(filePath);

                showModal("SimpleInputWithState", {
                    title: i18n.t("music_list_context_menu.rename_local_file_title"),
                    defaultValue: baseName,
                    placeholder: i18n.t("music_list_context_menu.rename_local_file_title"),
                    okText: i18n.t("common.confirm"),
                    withLoading: true,
                    loadingText: i18n.t("common.loading"),
                    onOk: async (newName: string) => {
                        if (!newName || newName.trim() === "") {
                            toast.error(i18n.t("music_list_context_menu.rename_local_file_empty"));
                            return Promise.reject();
                        }

                        const newFileName = newName.trim() + ext;
                        const newFilePath = window.path.join(dirPath, newFileName);

                        try {
                            const fs = (window as any)["@shared/utils"].fs;
                            await fs.renameFile(filePath, newFilePath);

                            await musicSheetDB.localMusicStore.update(
                                [musicItem.platform, musicItem.id],
                                {
                                    $$localPath: newFilePath,
                                    title: newName.trim(),
                                },
                            );

                            const currentList = localMusicListStore.getValue();
                            const updatedList = currentList.map(item => {
                                if (item.id === musicItem.id && item.platform === musicItem.platform) {
                                    return {
                                        ...item,
                                        $$localPath: newFilePath,
                                        title: newName.trim(),
                                    };
                                }
                                return item;
                            });
                            localMusicListStore.setValue(updatedList);

                            const allMusic = await musicSheetDB.musicStore.toArray();
                            for (const item of allMusic) {
                                const downloadData = getInternalData<IMusic.IMusicItemInternalData>(item, "downloadData");
                                if (downloadData?.path === filePath) {
                                    const updatedItem = setInternalData<IMusic.IMusicItemInternalData>(
                                        item,
                                        "downloadData",
                                        { ...downloadData, path: newFilePath },
                                        true,
                                    );
                                    await musicSheetDB.musicStore.update(
                                        [item.platform, item.id],
                                        { [internalDataKey]: updatedItem[internalDataKey] },
                                    );
                                    break;
                                }
                            }

                            await fileOperationLogger.logRename(
                                musicItem,
                                filePath,
                                newFilePath,
                                true,
                            );

                            toast.success(i18n.t("music_list_context_menu.rename_local_file_success", { newName: newFileName }));
                            hideModal();
                        } catch (e) {
                            console.error("[RenameLocalFile] Error:", e);
                            await fileOperationLogger.logRename(
                                musicItem,
                                filePath,
                                newFilePath,
                                false,
                                String(e),
                            );
                            toast.error(i18n.t("music_list_context_menu.rename_local_file_failed"));
                            return Promise.reject(e);
                        }
                    },
                });
            },
        },
        {
            title: i18n.t("music_list_context_menu.delete_local_file"),
            icon: "trash",
            show: !isArray,
            onClick() {
                const musicItem = musicItems as IMusic.IMusicItem;
                const filePath = (musicItem as any).$$localPath || (musicItem as any).localPath;
                if (!filePath) {
                    toast.error(i18n.t("music_list_context_menu.delete_local_file_failed"));
                    return;
                }

                showModal("Reconfirm", {
                    title: i18n.t("music_list_context_menu.delete_local_file"),
                    content: i18n.t("music_list_context_menu.delete_local_file_confirm"),
                    async onConfirm() {
                        hideModal();
                        try {
                            await fsUtil.rimraf(filePath);
                            await musicSheetDB.localMusicStore.delete([musicItem.platform, musicItem.id]);
                            
                            const currentList = localMusicListStore.getValue();
                            const updatedList = currentList.filter(
                                item => !(item.id === musicItem.id && item.platform === musicItem.platform),
                            );
                            localMusicListStore.setValue(updatedList);

                            await fileOperationLogger.logDelete(
                                musicItem,
                                filePath,
                                true,
                            );

                            toast.success(
                                i18n.t("music_list_context_menu.delete_local_file_success", {
                                    songName: musicItem.title,
                                }),
                            );
                        } catch (e) {
                            console.error("[DeleteLocalFile] Error:", e);
                            await fileOperationLogger.logDelete(
                                musicItem,
                                filePath,
                                false,
                                String(e),
                            );
                            toast.error(i18n.t("music_list_context_menu.delete_local_file_failed"));
                        }
                    },
                });
            },
        },
    );

    showContextMenu({ x, y, menuItems });
}

function _LocalMusicList(props: ILocalMusicListProps) {
    const { localMusicList } = props;
    const [sorting, setSorting] = useState<SortingState>([]);
    const musicListRef = useRef(localMusicList);
    const columnShownRef = useRef(
        AppConfig.getConfig("normal.musicListColumnsShown").reduce(
            (prev, curr) => ({ ...prev, [curr]: false }),
            {},
        ),
    );

    const columnDef: ColumnDef<IMusic.IMusicItem>[] = [
        columnHelper.display({
            id: "like",
            size: 64,
            minSize: 64,
            maxSize: 64,
            cell: (info) => (
                <div className="music-list-operations">
                    <MusicFavorite musicItem={info.row.original} size={18}></MusicFavorite>
                    <MusicDownloaded musicItem={info.row.original}></MusicDownloaded>
                    <MusicInfo musicItem={info.row.original} size={18}></MusicInfo>
                </div>
            ),
            enableResizing: false,
            enableSorting: false,
        }),
        columnHelper.accessor((_, index) => index + 1, {
            cell: (info) => info.getValue(),
            header: "#",
            id: "index",
            minSize: 40,
            maxSize: 40,
            size: 40,
            enableResizing: false,
        }),
        columnHelper.accessor("title", {
            header: () => i18n.t("media.media_title"),
            size: 250,
            maxSize: 300,
            minSize: 100,
            cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
            // @ts-ignore
            fr: 3,
        }),
        columnHelper.accessor("artist", {
            header: () => i18n.t("media.media_type_artist"),
            size: 130,
            maxSize: 200,
            minSize: 60,
            cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
            // @ts-ignore
            fr: 2,
        }),
        columnHelper.accessor(
            (row) => {
                const artist = row.artist || "";
                return artist.length;
            },
            {
                id: "artistLength",
                header: () => i18n.t("local_music_page.artist_length"),
                size: 50,
                minSize: 40,
                maxSize: 80,
                cell: (info) => <span>{info.getValue()}</span>,
                enableSorting: true,
            },
        ),
        columnHelper.accessor("album", {
            header: () => i18n.t("media.media_type_album"),
            size: 120,
            maxSize: 200,
            minSize: 60,
            cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
            // @ts-ignore
            fr: 2,
        }),
        columnHelper.accessor("duration", {
            header: () => i18n.t("media.media_duration"),
            size: 64,
            maxSize: 150,
            minSize: 48,
            cell: (info) =>
                info.getValue() ? secondsToDuration(info.getValue()) : "--:--",
            // @ts-ignore
            fr: 1,
        }),
        columnHelper.accessor(
            (row) => {
                const rawLrc = (row as any).rawLrc;
                return rawLrc ? "yes" : "no";
            },
            {
                id: "lyrics",
                header: () => i18n.t("local_music_page.lyrics"),
                size: 50,
                minSize: 40,
                maxSize: 80,
                cell: (info) => {
                    const hasLyrics = info.getValue() === "yes";
                    return (
                        <span 
                            className="lyrics-indicator" 
                            title={hasLyrics ? i18n.t("local_music_page.has_lyrics") : i18n.t("local_music_page.no_lyrics")}
                        >
                            {hasLyrics ? "📝" : ""}
                        </span>
                    );
                },
                enableSorting: true,
            },
        ),
        columnHelper.accessor(
            (row) => {
                try {
                    const localPath = (row as any).$$localPath || (row as any).localPath;
                    if (localPath && window.path) {
                        return window.path.extname(localPath).toLowerCase().replace(".", "").toUpperCase();
                    }
                } catch {}
                return "";
            },
            {
                id: "format",
                header: () => i18n.t("media.media_format"),
                size: 60,
                minSize: 50,
                maxSize: 80,
                cell: (info) => {
                    const format = info.getValue();
                    if (format) {
                        return <span className="music-format-tag">{format}</span>;
                    }
                    return null;
                },
            },
        ),
    ];

    const table = useReactTable({
        debugAll: false,
        data: localMusicList,
        columns: columnDef,
        state: {
            sorting: sorting,
            columnVisibility: columnShownRef.current,
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const tableContainerRef = useRef<HTMLDivElement>();
    const virtualController = useVirtualList({
        data: table.getRowModel().rows,
        getScrollElement: () => document.querySelector("#page-container"),
        offsetHeight: () => tableContainerRef.current?.offsetTop ?? 0,
        estimateItemHeight: estimizeItemHeight,
        fallbackRenderCount: 40,
    });

    const [activeItems, setActiveItems] = useState<Set<number>>(new Set());
    const lastActiveIndexRef = useRef(0);
    const [isHovering, setIsHovering] = useState(false);

    useEffect(() => {
        setActiveItems(new Set());
        lastActiveIndexRef.current = 0;
        musicListRef.current = localMusicList;
    }, [localMusicList]);

    useEffect(() => {
        console.log("[LocalMusicList] setting currentListSourceStore");
        currentListSourceStore.setValue({
            type: "local-music",
            path: "/main/local-music",
        });
    }, []);

    const locateMusic = locateMusicStore.useValue();
    const virtualControllerRef = useRef(virtualController);
    
    useEffect(() => {
        virtualControllerRef.current = virtualController;
    }, [virtualController]);

    useEffect(() => {
        if (locateMusic && localMusicList.length > 0) {
            const index = localMusicList.findIndex(
                (item) => item.id === locateMusic.musicId && item.platform === locateMusic.musicPlatform,
            );
            if (index !== -1) {
                setTimeout(() => {
                    virtualControllerRef.current?.scrollToIndex(index, "smooth");
                }, 100);
            }
            locateMusicStore.setValue(null);
        }
    }, [locateMusic, localMusicList]);

    const activeItemsRef = useRef(activeItems);
    const tableRef = useRef(table);
    
    useEffect(() => {
        activeItemsRef.current = activeItems;
    }, [activeItems]);

    useEffect(() => {
        tableRef.current = table;
    }, [table]);
    
    useEffect(() => {
        const ctrlAHandler = (evt: Event) => {
            evt.preventDefault();
            setActiveItems(new Set(Array.from({ length: musicListRef.current.length }, (_, i) => i)));
        };
        
        const altEHandler = (evt: KeyboardEvent) => {
            evt.preventDefault();
            if (activeItemsRef.current.size === 1) {
                const selectedIndex = Array.from(activeItemsRef.current)[0];
                const rows = tableRef.current.getRowModel().rows;
                const selectedRow = rows[selectedIndex];
                if (selectedRow?.original) {
                    showModal("TagEditor", { musicItem: selectedRow.original });
                }
            }
        };
        
        const upHandler = (evt: KeyboardEvent) => {
            evt.preventDefault();
            if (activeItemsRef.current.size === 0 && musicListRef.current.length > 0) {
                setActiveItems(new Set([0]));
                lastActiveIndexRef.current = 0;
            } else if (activeItemsRef.current.size === 1) {
                const currentIndex = Array.from(activeItemsRef.current)[0];
                const newIndex = Math.max(0, currentIndex - 1);
                setActiveItems(new Set([newIndex]));
                lastActiveIndexRef.current = newIndex;
                virtualController.scrollToIndex(newIndex, "auto");
            }
        };
        
        const downHandler = (evt: KeyboardEvent) => {
            evt.preventDefault();
            const totalLength = musicListRef.current.length;
            if (activeItemsRef.current.size === 0 && totalLength > 0) {
                setActiveItems(new Set([0]));
                lastActiveIndexRef.current = 0;
            } else if (activeItemsRef.current.size === 1) {
                const currentIndex = Array.from(activeItemsRef.current)[0];
                const newIndex = Math.min(totalLength - 1, currentIndex + 1);
                setActiveItems(new Set([newIndex]));
                lastActiveIndexRef.current = newIndex;
                virtualController.scrollToIndex(newIndex, "auto");
            }
        };
        
        hotkeys("Ctrl+A", "music-list", ctrlAHandler);
        hotkeys("Alt+E", "music-list", altEHandler);
        hotkeys("up", "music-list", upHandler);
        hotkeys("down", "music-list", downHandler);
        return () => {
            hotkeys.unbind("Ctrl+A", ctrlAHandler);
            hotkeys.unbind("Alt+E", altEHandler);
            hotkeys.unbind("up", upHandler);
            hotkeys.unbind("down", downHandler);
        };
    }, [virtualController]);

    return (
        <div
            className="music-list-container"
            style={{ marginTop: "12px" }}
            ref={tableContainerRef}
            tabIndex={-1}
            onFocus={() => hotkeys.setScope("music-list")}
            onBlur={() => hotkeys.setScope("all")}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {activeItems.size > 1 && isHovering && (
                <div className="selection-count-badge">
                    {i18n.t("local_music_page.selected_count", { count: activeItems.size })}
                </div>
            )}
            <table
                style={{
                    height: virtualController.totalHeight + estimizeItemHeight,
                    tableLayout: "fixed",
                }}
            >
                <thead>
                    <tr>
                        {table.getHeaderGroups()[0].headers.map((header) => (
                            <th
                                key={header.id}
                                data-id={header.id}
                                style={{
                                    //@ts-ignore
                                    width: header.column.columnDef.fr
                                        ? //@ts-ignore
                                        `${header.column.columnDef.fr * 100}%`
                                        : header.column.columnDef.size,
                                }}
                                onClick={header.column.getToggleSortingHandler()}
                            >
                                {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                )}
                                <div
                                    className="sort-container"
                                    data-sorting={header.column.getIsSorted() !== false}
                                >
                                    <SwitchCase.Switch switch={header.column.getIsSorted()}>
                                        <SwitchCase.Case case={"asc"}>
                                            <SvgAsset iconName="sort-asc"></SvgAsset>
                                        </SwitchCase.Case>
                                        <SwitchCase.Case case={"desc"}>
                                            <SvgAsset iconName="sort-desc"></SvgAsset>
                                        </SwitchCase.Case>
                                        <SwitchCase.Case case={false}>
                                            <SvgAsset iconName="sort"></SvgAsset>
                                        </SwitchCase.Case>
                                    </SwitchCase.Switch>
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody
                    style={{
                        transform: `translateY(${virtualController.startTop}px)`,
                    }}
                >
                    {virtualController.virtualItems.map((virtualItem) => {
                        const row = virtualItem.dataItem;

                        if (!row.original) {
                            return null;
                        }

                        return (
                            <tr
                                key={row.id}
                                data-active={activeItems.has(virtualItem.rowIndex)}
                                onContextMenu={(e) => {
                                    if (activeItems.size > 1) {
                                        const selectedItems: IMusic.IMusicItem[] = [];
                                        const rows = table.getRowModel().rows;
                                        activeItems.forEach(item => {
                                            selectedItems.push(rows[item].original);
                                        });
                                        showLocalMusicContextMenu(selectedItems, e.clientX, e.clientY);
                                    } else {
                                        lastActiveIndexRef.current = virtualItem.rowIndex;
                                        setActiveItems(new Set([virtualItem.rowIndex]));
                                        showLocalMusicContextMenu(row.original, e.clientX, e.clientY);
                                    }
                                }}
                                onClick={(e) => {
                                    hotkeys.setScope("music-list");
                                    if (hotkeys.shift) {
                                        let start = lastActiveIndexRef.current;
                                        let end = virtualItem.rowIndex;
                                        if (start >= end) {
                                            [start, end] = [end, start];
                                        }
                                        if (end > musicListRef.current.length) {
                                            end = musicListRef.current.length - 1;
                                        }
                                        setActiveItems(
                                            new Set(
                                                Array.from({ length: end - start + 1 }, (_, i) => start + i),
                                            ),
                                        );
                                    } else if (hotkeys.ctrl) {
                                        const newSet = new Set(activeItems);
                                        if (newSet.has(virtualItem.rowIndex)) {
                                            newSet.delete(virtualItem.rowIndex);
                                        } else {
                                            newSet.add(virtualItem.rowIndex);
                                        }
                                        setActiveItems(newSet);
                                    } else {
                                        setActiveItems(new Set([virtualItem.rowIndex]));
                                        lastActiveIndexRef.current = virtualItem.rowIndex;
                                    }
                                }}
                                onDoubleClick={() => {
                                    const config =
                                        AppConfig.getConfig("playMusic.clickMusicList");
                                    if (config === "replace") {
                                        trackPlayer.playMusicWithReplaceQueue(
                                            musicListRef.current,
                                            row.original,
                                        );
                                    } else {
                                        trackPlayer.playMusic(row.original);
                                    }
                                }}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td
                                        key={cell.id}
                                        style={{
                                            //@ts-ignore
                                            width: cell.column.columnDef.fr
                                                ? //@ts-ignore
                                                `${cell.column.columnDef.fr * 100}%`
                                                : cell.column.columnDef.size,
                                        }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot
                    style={{
                        height:
                            virtualController.totalHeight -
                            virtualController.virtualItems.length * estimizeItemHeight,
                    }}
                ></tfoot>
            </table>
            <Condition condition={localMusicList.length === 0}>
                <Empty></Empty>
            </Condition>
        </div>
    );
}

export default memo(_LocalMusicList, (prev, curr) => prev.localMusicList === curr.localMusicList);
