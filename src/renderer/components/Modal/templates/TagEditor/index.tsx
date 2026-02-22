import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import { setFallbackAlbum } from "@/renderer/utils/img-on-error";
import albumImg from "@/assets/imgs/album-cover.jpg";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useEffect, useState, useCallback } from "react";
import MusicTag from "@shared/music-tag/renderer";
import { toast } from "react-toastify";
import { hideModal } from "../..";
import { localPluginName } from "@/common/constant";
import { getInternalData } from "@/common/media-util";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import localMusicListStore from "@/renderer/core/local-music/store";
import { dialogUtil } from "@shared/utils/renderer";
import { useDraggable } from "./useDraggable";

interface ITagEditorProps {
    musicItem: IMusic.IMusicItem;
}

interface ITagFormData {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    year: string;
    date: string;
    genre: string;
    comment: string;
    lyrics: string;
    artwork: string;
}

const supportedWriteFormats = [".mp3", ".flac"];

export default function TagEditor(props: ITagEditorProps) {
    const { musicItem } = props;
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState<ITagFormData>({
        title: "",
        artist: "",
        album: "",
        albumArtist: "",
        year: "",
        date: "",
        genre: "",
        comment: "",
        lyrics: "",
        artwork: "",
    });
    const [originalArtwork, setOriginalArtwork] = useState<string>("");
    const [filePath, setFilePath] = useState<string>("");
    const [fileExt, setFileExt] = useState<string>("");
    const [canWrite, setCanWrite] = useState(false);

    const { position, handleMouseDown } = useDraggable();

    const loadTags = useCallback(async () => {
        setLoading(true);
        try {
            let localPath = "";
            
            if (musicItem.platform === localPluginName) {
                localPath = (musicItem as any).$$localPath || (musicItem as any).localPath || "";
            } else {
                const storedItem = await musicSheetDB.musicStore.get([musicItem.platform, musicItem.id]);
                const downloadData = getInternalData(storedItem || musicItem, "downloadData");
                if (downloadData?.path) {
                    localPath = downloadData.path;
                }
            }

            if (!localPath) {
                const localMusicList = localMusicListStore.getValue();
                const match = localMusicList.find(
                    local => local.title === musicItem.title && local.artist === musicItem.artist,
                );
                if (match) {
                    localPath = (match as any).$$localPath || (match as any).localPath || "";
                }
            }

            if (!localPath) {
                setLoading(false);
                toast.error(t("tag_editor.file_not_found"));
                return;
            }

            console.log("[TagEditor] Loading tags from:", localPath);
            setFilePath(localPath);
            const ext = window.path.extname(localPath).toLowerCase();
            setFileExt(ext);
            setCanWrite(supportedWriteFormats.includes(ext));

            const result = await MusicTag.readTags(localPath);
            
            console.log("[TagEditor] Read result:", result);
            console.log("[TagEditor] Read tags detail:", JSON.stringify(result.tags, null, 2));
            
            if (result.success) {
                let title = result.tags?.title || "";
                let artist = result.tags?.artist || "";
                const album = result.tags?.album || "";
                const year = result.tags?.year || "";
                const genre = result.tags?.genre || "";
                const comment = result.tags?.comment || "";
                const artwork = result.tags?.artwork || "";

                console.log("[TagEditor] Before parse - title:", title, "artist:", artist);

                if (!title && !artist) {
                    const fileName = window.path.basename(localPath, ext);
                    console.log("[TagEditor] Parsing from filename:", fileName);
                    
                    if (fileName.includes("-")) {
                        const parts = fileName.split("-").map((s) => s.trim());
                        console.log("[TagEditor] Split parts:", parts);
                        if (parts.length === 2) {
                            const firstPart = parts[0].trim();
                            const secondPart = parts[1].trim();
                            
                            if (firstPart.length > 0 && secondPart.length > 0) {
                                if (firstPart.length <= 30 && secondPart.length <= 30) {
                                    if (firstPart.length < secondPart.length) {
                                        artist = firstPart;
                                        title = secondPart;
                                        console.log("[TagEditor] Parsed (short first): artist =", artist, "title =", title);
                                    } else {
                                        artist = secondPart;
                                        title = firstPart;
                                        console.log("[TagEditor] Parsed (short second): artist =", artist, "title =", title);
                                    }
                                }
                            }
                        }
                    } else {
                        title = fileName;
                        console.log("[TagEditor] No dash, using filename as title:", title);
                    }
                } else {
                    console.log("[TagEditor] Skip parse - title:", title, "artist:", artist);
                }

                const newFormData = {
                    title,
                    artist,
                    album,
                    albumArtist: result.tags?.albumArtist || "",
                    year,
                    date: result.tags?.date || "",
                    genre,
                    comment,
                    lyrics: result.tags?.lyrics || "",
                    artwork,
                };
                console.log("[TagEditor] Setting form data:", JSON.stringify(newFormData, null, 2));
                setFormData(newFormData);
                setOriginalArtwork(artwork);
            } else {
                console.error("[TagEditor] Read tags error:", result.error);
                toast.error(result.error || t("tag_editor.read_error"));
            }
        } catch (error: any) {
            console.error("[TagEditor] Load error:", error);
            toast.error(error?.message || t("tag_editor.read_error"));
        } finally {
            setLoading(false);
        }
    }, [musicItem, t]);

    useEffect(() => {
        loadTags();
    }, [loadTags]);

    const handleInputChange = (field: keyof ITagFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleArtworkChange = async () => {
        const result = await dialogUtil.showOpenDialog({
            title: t("tag_editor.select_cover"),
            filters: [
                { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "bmp"] },
            ],
            properties: ["openFile"],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            try {
                const { fsUtil } = await import("@shared/utils/renderer");
                const buffer = await fsUtil.readFile(selectedPath);
                const base64 = buffer.toString("base64");
                const ext = window.path.extname(selectedPath).toLowerCase();
                let mimeType = "image/jpeg";
                if (ext === ".png") mimeType = "image/png";
                else if (ext === ".gif") mimeType = "image/gif";
                else if (ext === ".webp") mimeType = "image/webp";
                else if (ext === ".bmp") mimeType = "image/bmp";
                
                const artworkData = `data:${mimeType};base64,${base64}`;
                setFormData(prev => ({ ...prev, artwork: artworkData }));
            } catch {
                toast.error(t("tag_editor.cover_load_error"));
            }
        }
    };

    const handleRemoveArtwork = () => {
        setFormData(prev => ({ ...prev, artwork: "" }));
    };

    const handleRestoreArtwork = () => {
        setFormData(prev => ({ ...prev, artwork: originalArtwork }));
    };

    const handleSwapTitleArtist = () => {
        setFormData(prev => ({
            ...prev,
            title: prev.artist,
            artist: prev.title,
        }));
    };

    const handleSave = async () => {
        if (!canWrite) {
            toast.error(t("tag_editor.format_not_supported", { format: fileExt }));
            return;
        }

        if (!filePath) {
            toast.error(t("tag_editor.file_not_found"));
            return;
        }

        setSaving(true);
        try {
            const result = await MusicTag.writeTags(filePath, {
                title: formData.title,
                artist: formData.artist,
                album: formData.album,
                albumArtist: formData.albumArtist,
                year: formData.year,
                date: formData.date,
                genre: formData.genre,
                comment: formData.comment,
                lyrics: formData.lyrics,
                artwork: formData.artwork,
            });

            console.log("[TagEditor] Write result:", result);

            if (result.success) {
                if (musicItem.platform === localPluginName) {
                    try {
                        await musicSheetDB.localMusicStore.update(
                            [musicItem.platform, musicItem.id],
                            {
                                title: formData.title || musicItem.title,
                                artist: formData.artist || musicItem.artist,
                                album: formData.album || musicItem.album,
                            }
                        );
                        const allMusic = await musicSheetDB.localMusicStore.toArray();
                        localMusicListStore.setValue(allMusic);
                    } catch (e) {
                        console.error("[TagEditor] Failed to update local music store:", e);
                    }
                }
                
                toast.success(t("tag_editor.save_success"));
                await loadTags();
            } else {
                console.error("[TagEditor] Write error:", result.error);
                toast.error(result.error || t("tag_editor.save_error"));
            }
        } catch (error: any) {
            console.error("[TagEditor] Save error:", error);
            toast.error(error?.message || t("tag_editor.save_error"));
        } finally {
            setSaving(false);
        }
    };

    const displayArtwork = formData.artwork || musicItem.artwork || albumImg;

    return (
        <Base withBlur={false}>
            <div 
                className="modal--tag-editor-container shadow backdrop-color"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                }}
            >
                <div 
                    className="tag-editor-header"
                    onMouseDown={handleMouseDown}
                >
                    <span className="tag-editor-title">{t("tag_editor.title")}</span>
                    <div
                        role="button"
                        className="tag-editor-close opacity-button"
                        onClick={hideModal}
                    >
                        <SvgAsset iconName="x-mark"></SvgAsset>
                    </div>
                </div>
                <div className="tag-editor-content">
                    {loading ? (
                        <div className="loading-container">
                            <SvgAsset iconName="rolling-1s" size={32} />
                            <span>{t("tag_editor.loading")}</span>
                        </div>
                    ) : (
                        <>
                            <div className="tag-editor-artwork">
                                <img
                                    src={displayArtwork}
                                    onError={setFallbackAlbum}
                                    alt={formData.title || "Cover"}
                                />
                                {canWrite && (
                                    <div className="artwork-actions">
                                        <button 
                                            className="artwork-btn"
                                            onClick={handleArtworkChange}
                                            title={t("tag_editor.change_cover")}
                                        >
                                            <SvgAsset iconName="photo" size={16} />
                                        </button>
                                        {formData.artwork && (
                                            <button 
                                                className="artwork-btn"
                                                onClick={handleRemoveArtwork}
                                                title={t("tag_editor.remove_cover")}
                                            >
                                                <SvgAsset iconName="trash" size={16} />
                                            </button>
                                        )}
                                        {originalArtwork && formData.artwork !== originalArtwork && (
                                            <button 
                                                className="artwork-btn"
                                                onClick={handleRestoreArtwork}
                                                title={t("tag_editor.restore_cover")}
                                            >
                                                <SvgAsset iconName="arrow-path" size={16} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="tag-editor-form">
                                <div className="form-row">
                                    <label>{t("tag_editor.title_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => handleInputChange("title", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.title_placeholder")}
                                    />
                                    <button 
                                        className="swap-btn"
                                        onClick={handleSwapTitleArtist}
                                        disabled={!canWrite}
                                        title={t("tag_editor.swap_title_artist")}
                                    >
                                        <SvgAsset iconName="sort" size={16} />
                                    </button>
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.artist_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.artist}
                                        onChange={(e) => handleInputChange("artist", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.artist_placeholder")}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.album_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.album}
                                        onChange={(e) => handleInputChange("album", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.album_placeholder")}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.album_artist_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.albumArtist}
                                        onChange={(e) => handleInputChange("albumArtist", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.album_artist_placeholder")}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.year_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.year}
                                        onChange={(e) => handleInputChange("year", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.year_placeholder")}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.date_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.date}
                                        onChange={(e) => handleInputChange("date", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.date_placeholder")}
                                    />
                                </div>
                                <div className="form-row">
                                    <label>{t("tag_editor.genre_label")}</label>
                                    <input
                                        type="text"
                                        value={formData.genre}
                                        onChange={(e) => handleInputChange("genre", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.genre_placeholder")}
                                    />
                                </div>
                                <div className="form-row full-width">
                                    <label>{t("tag_editor.comment_label")}</label>
                                    <textarea
                                        value={formData.comment}
                                        onChange={(e) => handleInputChange("comment", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.comment_placeholder")}
                                        rows={3}
                                    />
                                </div>
                                <div className="form-row full-width">
                                    <label>{t("tag_editor.lyrics_label")}</label>
                                    <textarea
                                        value={formData.lyrics}
                                        onChange={(e) => handleInputChange("lyrics", e.target.value)}
                                        disabled={!canWrite}
                                        placeholder={t("tag_editor.lyrics_placeholder")}
                                        rows={5}
                                    />
                                </div>
                                
                                {!canWrite && (
                                    <div className="format-warning">
                                        <SvgAsset iconName="exclamation-circle" size={14} />
                                        <span>{t("tag_editor.format_warning", { format: fileExt })}</span>
                                    </div>
                                )}

                                <div className="form-actions">
                                    <button 
                                        className="btn-cancel"
                                        onClick={hideModal}
                                    >
                                        {t("common.cancel")}
                                    </button>
                                    <button 
                                        className="btn-save"
                                        onClick={handleSave}
                                        disabled={!canWrite || saving}
                                    >
                                        {saving ? (
                                            <>
                                                <SvgAsset iconName="rolling-1s" size={14} />
                                                <span>{t("tag_editor.saving")}</span>
                                            </>
                                        ) : (
                                            <span>{t("tag_editor.save")}</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Base>
    );
}
