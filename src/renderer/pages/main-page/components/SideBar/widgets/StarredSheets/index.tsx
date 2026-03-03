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
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusicListStore from "@/renderer/core/local-music/store";
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
                                                    const onlineMusic = result.musicList.filter(
                                                        (it: IMusic.IMusicItem) => !isLocalMusic(it) && Downloader.isDownloaded(it),
                                                    );
                                                    if (onlineMusic.length === 0) {
                                                        toast.info(t("side_bar.convert_to_local_no_downloaded"));
                                                        return;
                                                    }
                                                    const musicDetails = await musicSheetDB.musicStore.bulkGet(
                                                        onlineMusic.map((it: IMusic.IMusicItem) => [it.platform, it.id]),
                                                    );
                                                    const existingLocalMusic = localMusicListStore.getValue() || [];
                                                    const localMusicByFilename = new Map<string, typeof existingLocalMusic[0]>();
                                                    for (const local of existingLocalMusic) {
                                                        if (local?.$$localPath) {
                                                            const filename = window.path.basename(local.$$localPath).toLowerCase();
                                                            if (!localMusicByFilename.has(filename)) {
                                                                localMusicByFilename.set(filename, local);
                                                            }
                                                        }
                                                    }
                                                    const localMusicItems: Array<IMusic.IMusicItem & { $$localPath: string }> = [];
                                                    for (const detail of musicDetails) {
                                                        if (!detail) continue;
                                                        const downloadData = getInternalData<IMusic.IMusicItemInternalData>(detail, "downloadData");
                                                        if (!downloadData?.path) continue;
                                                        const fileExists = await fsUtil.isFile(downloadData.path).catch(() => false);
                                                        if (fileExists) {
                                                            localMusicItems.push({
                                                                ...detail,
                                                                platform: localPluginName,
                                                                $$localPath: downloadData.path,
                                                            });
                                                        } else {
                                                            const filename = window.path.basename(downloadData.path).toLowerCase();
                                                            const localMatch = localMusicByFilename.get(filename);
                                                            if (localMatch) {
                                                                localMusicItems.push({
                                                                    ...localMatch,
                                                                } as IMusic.IMusicItem & { $$localPath: string });
                                                            }
                                                        }
                                                    }
                                                    if (localMusicItems.length === 0) {
                                                        toast.info(t("side_bar.convert_to_local_no_match"));
                                                        return;
                                                    }
                                                    const existingPaths = new Set(
                                                        existingLocalMusic.map((it) => it?.$$localPath).filter(Boolean),
                                                    );
                                                    const newLocalItems = localMusicItems.filter(
                                                        (it) => !existingPaths.has(it.$$localPath),
                                                    );
                                                    if (newLocalItems.length > 0) {
                                                        await musicSheetDB.localMusicStore.bulkPut(newLocalItems);
                                                        localMusicListStore.setValue([...existingLocalMusic, ...newLocalItems]);
                                                    }
                                                    const newSheet = await MusicSheet.frontend.addSheet(
                                                        `${item.title} (${t("side_bar.convert_to_local_suffix")})`,
                                                    );
                                                    if (newSheet) {
                                                        await MusicSheet.frontend.addMusicToSheet(localMusicItems, newSheet.id);
                                                        toast.success(
                                                            t("side_bar.convert_to_local_success_with_sheet", {
                                                                count: localMusicItems.length,
                                                                sheetName: newSheet.title,
                                                            }),
                                                        );
                                                    }
                                                } catch (error) {
                                                    toast.error(t("side_bar.download_sheet_error"));
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
