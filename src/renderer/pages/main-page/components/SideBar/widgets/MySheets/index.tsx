import "./index.scss";
import ListItem from "../ListItem";
import { useMatch, useNavigate } from "react-router-dom";
import { Disclosure } from "@headlessui/react";
import MusicSheet, { defaultSheet } from "@/renderer/core/music-sheet";
import SvgAsset from "@/renderer/components/SvgAsset";
import { hideModal, showModal } from "@/renderer/components/Modal";
import { localPluginName } from "@/common/constant";
import { showContextMenu } from "@/renderer/components/ContextMenu";
import { useTranslation } from "react-i18next";
import { useSupportedPlugin } from "@shared/plugin-manager/renderer";
import Downloader from "@/renderer/core/downloader";
import { toast } from "react-toastify";
import * as backend from "@/renderer/core/music-sheet/backend";
import isLocalMusic from "@/renderer/utils/is-local-music";
import localMusicListStore from "@/renderer/core/local-music/store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import { getInternalData } from "@/common/media-util";
import { fsUtil } from "@shared/utils/renderer";


export default function MySheets() {
    const sheetIdMatch = useMatch(
        `/main/musicsheet/${encodeURIComponent(localPluginName)}/:sheetId`,
    );
    const currentSheetId = sheetIdMatch?.params?.sheetId;
    const musicSheets = MusicSheet.frontend.useAllSheets();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const importablePlugins = useSupportedPlugin("importMusicSheet");

    return (
        <div className="side-bar-container--my-sheets">
            <div className="divider"></div>
            <Disclosure defaultOpen>
                <Disclosure.Button className="title" as="div" role="button">
                    <div className="my-sheets">{t("side_bar.my_sheets")}</div>
                    <div
                        role="button"
                        className="option-btn"
                        title={t("plugin.method_import_music_sheet")}
                        onClick={(e) => {
                            e.stopPropagation();
                            showModal("ImportMusicSheet", {
                                plugins: importablePlugins,
                            });
                        }}
                    >
                        <SvgAsset iconName="arrow-left-end-on-rectangle"></SvgAsset>
                    </div>
                    <div
                        role="button"
                        className="option-btn"
                        title={t("side_bar.create_local_sheet")}
                        onClick={(e) => {
                            e.stopPropagation();
                            showModal("AddNewSheet");
                        }}
                    >
                        <SvgAsset iconName="plus"></SvgAsset>
                    </div>
                </Disclosure.Button>
                <Disclosure.Panel>
                    {musicSheets.map((item) => (
                        <ListItem
                            key={item.id}
                            iconName={
                                item.id === defaultSheet.id ? "heart-outline" : "musical-note"
                            }
                            onClick={() => {
                                if (currentSheetId !== item.id) {
                                    navigate(`/main/musicsheet/${encodeURIComponent(localPluginName)}/${encodeURIComponent(item.id)}`);
                                }
                            }}
                            onContextMenu={(e) => {
                                if (item.id === defaultSheet.id) {
                                    showContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        menuItems: [
                                            {
                                                title: t("side_bar.convert_to_sheet"),
                                                icon: "musical-note",
                                                async onClick() {
                                                    try {
                                                        const sheetDetail = await backend.getSheetItemDetail(item.id);
                                                        if (!sheetDetail?.musicList?.length) {
                                                            toast.warn(t("side_bar.download_sheet_empty"));
                                                            return;
                                                        }
                                                        toast.info(t("side_bar.convert_to_sheet_creating"));
                                                        const newSheet = await MusicSheet.frontend.addSheet(
                                                            `${t("media.default_favorite_sheet_name")}-${t("side_bar.convert_to_sheet_suffix")}`,
                                                        );
                                                        if (newSheet?.id) {
                                                            await MusicSheet.frontend.addMusicToSheet(sheetDetail.musicList, newSheet.id);
                                                            toast.success(
                                                                t("side_bar.convert_to_sheet_success", {
                                                                    count: sheetDetail.musicList.length,
                                                                    sheetName: newSheet.title,
                                                                }),
                                                            );
                                                        } else {
                                                            toast.error(t("side_bar.convert_to_sheet_failed"));
                                                        }
                                                    } catch (error) {
                                                        console.error("[ConvertToSheet] error:", error);
                                                        toast.error(t("side_bar.convert_to_sheet_failed"));
                                                    }
                                                },
                                            },
                                        ],
                                    });
                                    return;
                                }
                                showContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    menuItems: [
                                        {
                                            title: t("side_bar.rename_sheet"),
                                            icon: "pencil-square",
                                            show: item.id !== defaultSheet.id,
                                            onClick() {
                                                showModal("SimpleInputWithState", {
                                                    placeholder: t(
                                                        "modal.create_local_sheet_placeholder",
                                                    ),
                                                    maxLength: 30,
                                                    title: t("side_bar.rename_sheet"),
                                                    defaultValue: item.title,
                                                    async onOk(text) {
                                                        await MusicSheet.frontend.updateSheet(item.id, {
                                                            title: text,
                                                        });
                                                        hideModal();
                                                    },
                                                });
                                            },
                                        },
                                        {
                                            title: t("side_bar.delete_sheet"),
                                            icon: "trash",
                                            show: item.id !== defaultSheet.id,
                                            onClick() {
                                                MusicSheet.frontend.removeSheet(item.id).then(() => {
                                                    if (currentSheetId === item.id) {
                                                        navigate(
                                                            `/main/musicsheet/${encodeURIComponent(localPluginName)}/${defaultSheet.id}`,
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
                                            show: item.id !== defaultSheet.id,
                                            async onClick() {
                                                const sheetDetail = await backend.getSheetItemDetail(item.id);
                                                if (!sheetDetail?.musicList?.length) {
                                                    toast.warn(t("side_bar.download_sheet_empty"));
                                                    return;
                                                }
                                                const musicList = sheetDetail.musicList.filter(
                                                    (it) => !isLocalMusic(it) && !Downloader.isDownloaded(it),
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
                                            },
                                        },
                                        {
                                            title: t("side_bar.convert_to_local"),
                                            icon: "folder-open",
                                            show: item.id !== defaultSheet.id,
                                            async onClick() {
                                                try {
                                                    toast.info(t("side_bar.convert_to_local_starting"));
                                                    const sheetDetail = await backend.getSheetItemDetail(item.id);
                                                    if (!sheetDetail?.musicList?.length) {
                                                        toast.warn(t("side_bar.download_sheet_empty"));
                                                        return;
                                                    }
                                                    const allMusic = sheetDetail.musicList;
                                                    const existingLocalMusic = localMusicListStore.getValue() || [];
                                                    console.log("[ConvertToLocal] allMusic count:", allMusic.length);
                                                    console.log("[ConvertToLocal] existingLocalMusic count:", existingLocalMusic.length);
                                                    toast.info(t("side_bar.convert_to_local_matching", { 
                                                        online: allMusic.length, 
                                                        local: existingLocalMusic.length, 
                                                    }));
                                                    const onlineMusic = allMusic.filter((it) => !isLocalMusic(it));
                                                    const musicDetails = await musicSheetDB.musicStore.bulkGet(
                                                        onlineMusic.map((it) => [it.platform, it.id]),
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
                                                    console.log("[ConvertToLocal] matched:", matchedCount, "unmatched:", unmatchedCount);
                                                    const newSheetName = `${item.title}-${t("side_bar.convert_to_local_suffix")}`;
                                                    console.log("[ConvertToLocal] creating sheet:", newSheetName);
                                                    toast.info(t("side_bar.convert_to_local_creating_sheet"));
                                                    const newSheet = await MusicSheet.frontend.addSheet(newSheetName);
                                                    console.log("[ConvertToLocal] newSheet:", newSheet);
                                                    if (newSheet?.id) {
                                                        await MusicSheet.frontend.addMusicToSheet(resultItems, newSheet.id);
                                                        toast.success(
                                                            t("side_bar.convert_to_local_result", {
                                                                matched: matchedCount,
                                                                unmatched: unmatchedCount,
                                                                sheetName: newSheetName,
                                                            }),
                                                        );
                                                    } else {
                                                        toast.error(t("side_bar.convert_to_local_create_sheet_failed"));
                                                    }
                                                } catch (e) {
                                                    console.error("[ConvertToLocal] error:", e);
                                                    toast.error(t("side_bar.convert_to_local_error"));
                                                }
                                            },
                                        },
                                    ],
                                });
                            }}
                            selected={currentSheetId === item.id}
                            title={
                                item.id === defaultSheet.id
                                    ? t("media.default_favorite_sheet_name")
                                    : item.title
                            }
                        ></ListItem>
                    ))}
                </Disclosure.Panel>
            </Disclosure>
        </div>
    );
}
