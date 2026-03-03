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
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusicListStore from "@/renderer/core/local-music/store";
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
                                                const sheetDetail = await backend.getSheetItemDetail(item.id);
                                                if (!sheetDetail?.musicList?.length) {
                                                    toast.warn(t("side_bar.download_sheet_empty"));
                                                    return;
                                                }
                                                const onlineMusic = sheetDetail.musicList.filter(
                                                    (it) => !isLocalMusic(it) && Downloader.isDownloaded(it),
                                                );
                                                if (onlineMusic.length === 0) {
                                                    toast.info(t("side_bar.convert_to_local_no_downloaded"));
                                                    return;
                                                }
                                                const musicDetails = await musicSheetDB.musicStore.bulkGet(
                                                    onlineMusic.map((it) => [it.platform, it.id]),
                                                );
                                                const existingLocalMusic = localMusicListStore.getValue() || [];
                                                const localMusicByPath = new Map<string, typeof existingLocalMusic[0]>();
                                                const localMusicByFilename = new Map<string, typeof existingLocalMusic[0]>();
                                                for (const local of existingLocalMusic) {
                                                    if (local?.$$localPath) {
                                                        localMusicByPath.set(local.$$localPath, local);
                                                        const filename = window.path.basename(local.$$localPath).toLowerCase();
                                                        if (!localMusicByFilename.has(filename)) {
                                                            localMusicByFilename.set(filename, local);
                                                        }
                                                    }
                                                }
                                                const localMusicItems: Array<IMusic.IMusicItem & { $$localPath: string }> = [];
                                                const toRemove: IMusic.IMusicItem[] = [];
                                                for (let i = 0; i < musicDetails.length; i++) {
                                                    const detail = musicDetails[i];
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
                                                        toRemove.push(onlineMusic[i]);
                                                    } else {
                                                        const filename = window.path.basename(downloadData.path).toLowerCase();
                                                        const localMatch = localMusicByFilename.get(filename);
                                                        if (localMatch) {
                                                            localMusicItems.push({
                                                                ...localMatch,
                                                            } as IMusic.IMusicItem & { $$localPath: string });
                                                            toRemove.push(onlineMusic[i]);
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
                                                await MusicSheet.frontend.removeMusicFromSheet(toRemove, item.id);
                                                await MusicSheet.frontend.addMusicToSheet(localMusicItems, item.id);
                                                toast.success(
                                                    t("side_bar.convert_to_local_success", {
                                                        count: localMusicItems.length,
                                                    }),
                                                );
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
