import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useState } from "react";
import { toast } from "react-toastify";
import { hideModal } from "../..";
import { useAllCustomTags, getMusicByTag, LocalMusicItem } from "@/renderer/core/local-music/custom-tags";
import MusicSheet from "@/renderer/core/music-sheet";
import * as MusicSheetBackend from "@/renderer/core/music-sheet/backend";
import localMusicListStore from "@/renderer/core/local-music/store";
import MusicTag from "@shared/music-tag/renderer";
import { useDraggable } from "../TagEditor/useDraggable";

type ConverterMode = "tagToSheet" | "sheetToTag";

interface IResult {
    success: number;
    fail: number;
    skip: number;
}

interface ITagSheetConverterProps {}

export default function TagSheetConverter(props: ITagSheetConverterProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<ConverterMode>("tagToSheet");
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [result, setResult] = useState<IResult | null>(null);
    
    const allTags = useAllCustomTags();
    const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
    const allSheets = MusicSheet.frontend.useAllSheets();
    const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
    
    const { position, handleMouseDown } = useDraggable();

    const toggleTag = (tag: string) => {
        const newSet = new Set(selectedTags);
        if (newSet.has(tag)) {
            newSet.delete(tag);
        } else {
            newSet.add(tag);
        }
        setSelectedTags(newSet);
    };

    const toggleSheet = (sheetId: string) => {
        const newSet = new Set(selectedSheets);
        if (newSet.has(sheetId)) {
            newSet.delete(sheetId);
        } else {
            newSet.add(sheetId);
        }
        setSelectedSheets(newSet);
    };

    const handleTagToSheet = async () => {
        if (selectedTags.size === 0) {
            toast.error(t("tag_sheet_converter.no_tags_selected"));
            return;
        }

        setProcessing(true);
        setProgress({ current: 0, total: selectedTags.size });
        setResult(null);

        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;
        const tagsArray = Array.from(selectedTags);

        for (let i = 0; i < tagsArray.length; i++) {
            const tag = tagsArray[i];
            const musicItems = getMusicByTag(tag);
            
            if (musicItems.length === 0) {
                skipCount++;
                setProgress({ current: i + 1, total: tagsArray.length });
                continue;
            }

            try {
                const newSheet = await MusicSheet.frontend.addSheet(tag);
                await MusicSheet.frontend.addMusicToSheet(musicItems, newSheet.id);
                successCount++;
            } catch (e) {
                console.error(`[TagToSheet] Failed to create sheet for tag ${tag}:`, e);
                failCount++;
            }

            setProgress({ current: i + 1, total: tagsArray.length });
        }

        setProcessing(false);
        setResult({ success: successCount, fail: failCount, skip: skipCount });
    };

    const handleSheetToTag = async () => {
        if (selectedSheets.size === 0) {
            toast.error(t("tag_sheet_converter.no_sheets_selected"));
            return;
        }

        setProcessing(true);
        setResult(null);
        const sheetsArray = Array.from(selectedSheets);
        
        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;

        const localMusicList = localMusicListStore.getValue();
        const localMusicMap = new Map<string, LocalMusicItem>();
        localMusicList.forEach(item => {
            const localPath = (item as any).$$localPath || (item as any).localPath;
            if (localPath) {
                localMusicMap.set(`${item.platform}-${item.id}`, item as LocalMusicItem);
            }
        });

        for (const sheetId of sheetsArray) {
            const sheetDetail = await MusicSheetBackend.getSheetItemDetail(sheetId);
            if (!sheetDetail?.musicList) continue;

            const sheetName = sheetDetail.title;
            const localItemsInSheet: LocalMusicItem[] = [];

            for (const item of sheetDetail.musicList) {
                const key = `${item.platform}-${item.id}`;
                const localItem = localMusicMap.get(key);
                if (localItem) {
                    localItemsInSheet.push(localItem);
                }
            }

            setProgress({ current: 0, total: localItemsInSheet.length });

            for (let i = 0; i < localItemsInSheet.length; i++) {
                const item = localItemsInSheet[i];
                const filePath = item.$$localPath;
                
                if (!filePath) {
                    skipCount++;
                    setProgress({ current: i + 1, total: localItemsInSheet.length });
                    continue;
                }

                const ext = window.path.extname(filePath).toLowerCase();
                if (![".mp3", ".flac"].includes(ext)) {
                    skipCount++;
                    setProgress({ current: i + 1, total: localItemsInSheet.length });
                    continue;
                }

                try {
                    const existingTags = await MusicTag.readTagsWithoutArtwork(filePath);
                    const currentComment = existingTags.success && existingTags.tags?.comment 
                        ? existingTags.tags.comment 
                        : "";
                    
                    const commentLines = currentComment.split("\n").filter(line => line.trim());
                    if (!commentLines.some(line => line.trim() === sheetName)) {
                        commentLines.push(sheetName);
                        const newComment = commentLines.join("\n");
                        
                        const writeResult = await MusicTag.writeTags(filePath, {
                            comment: newComment,
                        });

                        if (writeResult.success) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    } else {
                        skipCount++;
                    }
                } catch (e) {
                    console.error(`[SheetToTag] Failed to write tag for ${filePath}:`, e);
                    failCount++;
                }

                setProgress({ current: i + 1, total: localItemsInSheet.length });
            }
        }

        setProcessing(false);
        setResult({ success: successCount, fail: failCount, skip: skipCount });
    };

    const handleExecute = () => {
        if (mode === "tagToSheet") {
            handleTagToSheet();
        } else {
            handleSheetToTag();
        }
    };

    const handleClose = () => {
        hideModal();
    };

    return (
        <Base withBlur={false}>
            <div
                className="modal--tag-sheet-converter-container shadow backdrop-color"
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                }}
            >
                <div
                    className="tag-sheet-converter-header"
                    onMouseDown={handleMouseDown}
                >
                    <span className="tag-sheet-converter-title">
                        {t("tag_sheet_converter.title")}
                    </span>
                    <div
                        role="button"
                        className="tag-sheet-converter-close opacity-button"
                        onClick={hideModal}
                    >
                        <SvgAsset iconName="x-mark"></SvgAsset>
                    </div>
                </div>
                <div className="tag-sheet-converter-content">
                    <div className="mode-selector">
                        <div
                            className={`mode-option ${mode === "tagToSheet" ? "active" : ""}`}
                            onClick={() => !processing && !result && setMode("tagToSheet")}
                        >
                            <SvgAsset iconName="tag" size={18} />
                            <span>{t("tag_sheet_converter.tag_to_sheet")}</span>
                        </div>
                        <div
                            className={`mode-option ${mode === "sheetToTag" ? "active" : ""}`}
                            onClick={() => !processing && !result && setMode("sheetToTag")}
                        >
                            <SvgAsset iconName="list-bullet" size={18} />
                            <span>{t("tag_sheet_converter.sheet_to_tag")}</span>
                        </div>
                    </div>

                    {!result ? (
                        <>
                            <div className="selection-area">
                                {mode === "tagToSheet" ? (
                                    <>
                                        <label>{t("tag_sheet_converter.select_tags")}</label>
                                        <div className="items-grid">
                                            {allTags.length === 0 ? (
                                                <div className="no-items-hint">
                                                    {t("tag_sheet_converter.no_tags_hint")}
                                                </div>
                                            ) : (
                                                allTags.map((tag) => {
                                                    const musicCount = getMusicByTag(tag).length;
                                                    return (
                                                        <div
                                                            key={tag}
                                                            className={`item-card ${selectedTags.has(tag) ? "selected" : ""}`}
                                                            onClick={() => !processing && toggleTag(tag)}
                                                        >
                                                            <div className="item-checkbox">
                                                                {selectedTags.has(tag) ? (
                                                                    <SvgAsset iconName="check" size={16} />
                                                                ) : (
                                                                    <SvgAsset iconName="square" size={16} />
                                                                )}
                                                            </div>
                                                            <div className="item-info">
                                                                <span className="item-name">{tag}</span>
                                                                <span className="item-count">
                                                                    {musicCount} {t("tag_sheet_converter.songs")}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <label>{t("tag_sheet_converter.select_sheets")}</label>
                                        <div className="items-grid">
                                            {allSheets.map((sheet) => (
                                                <div
                                                    key={sheet.id}
                                                    className={`item-card ${selectedSheets.has(sheet.id) ? "selected" : ""}`}
                                                    onClick={() => !processing && toggleSheet(sheet.id)}
                                                >
                                                    <div className="item-checkbox">
                                                        {selectedSheets.has(sheet.id) ? (
                                                            <SvgAsset iconName="check" size={16} />
                                                        ) : (
                                                            <SvgAsset iconName="square" size={16} />
                                                        )}
                                                    </div>
                                                    <div className="item-info">
                                                        <span className="item-name">{sheet.title}</span>
                                                        <span className="item-count">
                                                            {sheet.musicList?.length || 0} {t("tag_sheet_converter.songs")}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {processing && (
                                <div className="progress-area">
                                    <div className="progress-bar">
                                        <div
                                            className="progress-fill"
                                            style={{
                                                width: `${(progress.current / Math.max(progress.total, 1)) * 100}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="progress-text">
                                        {progress.current} / {progress.total}
                                    </span>
                                </div>
                            )}

                            <div className="hint-area">
                                {mode === "tagToSheet" ? (
                                    <p>{t("tag_sheet_converter.tag_to_sheet_hint")}</p>
                                ) : (
                                    <p>{t("tag_sheet_converter.sheet_to_tag_hint")}</p>
                                )}
                            </div>

                            <div className="form-actions">
                                <button className="btn-cancel" onClick={hideModal} disabled={processing}>
                                    {t("common.cancel")}
                                </button>
                                <button
                                    className="btn-execute"
                                    onClick={handleExecute}
                                    disabled={processing}
                                >
                                    {processing ? (
                                        <>
                                            <SvgAsset iconName="rolling-1s" size={14} />
                                            <span>{t("tag_sheet_converter.processing")}</span>
                                        </>
                                    ) : (
                                        <span>{t("tag_sheet_converter.execute")}</span>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="result-area">
                            <div className="result-icon">
                                <SvgAsset iconName="check-circle" size={48} />
                            </div>
                            <div className="result-title">
                                {t("tag_sheet_converter.complete")}
                            </div>
                            <div className="result-stats">
                                <div className="stat-item success">
                                    <span className="stat-value">{result.success}</span>
                                    <span className="stat-label">{t("tag_sheet_converter.result_success")}</span>
                                </div>
                                {result.fail > 0 && (
                                    <div className="stat-item fail">
                                        <span className="stat-value">{result.fail}</span>
                                        <span className="stat-label">{t("tag_sheet_converter.result_fail")}</span>
                                    </div>
                                )}
                                <div className="stat-item skip">
                                    <span className="stat-value">{result.skip}</span>
                                    <span className="stat-label">{t("tag_sheet_converter.result_skip")}</span>
                                </div>
                            </div>
                            <div className="form-actions">
                                <button className="btn-execute" onClick={handleClose}>
                                    {t("tag_sheet_converter.close")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Base>
    );
}
