import "./index.scss";
import ListItem from "../ListItem";
import { useMatch, useNavigate } from "react-router-dom";
import { Disclosure } from "@headlessui/react";
import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import { localPluginName } from "@/common/constant";
import { showContextMenu } from "@/renderer/components/ContextMenu";
import { useTranslation } from "react-i18next";
import Downloader from "@/renderer/core/downloader";
import { toast } from "react-toastify";
import PluginManager from "@shared/plugin-manager/renderer";
import isLocalMusic from "@/renderer/utils/is-local-music";
import localMusicListStore from "@/renderer/core/local-music/store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import { getInternalData } from "@/common/media-util";
import { fsUtil } from "@shared/utils/renderer";

export default function StarredSheets() {
    const sheetIdMatch = useMatch("/main/musicsheet/:platform/:sheetId");

    const currentPlatform = sheetIdMatch?.params?.platform;
    const currentSheetId = sheetIdMatch?.params?.sheetId;

    const starredSheets = MusicSheet.frontend.useAllStarredSheets();

    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="side-bar-container--starred-sheets">
            <Disclosure defaultOpen>
                <Disclosure.Button className="title" as="div" role="button">
                    <div className="my-sheets">{t("side_bar.starred_sheets")}</div>
                </Disclosure.Button>
                <Disclosure.Panel>
                    {starredSheets.map((item) => (
                        <ListItem
                            key={item.id}
                            iconName={"musical-note"}
                            onClick={() => {
                                if (
                                    !(
                                        currentSheetId === item.id &&
                    currentPlatform === item.platform
                                    )
                                ) {
                                    // 如果不是相同歌单
                                    navigate(`/main/musicsheet/${item.platform}/${item.id}`, {
                                        state: {
                                            sheetItem: item,
                                        },
                                    });
                                }
                            }}
                            onContextMenu={(e) => {
                                showContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    menuItems: [
                                        {
                                            title: t("side_bar.unstar_sheet"),
                                            icon: "trash",
                                            onClick() {
                                                MusicSheet.frontend.unstarMusicSheet(item).then(() => {
                                                    if (
                                                        currentSheetId === item.id &&
                            currentPlatform === item.platform
                                                    ) {
                                                        navigate(
                                                            `/main/musicsheet/${localPluginName}/${defaultSheet.id}`,
                                                            {
                                                                replace: true,
                                                            },
                                                        );
                                                    }
                                                });
                                            },
                                        },
                                        {
                                            title: t("side_bar.download_sheet"),
                                            icon: "array-download-tray",
                                            async onClick() {
                                                try {
                                                    const result = await PluginManager.callPluginDelegateMethod(
                                                        item as IMusic.IMusicSheetItem,
                                                        "getMusicSheetInfo",
                                                        item as IMusic.IMusicSheetItem,
                                                        1,
                                                    );
                                                    if (!result?.musicList?.length) {
                                                        toast.warn(t("side_bar.download_sheet_empty"));
                                                        return;
                                                    }
                                                    const musicList = result.musicList.filter(
                                                        (it: IMusic.IMusicItem) => !isLocalMusic(it) && !Downloader.isDownloaded(it),
                                                    );
                                                    if (musicList.length === 0) {
                                                        toast.info(t("side_bar.download_sheet_no_new"));
                                                        return;
                                                    }
                                                    Downloader.startDownload(musicList);
                                                    toast.success(
                                                        t("side_bar.download_sheet_started", {
                                                            count: musicList.length,
                                                        }),
                                                    );
                                                } catch (error) {
                                                    toast.error(t("side_bar.download_sheet_error"));
                                                }
                                            },
                                        },
                                        {
                                            title: t("side_bar.convert_to_local"),
                                            icon: "folder-open",
                                            async onClick() {
                                                try {
                                                    toast.info(t("side_bar.convert_to_local_starting"));
                                                    const result = await PluginManager.callPluginDelegateMethod(
                                                        item as IMusic.IMusicSheetItem,
                                                        "getMusicSheetInfo",
                                                        item as IMusic.IMusicSheetItem,
                                                        1,
                                                    );
                                                    if (!result?.musicList?.length) {
                                                        toast.warn(t("side_bar.download_sheet_empty"));
                                                        return;
                                                    }
                                                    const allMusic = result.musicList;
                                                    const existingLocalMusic = localMusicListStore.getValue() || [];
                                                    toast.info(t("side_bar.convert_to_local_matching", { 
                                                        online: allMusic.length, 
                                                        local: existingLocalMusic.length 
                                                    }));
                                                    const onlineMusic = allMusic.filter((it: IMusic.IMusicItem) => !isLocalMusic(it));
                                                    const musicDetails = await musicSheetDB.musicStore.bulkGet(
                                                        onlineMusic.map((it: IMusic.IMusicItem) => [it.platform, it.id]),
                                                    );
                                                    const musicDetailMap = new Map<string, typeof musicDetails[0]>();
                                                    musicDetails.forEach((detail) => {
                                                        if (detail) {
                                                            musicDetailMap.set(`${detail.platform}-${detail.id}`, detail);
                                                        }
                                                    });
                                                    const resultItems: IMusic.IMusicItem[] = [];
                                                    const matchedLocalPaths = new Set<string>();
                                                    let matchedCount = 0;
                                                    let unmatchedCount = 0;
                                                    for (const musicItem of allMusic) {
                                                        if (isLocalMusic(musicItem)) {
                                                            resultItems.push(musicItem);
                                                            continue;
                                                        }
                                                        const title = musicItem.title?.toLowerCase()?.trim();
                                                        const artist = musicItem.artist?.toLowerCase()?.trim();
                                                        if (!title) {
                                                            resultItems.push(musicItem);
                                                            unmatchedCount++;
                                                            continue;
                                                        }
                                                        let localMatch: (typeof existingLocalMusic[0] & { $$localPath: string }) | null = null;
                                                        const detail = musicDetailMap.get(`${musicItem.platform}-${musicItem.id}`);
                                                        const downloadData = detail ? getInternalData<IMusic.IMusicItemInternalData>(detail, "downloadData") : null;
                                                        if (downloadData?.path) {
                                                            const fileExists = await fsUtil.isFile(downloadData.path).catch(() => false);
                                                            if (fileExists) {
                                                                localMatch = {
                                                                    ...detail!,
                                                                    platform: localPluginName,
                                                                    $$localPath: downloadData.path,
                                                                } as typeof localMatch;
                                                            }
                                                        }
                                                        if (!localMatch) {
                                                            for (const local of existingLocalMusic) {
                                                                if (!local?.$$localPath || matchedLocalPaths.has(local.$$localPath)) continue;
                                                                const filename = window.path.basename(local.$$localPath).toLowerCase();
                                                                const hasTitle = filename.includes(title);
                                                                const hasArtist = artist && filename.includes(artist);
                                                                if (hasTitle && hasArtist) {
                                                                    localMatch = local as typeof localMatch;
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                        if (!localMatch) {
                                                            for (const local of existingLocalMusic) {
                                                                if (!local?.$$localPath || matchedLocalPaths.has(local.$$localPath)) continue;
                                                                const filename = window.path.basename(local.$$localPath).toLowerCase();
                                                                if (filename.includes(title)) {
                                                                    localMatch = local as typeof localMatch;
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                        if (localMatch) {
                                                            matchedLocalPaths.add(localMatch.$$localPath);
                                                            resultItems.push(localMatch);
                                                            matchedCount++;
                                                        } else {
                                                            resultItems.push(musicItem);
                                                            unmatchedCount++;
                                                        }
                                                    }
                                                    toast.info(t("side_bar.convert_to_local_creating_sheet"));
                                                    const newSheet = await MusicSheet.frontend.addSheet(
                                                        `${item.title}-${t("side_bar.convert_to_local_suffix")}`,
                                                    );
                                                    if (newSheet?.id) {
                                                        await MusicSheet.frontend.addMusicToSheet(resultItems, newSheet.id);
                                                        toast.success(
                                                            t("side_bar.convert_to_local_result", {
                                                                matched: matchedCount,
                                                                unmatched: unmatchedCount,
                                                                sheetName: newSheet.title,
                                                            }),
                                                        );
                                                    } else {
                                                        toast.error(t("side_bar.convert_to_local_create_sheet_failed"));
                                                    }
                                                } catch (error) {
                                                    console.error("[ConvertToLocal] error:", error);
                                                    toast.error(t("side_bar.convert_to_local_error"));
                                                }
                                            },
                                        },
                                    ],
                                });
                            }}
                            selected={
                                currentSheetId === item.id && currentPlatform === item.platform
                            }
                            title={item.title}
                        ></ListItem>
                    ))}
                </Disclosure.Panel>
            </Disclosure>
        </div>
    );
}
