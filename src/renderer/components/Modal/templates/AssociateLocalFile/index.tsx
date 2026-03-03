import Base from "../Base";
import "./index.scss";
import { hideModal } from "../..";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { dialogUtil, fsUtil } from "@shared/utils/renderer";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusicListStore from "@/renderer/core/local-music/store";
import { setInternalData } from "@/common/media-util";
import { localPluginName } from "@/common/constant";
import { toast } from "react-toastify";
import Downloader from "@/renderer/core/downloader";

interface IAssociateLocalFileProps {
    musicItem: IMusic.IMusicItem;
    downloadPath?: string;
}

export default function AssociateLocalFile(props: IAssociateLocalFileProps) {
    const { musicItem, downloadPath } = props;
    const [selectedPath, setSelectedPath] = useState<string>("");
    const { t } = useTranslation();

    useEffect(() => {
        if (downloadPath) {
            setSelectedPath(downloadPath);
        }
    }, [downloadPath]);

    const handleSelectFile = async () => {
        const result = await dialogUtil.showOpenDialog({
            title: t("download_page.select_local_file"),
            filters: [
                { name: t("download_page.audio_files"), extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "wma"] },
            ],
            properties: ["openFile"],
        });
        
        if (!result.canceled && result.filePaths.length > 0) {
            setSelectedPath(result.filePaths[0]);
        }
    };

    const handleAssociate = async () => {
        if (!selectedPath) {
            toast.warn(t("download_page.please_select_file"));
            return;
        }

        try {
            const fileExists = await fsUtil.isFile(selectedPath);
            if (!fileExists) {
                toast.error(t("download_page.file_not_exists"));
                return;
            }

            const detail = await musicSheetDB.musicStore.get([musicItem.platform, musicItem.id]);
            if (!detail) {
                toast.error(t("download_page.music_not_found"));
                return;
            }

            const localMusicItem = {
                ...detail,
                platform: localPluginName,
                $$localPath: selectedPath,
            };

            const existingLocalMusic = localMusicListStore.getValue() || [];
            const existingPaths = new Set(
                existingLocalMusic.map((it) => it?.$$localPath).filter(Boolean),
            );

            if (!existingPaths.has(selectedPath)) {
                await musicSheetDB.localMusicStore.put(localMusicItem);
                localMusicListStore.setValue([...existingLocalMusic, localMusicItem]);
            }

            await Downloader.removeDownloadedMusic(musicItem, false);

            toast.success(t("download_page.associate_success"));
            hideModal();
        } catch (e) {
            toast.error(t("download_page.associate_failed") + (e?.message || ""));
        }
    };

    return (
        <Base defaultClose>
            <div className="modal--associate-local-file-container shadow backdrop-color">
                <Base.Header>{t("download_page.associate_local_file")}</Base.Header>
                <div className="modal--body-container">
                    <div className="music-info">
                        <div className="info-row">
                            <span className="label">{t("media.media_title")}:</span>
                            <span className="value">{musicItem.title}</span>
                        </div>
                        <div className="info-row">
                            <span className="label">{t("media.media_type_artist")}:</span>
                            <span className="value">{musicItem.artist}</span>
                        </div>
                    </div>
                    
                    <div className="file-selector">
                        <div className="selector-label">{t("download_page.local_file_path")}:</div>
                        <div className="selector-row">
                            <input
                                type="text"
                                value={selectedPath}
                                onChange={(e) => setSelectedPath(e.target.value)}
                                placeholder={t("download_page.select_local_file_hint")}
                            />
                            <button onClick={handleSelectFile}>{t("common.open")}</button>
                        </div>
                    </div>
                </div>
                <div className="footer-options">
                    <div role="button" data-type="normalButton" onClick={hideModal}>
                        {t("common.cancel")}
                    </div>
                    <div role="button" data-type="primaryButton" onClick={handleAssociate}>
                        {t("common.confirm")}
                    </div>
                </div>
            </div>
        </Base>
    );
}
