import MusicList from "@/renderer/components/MusicList";
import Downloader from "@/renderer/core/downloader";
import { useEffect, useRef, useState, useCallback } from "react";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import { getInternalData } from "@/common/media-util";
import { fsUtil } from "@shared/utils/renderer";
import { i18n } from "@/shared/i18n/renderer";
import { toast } from "react-toastify";
import { showModal } from "@/renderer/components/Modal";
import localMusicListStore from "@/renderer/core/local-music/store";

type InvalidDownloadItem = IMusic.IMusicItem & { $$downloadPath: string };

export default function InvalidDownloads() {
    const downloadedList = Downloader.useDownloadedMusicList();
    const [invalidList, setInvalidList] = useState<InvalidDownloadItem[]>([]);
    const [checking, setChecking] = useState(false);
    const musicListContainerRef = useRef<HTMLDivElement>();

    const checkInvalidDownloads = useCallback(async () => {
        setChecking(true);
        const invalid: InvalidDownloadItem[] = [];
        
        for (const item of downloadedList) {
            const detail = await musicSheetDB.musicStore.get([item.platform, item.id]);
            if (!detail) continue;
            
            const downloadData = getInternalData<IMusic.IMusicItemInternalData>(detail, "downloadData");
            if (!downloadData?.path) continue;
            
            const fileExists = await fsUtil.isFile(downloadData.path).catch(() => false);
            if (!fileExists) {
                invalid.push({
                    ...detail,
                    $$downloadPath: downloadData.path,
                });
            }
        }
        
        setInvalidList(invalid);
        setChecking(false);
    }, [downloadedList]);

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "invalid-downloads",
            path: "/main/download",
        });
    }, []);

    useEffect(() => {
        checkInvalidDownloads();
    }, [checkInvalidDownloads]);

    return (
        <div ref={musicListContainerRef} className="invalid-downloads-container">
            <div className="invalid-downloads-header">
                <span>{i18n.t("download_page.invalid_downloads_count", { count: invalidList.length })}</span>
                <button 
                    className="refresh-btn" 
                    onClick={checkInvalidDownloads}
                    disabled={checking}
                >
                    {checking ? i18n.t("common.loading") : i18n.t("common.refresh")}
                </button>
            </div>
            <MusicList
                musicList={invalidList}
                virtualProps={{
                    getScrollElement() {
                        return document.querySelector("#page-container");
                    },
                    offsetHeight: () => musicListContainerRef.current.offsetTop + 40,
                }}
                contextMenu={[
                    {
                        title: i18n.t("download_page.redownload"),
                        icon: "array-download-tray",
                        async onClick(musicItems) {
                            const items = Array.isArray(musicItems) ? musicItems : [musicItems];
                            Downloader.startDownload(items);
                            toast.success(i18n.t("download_page.redownload_started", { count: items.length }));
                        },
                    },
                    {
                        title: i18n.t("download_page.associate_local_file"),
                        icon: "folder-open",
                        async onClick(musicItems) {
                            const item = Array.isArray(musicItems) ? musicItems[0] : musicItems;
                            showModal("AssociateLocalFile", { 
                                musicItem: item,
                                downloadPath: (item as any).$$downloadPath,
                            });
                        },
                    },
                    {
                        title: i18n.t("download_page.remove_from_list"),
                        icon: "trash",
                        async onClick(musicItems) {
                            const items = Array.isArray(musicItems) ? musicItems : [musicItems];
                            await Downloader.removeDownloadedMusic(items, false);
                            checkInvalidDownloads();
                            toast.success(i18n.t("download_page.removed_from_list", { count: items.length }));
                        },
                    },
                ]}
            ></MusicList>
        </div>
    );
}
