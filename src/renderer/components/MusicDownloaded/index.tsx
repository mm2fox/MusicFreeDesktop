import { isSameMedia } from "@/common/media-util";
import SvgAsset, { SvgAssetIconNames } from "@/renderer/components/SvgAsset";
import { memo, useEffect, useState } from "react";
import "./index.scss";
import { DownloadState, localPluginName } from "@/common/constant";
import Downloader from "@/renderer/core/downloader";
import { useTranslation } from "react-i18next";
import localMusicListStore from "@/renderer/core/local-music/store";
import { showContextMenu, IContextMenuItem } from "@/renderer/components/ContextMenu";
import shellUtil from "@/shared/utils/renderer";
import { toast } from "react-toastify";

interface IMusicDownloadedProps {
    musicItem: IMusic.IMusicItem;
    size?: number;
}

function MusicDownloaded(props: IMusicDownloadedProps) {
    const { musicItem, size = 18 } = props;

    const downloadState = Downloader.useDownloadState(musicItem);

    const { t } = useTranslation();
    const isDownloadedOrLocal =
    downloadState === DownloadState.DONE ||
    musicItem?.platform === localPluginName;

    const [hasLocalMatch, setHasLocalMatch] = useState(false);
    const [localMatchItem, setLocalMatchItem] = useState<IMusic.IMusicItem | null>(null);

    useEffect(() => {
        if (!isDownloadedOrLocal && musicItem) {
            const localMusicList = localMusicListStore.getValue();
            
            const match = localMusicList.find(
                local => {
                    const titleMatch = local.title === musicItem.title;
                    const artistMatch = local.artist === musicItem.artist;
                    return titleMatch && artistMatch;
                },
            );
            
            setHasLocalMatch(!!match);
            setLocalMatchItem(match || null);
        } else {
            setHasLocalMatch(false);
            setLocalMatchItem(null);
        }
    }, [musicItem, isDownloadedOrLocal]);

    useEffect(() => {
        const unsubscribe = localMusicListStore.onValueChange(() => {
            if (!isDownloadedOrLocal && musicItem) {
                const localMusicList = localMusicListStore.getValue();
                
                const match = localMusicList.find(
                    local => {
                        const titleMatch = local.title === musicItem.title;
                        const artistMatch = local.artist === musicItem.artist;
                        return titleMatch && artistMatch;
                    },
                );
                
                setHasLocalMatch(!!match);
                setLocalMatchItem(match || null);
            }
        });

        return unsubscribe;
    }, [musicItem, isDownloadedOrLocal]);

    let iconName: SvgAssetIconNames = "array-download-tray";

    if (isDownloadedOrLocal) {
        iconName = "check-circle";
    } else if (
        downloadState !== DownloadState.NONE &&
    downloadState !== DownloadState.ERROR
    ) {
        iconName = "rolling-1s";
    }

    let statusClass = "music-can-download";
    if (isDownloadedOrLocal) {
        statusClass = "music-downloaded";
    } else if (hasLocalMatch) {
        statusClass = "music-local-match";
    }

    const handleContextMenu = (e: React.MouseEvent) => {
        if (!hasLocalMatch || !localMatchItem) return;

        e.preventDefault();
        e.stopPropagation();

        const localPath = (localMatchItem as any).$$localPath;

        const menuItems: IContextMenuItem[] = [
            {
                title: t("music_list_context_menu.reveal_local_music_in_file_explorer"),
                icon: "folder-open",
                onClick: async () => {
                    try {
                        if (localPath) {
                            const result = await shellUtil.showItemInFolder(localPath);
                            if (!result) {
                                throw new Error();
                            }
                        }
                    } catch (err) {
                        toast.error(
                            `${t("music_list_context_menu.reveal_local_music_in_file_explorer_fail")} ${err?.message ?? ""}`,
                        );
                    }
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
            className={`music-download-base ${statusClass}`}
            title={
                isDownloadedOrLocal
                    ? t("common.downloaded")
                    : hasLocalMatch
                        ? "本地已有"
                        : t("common.download")
            }
            onClick={(e) => {
                e.stopPropagation();
                if (
                    musicItem && (downloadState === DownloadState.NONE ||
                downloadState === DownloadState.ERROR)
                ) {
                    Downloader.startDownload(musicItem);
                }
            }}
            onContextMenu={handleContextMenu}
        >
            <SvgAsset iconName={iconName} size={size}></SvgAsset>
        </div>
    );
}

export default memo(MusicDownloaded, (prev, curr) =>
    isSameMedia(prev.musicItem, curr.musicItem),
);
