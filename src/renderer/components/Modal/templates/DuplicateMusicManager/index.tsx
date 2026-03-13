import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import { hideModal, showModal } from "../..";
import localMusicListStore from "@/renderer/core/local-music/store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import { getInternalData, setInternalData } from "@/common/media-util";
import { internalDataKey } from "@/common/constant";
import { fsUtil, dialogUtil, appUtil } from "@shared/utils/renderer";
import trackPlayer from "@/renderer/core/track-player";
import fileOperationLogger from "@/renderer/core/file-operation-log";
import {
    detectDuplicates,
    detectFormatIssues,
    detectFileNameIssues,
    formatFileSize,
    DuplicateDetectMode,
    DuplicateGroup,
    FormatIssue,
    FileNameIssue,
} from "@/renderer/core/local-music/duplicate-detector";
import { 
    ignoredItemsStore, 
    addToIgnored, 
    removeFromIgnored, 
    clearIgnoredItems,
    IgnoredItem, 
} from "@/renderer/core/local-music/ignored-store";
import { showContextMenu } from "@/renderer/components/ContextMenu";

type TabType = "duplicates" | "format" | "filename" | "ignored";

interface Position {
    x: number;
    y: number;
}

export default function DuplicateMusicManager() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabType>("duplicates");
    const [detectMode, setDetectMode] = useState<DuplicateDetectMode>("standard");
    
    const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
    const [formatIssues, setFormatIssues] = useState<FormatIssue[]>([]);
    const [fileNameIssues, setFileNameIssues] = useState<FileNameIssue[]>([]);
    const [ignoredItems, setIgnoredItems] = useState<IgnoredItem[]>([]);
    
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [selectedFileNameIssues, setSelectedFileNameIssues] = useState<Set<number>>(new Set());
    const [isScanning, setIsScanning] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [processingStatus, setProcessingStatus] = useState<string>("");

    const [position, setPosition] = useState<Position>({ x: 100, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest(".duplicate-manager-header")) {
            setIsDragging(true);
            dragStartRef.current = {
                x: e.clientX - position.x,
                y: e.clientY - position.y,
            };
        }
    }, [position]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && dragStartRef.current) {
            setPosition({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y,
            });
        }
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStartRef.current = null;
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    useEffect(() => {
        startScan();
    }, []);

    useEffect(() => {
        if (!isScanning) {
            startScan();
        }
    }, [detectMode]);

    const startScan = async () => {
        setIsScanning(true);
        setScanProgress({ current: 0, total: 0 });
        setSelectedItems(new Set());
        setSelectedFileNameIssues(new Set());

        const musicList = localMusicListStore.getValue();
        const duplicates = await detectDuplicates(
            musicList as any, 
            detectMode,
            (current, total) => setScanProgress({ current, total }),
        );
        const format = detectFormatIssues(musicList as any);
        const filenames = await detectFileNameIssues(musicList as any);

        setDuplicateGroups(duplicates);
        setFormatIssues(format);
        setFileNameIssues(filenames);
        setIgnoredItems(ignoredItemsStore.getValue());
        setIsScanning(false);
    };

    const removeFromIgnoredList = (platform: string, id: string) => {
        removeFromIgnored(platform, id);
        setIgnoredItems(ignoredItemsStore.getValue());
    };

    const clearIgnoredList = () => {
        clearIgnoredItems();
        setIgnoredItems([]);
    };

    const handleItemContextMenu = (e: React.MouseEvent, dupItem: { item: IMusic.IMusicItem & { $$localPath: string } }) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu({
            x: e.clientX,
            y: e.clientY,
            menuItems: [
                {
                    icon: "play",
                    title: t("local_music_page.play"),
                    onClick: () => {
                        trackPlayer.playMusic(dupItem.item);
                    },
                },
                {
                    icon: "x-mark",
                    title: t("local_music_page.add_to_ignored"),
                    onClick: () => {
                        addToIgnored(dupItem.item);
                        setIgnoredItems(ignoredItemsStore.getValue());
                        startScan();
                    },
                },
            ],
        });
    };

    const toggleSelectItem = (key: string) => {
        const newSet = new Set(selectedItems);
        if (newSet.has(key)) {
            newSet.delete(key);
        } else {
            newSet.add(key);
        }
        setSelectedItems(newSet);
    };

    const toggleSelectFileNameIssue = (index: number) => {
        const newSet = new Set(selectedFileNameIssues);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedFileNameIssues(newSet);
    };

    const selectAllDuplicates = () => {
        const newSet = new Set<string>();
        duplicateGroups.forEach(group => {
            if (group.items.length > 0) {
                let minSizeIndex = 0;
                let minSize = group.items[0].fileInfo.size;
                group.items.forEach((dupItem, index) => {
                    if (dupItem.fileInfo.size < minSize) {
                        minSize = dupItem.fileInfo.size;
                        minSizeIndex = index;
                    }
                });
                newSet.add(`${group.key}-${minSizeIndex}`);
            }
        });
        setSelectedItems(newSet);
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
    };

    const selectAllFileNameIssues = () => {
        const newSet = new Set<number>();
        fileNameIssues.forEach((issue, index) => {
            if (!issue.targetExists) {
                newSet.add(index);
            }
        });
        setSelectedFileNameIssues(newSet);
    };

    const clearFileNameSelection = () => {
        setSelectedFileNameIssues(new Set());
    };

    const getSelectedItems = (): { item: IMusic.IMusicItem & { $$localPath: string }, key: string }[] => {
        const items: { item: IMusic.IMusicItem & { $$localPath: string }, key: string }[] = [];
        duplicateGroups.forEach(group => {
            group.items.forEach((dupItem, index) => {
                const key = `${group.key}-${index}`;
                if (selectedItems.has(key)) {
                    items.push({ item: dupItem.item, key });
                }
            });
        });
        return items;
    };

    const removeSelectedFromList = async () => {
        const items = getSelectedItems();
        if (items.length === 0) {
            toast.error(t("local_music_page.no_selection"));
            return;
        }

        setIsProcessing(true);
        try {
            for (const { item } of items) {
                addToIgnored(item);
            }

            const currentList = localMusicListStore.getValue();
            const idsToRemove = new Set(items.map(i => `${i.item.platform}-${i.item.id}`));
            const updatedList = currentList.filter(
                item => !idsToRemove.has(`${item.platform}-${item.id}`),
            );
            localMusicListStore.setValue(updatedList);

            toast.success(t("local_music_page.remove_success", { count: items.length }));
            setSelectedItems(new Set());
            await startScan();
        } catch (e) {
            console.error("[RemoveFromList] Error:", e);
            toast.error(t("local_music_page.remove_failed"));
        } finally {
            setIsProcessing(false);
        }
    };

    const moveSelectedFiles = async () => {
        const items = getSelectedItems();
        if (items.length === 0) {
            toast.error(t("local_music_page.no_selection"));
            return;
        }

        const result = await dialogUtil.showOpenDialog({
            title: t("local_music_page.select_move_target_folder"),
            defaultPath: await appUtil.getPath("music"),
            properties: ["openDirectory", "createDirectory"],
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }

        const targetFolder = result.filePaths[0];

        showModal("Reconfirm", {
            title: t("local_music_page.move_files"),
            content: t("local_music_page.move_file_confirm", { count: items.length, folder: targetFolder }),
            async onConfirm() {
                hideModal();
                setIsProcessing(true);
                setProgress({ current: 0, total: items.length });
                setProcessingStatus(t("local_music_page.moving_files"));
                let successCount = 0;
                let failCount = 0;
                const successIds: string[] = [];
                const logItems: Array<{
                    musicItem: IMusic.IMusicItem;
                    sourcePath: string;
                    targetPath: string;
                    success: boolean;
                    error?: string;
                }> = [];

                try {
                    for (let i = 0; i < items.length; i++) {
                        const { item } = items[i];
                        setProgress({ current: i + 1, total: items.length });
                        
                        const filePath = item.$$localPath;
                        if (!filePath) {
                            failCount++;
                            logItems.push({
                                musicItem: item,
                                sourcePath: "",
                                targetPath: "",
                                success: false,
                                error: "No file path",
                            });
                            continue;
                        }

                        try {
                            const fileName = window.path.basename(filePath);
                            const targetPath = window.path.join(targetFolder, fileName);

                            const sourceExists = await fsUtil.isFile(filePath);
                            if (!sourceExists) {
                                failCount++;
                                logItems.push({
                                    musicItem: item,
                                    sourcePath: filePath,
                                    targetPath,
                                    success: false,
                                    error: "Source file not found",
                                });
                                continue;
                            }

                            await fsUtil.moveFile(filePath, targetPath);

                            await musicSheetDB.localMusicStore.delete([item.platform, item.id]);

                            const allMusic = await musicSheetDB.musicStore.toArray();
                            for (const musicItem of allMusic) {
                                const downloadData = getInternalData<IMusic.IMusicItemInternalData>(musicItem, "downloadData");
                                if (downloadData?.path === filePath) {
                                    const updatedItem = setInternalData<IMusic.IMusicItemInternalData>(
                                        musicItem,
                                        "downloadData",
                                        { ...downloadData, path: targetPath },
                                        true,
                                    );
                                    await musicSheetDB.musicStore.update(
                                        [musicItem.platform, musicItem.id],
                                        { [internalDataKey]: updatedItem[internalDataKey] },
                                    );
                                    break;
                                }
                            }

                            successIds.push(`${item.platform}-${item.id}`);
                            successCount++;
                            logItems.push({
                                musicItem: item,
                                sourcePath: filePath,
                                targetPath,
                                success: true,
                            });
                        } catch (e: any) {
                            console.error("[MoveFile] Error:", e);
                            failCount++;
                            const errorMsg = e?.message || String(e);
                            logItems.push({
                                musicItem: item,
                                sourcePath: filePath,
                                targetPath: "",
                                success: false,
                                error: errorMsg,
                            });
                            if (errorMsg.includes("EBUSY") || errorMsg.includes("resource busy")) {
                                toast.error(t("local_music_page.file_busy_error", { name: item.title }));
                            }
                        }
                    }

                    const currentList = localMusicListStore.getValue();
                    const updatedList = currentList.filter(
                        item => !successIds.includes(`${item.platform}-${item.id}`),
                    );
                    localMusicListStore.setValue(updatedList);

                    await fileOperationLogger.logOrganizeDuplicate(logItems, targetFolder);

                    if (successCount > 0) {
                        toast.success(t("local_music_page.move_success", { 
                            success: successCount, 
                            fail: failCount,
                            folder: targetFolder,
                        }));
                    } else {
                        toast.error(t("local_music_page.move_failed"));
                    }
                    await startScan();
                } catch (e) {
                    console.error("[MoveFiles] Error:", e);
                    toast.error(t("local_music_page.move_failed"));
                } finally {
                    setIsProcessing(false);
                    setProgress({ current: 0, total: 0 });
                    setProcessingStatus("");
                }
            },
        });
    };

    const deleteSelectedFiles = async () => {
        const items = getSelectedItems();
        if (items.length === 0) {
            toast.error(t("local_music_page.no_selection"));
            return;
        }

        showModal("Reconfirm", {
            title: t("local_music_page.delete_files"),
            content: t("local_music_page.delete_file_confirm", { count: items.length }),
            async onConfirm() {
                hideModal();
                setIsProcessing(true);
                setProgress({ current: 0, total: items.length });
                setProcessingStatus(t("local_music_page.deleting_files"));
                let successCount = 0;
                let failCount = 0;
                const successIds: string[] = [];
                const logItems: Array<{
                    musicItem: IMusic.IMusicItem;
                    sourcePath: string;
                    success: boolean;
                    error?: string;
                }> = [];

                try {
                    for (let i = 0; i < items.length; i++) {
                        const { item } = items[i];
                        setProgress({ current: i + 1, total: items.length });
                        
                        const filePath = item.$$localPath;
                        if (!filePath) {
                            failCount++;
                            logItems.push({
                                musicItem: item,
                                sourcePath: "",
                                success: false,
                                error: "No file path",
                            });
                            continue;
                        }

                        try {
                            await fsUtil.rimraf(filePath);
                            await musicSheetDB.localMusicStore.delete([item.platform, item.id]);

                            const allMusic = await musicSheetDB.musicStore.toArray();
                            for (const musicItem of allMusic) {
                                const downloadData = getInternalData<IMusic.IMusicItemInternalData>(musicItem, "downloadData");
                                if (downloadData?.path === filePath) {
                                    const updatedItem = setInternalData<IMusic.IMusicItemInternalData>(
                                        musicItem,
                                        "downloadData",
                                        { ...downloadData, path: undefined },
                                        true,
                                    );
                                    await musicSheetDB.musicStore.update(
                                        [musicItem.platform, musicItem.id],
                                        { [internalDataKey]: updatedItem[internalDataKey] },
                                    );
                                    break;
                                }
                            }

                            successIds.push(`${item.platform}-${item.id}`);
                            successCount++;
                            logItems.push({
                                musicItem: item,
                                sourcePath: filePath,
                                success: true,
                            });
                        } catch (e: any) {
                            console.error("[DeleteFile] Error:", e);
                            failCount++;
                            const errorMsg = e?.message || String(e);
                            logItems.push({
                                musicItem: item,
                                sourcePath: filePath,
                                success: false,
                                error: errorMsg,
                            });
                            if (errorMsg.includes("EBUSY") || errorMsg.includes("resource busy")) {
                                toast.error(t("local_music_page.file_busy_error", { name: item.title }));
                            }
                        }
                    }

                    const currentList = localMusicListStore.getValue();
                    const updatedList = currentList.filter(
                        item => !successIds.includes(`${item.platform}-${item.id}`),
                    );
                    localMusicListStore.setValue(updatedList);

                    await fileOperationLogger.logOrganizeDuplicate(logItems);

                    if (successCount > 0) {
                        toast.success(t("local_music_page.delete_success", { 
                            success: successCount, 
                            fail: failCount, 
                        }));
                    } else {
                        toast.error(t("local_music_page.delete_failed"));
                    }
                    await startScan();
                } catch (e) {
                    console.error("[DeleteFiles] Error:", e);
                    toast.error(t("local_music_page.delete_failed"));
                } finally {
                    setIsProcessing(false);
                    setProgress({ current: 0, total: 0 });
                    setProcessingStatus("");
                }
            },
        });
    };

    const batchRenameFiles = async () => {
        const selectedIssues = fileNameIssues.filter((_, index) => selectedFileNameIssues.has(index));
        if (selectedIssues.length === 0) {
            toast.error(t("local_music_page.no_selection"));
            return;
        }

        const validIssues = selectedIssues.filter(issue => !issue.targetExists);
        if (validIssues.length === 0) {
            toast.info(t("local_music_page.all_target_exists"));
            return;
        }

        showModal("Reconfirm", {
            title: t("local_music_page.batch_rename"),
            content: t("local_music_page.batch_rename_confirm", { count: validIssues.length }),
            async onConfirm() {
                hideModal();
                setIsProcessing(true);
                setProgress({ current: 0, total: validIssues.length });
                setProcessingStatus(t("local_music_page.batch_renaming"));
                let successCount = 0;
                let failCount = 0;
                const logItems: Array<{
                    musicItem: IMusic.IMusicItem;
                    sourcePath: string;
                    targetPath: string;
                    success: boolean;
                    error?: string;
                }> = [];

                try {
                    for (let i = 0; i < validIssues.length; i++) {
                        const issue = validIssues[i];
                        setProgress({ current: i + 1, total: validIssues.length });

                        try {
                            const sourceExists = await fsUtil.isFile(issue.currentPath);
                            if (!sourceExists) {
                                console.warn("[BatchRename] Source file not found:", issue.currentPath);
                                failCount++;
                                logItems.push({
                                    musicItem: issue.item,
                                    sourcePath: issue.currentPath,
                                    targetPath: issue.suggestedPath,
                                    success: false,
                                    error: "Source file not found",
                                });
                                continue;
                            }

                            await fsUtil.renameFile(issue.currentPath, issue.suggestedPath);

                            await musicSheetDB.localMusicStore.update(
                                [issue.item.platform, issue.item.id],
                                { $$localPath: issue.suggestedPath },
                            );

                            const currentList = localMusicListStore.getValue();
                            const updatedList = currentList.map(item => {
                                if (item.id === issue.item.id && item.platform === issue.item.platform) {
                                    return { ...item, $$localPath: issue.suggestedPath };
                                }
                                return item;
                            });
                            localMusicListStore.setValue(updatedList);

                            const allMusic = await musicSheetDB.musicStore.toArray();
                            for (const item of allMusic) {
                                const downloadData = getInternalData<IMusic.IMusicItemInternalData>(item, "downloadData");
                                if (downloadData?.path === issue.currentPath) {
                                    const updatedItem = setInternalData<IMusic.IMusicItemInternalData>(
                                        item,
                                        "downloadData",
                                        { ...downloadData, path: issue.suggestedPath },
                                        true,
                                    );
                                    await musicSheetDB.musicStore.update(
                                        [item.platform, item.id],
                                        { [internalDataKey]: updatedItem[internalDataKey] },
                                    );
                                    break;
                                }
                            }

                            successCount++;
                            logItems.push({
                                musicItem: issue.item,
                                sourcePath: issue.currentPath,
                                targetPath: issue.suggestedPath,
                                success: true,
                            });
                        } catch (e) {
                            console.error("[BatchRename] Error:", e);
                            failCount++;
                            logItems.push({
                                musicItem: issue.item,
                                sourcePath: issue.currentPath,
                                targetPath: issue.suggestedPath,
                                success: false,
                                error: String(e),
                            });
                        }
                    }

                    await fileOperationLogger.logBatchRename(logItems);

                    toast.success(t("local_music_page.batch_rename_complete", { 
                        success: successCount, 
                        fail: failCount, 
                    }));
                    setSelectedFileNameIssues(new Set());
                    await startScan();
                } catch (e) {
                    console.error("[BatchRename] Error:", e);
                    toast.error(t("local_music_page.batch_rename_failed"));
                } finally {
                    setIsProcessing(false);
                    setProcessingStatus("");
                    setProgress({ current: 0, total: 0 });
                }
            },
        });
    };

    const duplicateCount = duplicateGroups.reduce((sum, g) => sum + g.count, 0);
    const formatIssueCount = formatIssues.length;
    const fileNameIssueCount = fileNameIssues.length;

    return (
        <Base withBlur={false} draggable={true}>
            <div 
                ref={containerRef}
                className="modal--duplicate-manager-container shadow backdrop-color"
                style={{
                    left: position.x,
                    top: position.y,
                }}
                onMouseDown={handleMouseDown}
            >
                <div className="duplicate-manager-header">
                    <span className="duplicate-manager-title">
                        {t("local_music_page.manage_duplicates")}
                    </span>
                    <div
                        role="button"
                        className="duplicate-manager-close opacity-button"
                        onClick={hideModal}
                    >
                        <SvgAsset iconName="x-mark"></SvgAsset>
                    </div>
                </div>

                <div className="duplicate-manager-content">
                    <div className="tab-selector">
                        <div
                            className={`tab-option ${activeTab === "duplicates" ? "active" : ""}`}
                            onClick={() => setActiveTab("duplicates")}
                        >
                            <SvgAsset iconName="playlist" size={16} />
                            <span>{t("local_music_page.tab_duplicates")}</span>
                            {duplicateCount > 0 && (
                                <span className="tab-badge">{duplicateGroups.length}</span>
                            )}
                        </div>
                        <div
                            className={`tab-option ${activeTab === "format" ? "active" : ""}`}
                            onClick={() => setActiveTab("format")}
                        >
                            <SvgAsset iconName="exclamation-circle" size={16} />
                            <span>{t("local_music_page.tab_format_issues")}</span>
                            {formatIssueCount > 0 && (
                                <span className="tab-badge">{formatIssueCount}</span>
                            )}
                        </div>
                        <div
                            className={`tab-option ${activeTab === "filename" ? "active" : ""}`}
                            onClick={() => setActiveTab("filename")}
                        >
                            <SvgAsset iconName="pencil-square" size={16} />
                            <span>{t("local_music_page.tab_filename_organize")}</span>
                            {fileNameIssueCount > 0 && (
                                <span className="tab-badge">{fileNameIssueCount}</span>
                            )}
                        </div>
                        <div
                            className={`tab-option ${activeTab === "ignored" ? "active" : ""}`}
                            onClick={() => setActiveTab("ignored")}
                        >
                            <SvgAsset iconName="x-mark" size={16} />
                            <span>{t("local_music_page.tab_ignored")}</span>
                            {ignoredItems.length > 0 && (
                                <span className="tab-badge">{ignoredItems.length}</span>
                            )}
                        </div>
                    </div>

                    {isScanning ? (
                        <div className="scanning-area">
                            <SvgAsset iconName="rolling-1s" size={24} />
                            <span>{t("local_music_page.duplicate_scanning")}</span>
                            {scanProgress.total > 0 && (
                                <span className="scan-progress">
                                    {scanProgress.current} / {scanProgress.total}
                                </span>
                            )}
                        </div>
                    ) : (
                        <>
                            {activeTab === "duplicates" && (
                                <div className="duplicates-tab">
                                    <div className="mode-selector">
                                        <span className="mode-label">{t("local_music_page.duplicate_detect_mode")}:</span>
                                        <div
                                            className={`mode-btn ${detectMode === "standard" ? "active" : ""}`}
                                            onClick={() => setDetectMode("standard")}
                                        >
                                            {t("local_music_page.duplicate_mode_standard")}
                                        </div>
                                        <div
                                            className={`mode-btn ${detectMode === "smart" ? "active" : ""}`}
                                            onClick={() => setDetectMode("smart")}
                                        >
                                            {t("local_music_page.duplicate_mode_smart")}
                                        </div>
                                    </div>

                                    {duplicateGroups.length === 0 ? (
                                        <div className="no-issues">
                                            <SvgAsset iconName="check-circle" size={48} />
                                            <span>{t("local_music_page.no_duplicates_found")}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="selection-actions">
                                                <button className="btn-action" onClick={selectAllDuplicates}>
                                                    {t("local_music_page.select_all")}
                                                </button>
                                                <button className="btn-action" onClick={clearSelection}>
                                                    {t("local_music_page.clear_selection")}
                                                </button>
                                                <span className="selection-count">
                                                    {t("local_music_page.selected_count", { count: selectedItems.size })}
                                                </span>
                                            </div>
                                            <div className="duplicate-list">
                                                {duplicateGroups.map((group, groupIndex) => (
                                                    <div key={group.key} className="duplicate-item">
                                                        <div className="dup-header">
                                                            <span className="dup-index">{groupIndex + 1}</span>
                                                            <span className="dup-title">{group.items[0]?.item?.title || "未知"}</span>
                                                            <span className="dup-artist">{group.items[0]?.item?.artist || "未知艺术家"}</span>
                                                            <span className="dup-count">({group.count}首)</span>
                                                        </div>
                                                        <div className="dup-files">
                                                            {group.items.map((dupItem, itemIndex) => {
                                                                const key = `${group.key}-${itemIndex}`;
                                                                const isSelected = selectedItems.has(key);
                                                                return (
                                                                    <div 
                                                                        key={itemIndex} 
                                                                        className={`dup-file ${isSelected ? "selected" : ""}`}
                                                                        onClick={() => toggleSelectItem(key)}
                                                                        onDoubleClick={() => {
                                                                            trackPlayer.playMusic(dupItem.item);
                                                                        }}
                                                                        onContextMenu={(e) => handleItemContextMenu(e, dupItem)}
                                                                    >
                                                                        <span className="file-check">
                                                                            <SvgAsset iconName={isSelected ? "check" : "square"} size={14} />
                                                                        </span>
                                                                        <span className="file-ext">{dupItem.fileInfo.ext?.toUpperCase().replace(".", "") || "?"}</span>
                                                                        <span className="file-size">{formatFileSize(dupItem.fileInfo.size)}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="action-buttons">
                                                {isProcessing ? (
                                                    <div className="processing-progress">
                                                        <div className="progress-bar">
                                                            <div 
                                                                className="progress-fill"
                                                                style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="progress-text">
                                                            {processingStatus} ({progress.current}/{progress.total || 1})
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button 
                                                            className="btn-secondary" 
                                                            onClick={removeSelectedFromList}
                                                            disabled={selectedItems.size === 0}
                                                        >
                                                            {t("local_music_page.remove_from_list")}
                                                        </button>
                                                        <button 
                                                            className="btn-primary" 
                                                            onClick={moveSelectedFiles}
                                                            disabled={selectedItems.size === 0}
                                                        >
                                                            {t("local_music_page.move_files")}
                                                        </button>
                                                        <button 
                                                            className="btn-danger" 
                                                            onClick={deleteSelectedFiles}
                                                            disabled={selectedItems.size === 0}
                                                        >
                                                            {t("local_music_page.delete_files")}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === "format" && (
                                <div className="format-tab">
                                    {formatIssues.length === 0 ? (
                                        <div className="no-issues">
                                            <SvgAsset iconName="check-circle" size={48} />
                                            <span>{t("local_music_page.no_format_issues")}</span>
                                        </div>
                                    ) : (
                                        <div className="issue-list">
                                            {formatIssues.map((issue, index) => (
                                                <div key={index} className="issue-item">
                                                    <span className="issue-title">{issue.item.title}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "filename" && (
                                <div className="filename-tab">
                                    {fileNameIssues.length === 0 ? (
                                        <div className="no-issues">
                                            <SvgAsset iconName="check-circle" size={48} />
                                            <span>{t("local_music_page.no_filename_issues")}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="selection-actions">
                                                <button className="btn-action" onClick={selectAllFileNameIssues}>
                                                    {t("local_music_page.select_all")}
                                                </button>
                                                <button className="btn-action" onClick={clearFileNameSelection}>
                                                    {t("local_music_page.clear_selection")}
                                                </button>
                                                <span className="selection-count">
                                                    {t("local_music_page.selected_count", { count: selectedFileNameIssues.size })}
                                                </span>
                                            </div>
                                            <div className="filename-list">
                                                {fileNameIssues.map((issue, index) => {
                                                    const isSelected = selectedFileNameIssues.has(index);
                                                    return (
                                                        <div 
                                                            key={index} 
                                                            className={`filename-item ${issue.targetExists ? "target-exists" : ""} ${isSelected ? "selected" : ""}`}
                                                            onClick={() => toggleSelectFileNameIssue(index)}
                                                        >
                                                            <span className="file-check">
                                                                <SvgAsset iconName={isSelected ? "check" : "square"} size={14} />
                                                            </span>
                                                            <span className="current-name">{issue.currentFileName}</span>
                                                            <span className="arrow">→</span>
                                                            <span className="suggested-name">{issue.suggestedFileName}</span>
                                                            {issue.targetExists && (
                                                                <span className="warning-badge">{t("local_music_page.target_exists")}</span>
                                                            )}
                                                            <button 
                                                                className="btn-remove-item"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    addToIgnored(issue.item);
                                                                    startScan();
                                                                }}
                                                                title={t("local_music_page.ignore_this_item")}
                                                            >
                                                                <SvgAsset iconName="x-mark" size={14} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="action-buttons">
                                                {isProcessing ? (
                                                    <div className="processing-progress">
                                                        <div className="progress-bar">
                                                            <div 
                                                                className="progress-fill"
                                                                style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="progress-text">
                                                            {processingStatus} ({progress.current}/{progress.total || 1})
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        className="btn-primary" 
                                                        onClick={batchRenameFiles}
                                                        disabled={selectedFileNameIssues.size === 0}
                                                    >
                                                        {t("local_music_page.batch_rename")}
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === "ignored" && (
                                <div className="ignored-tab">
                                    {ignoredItems.length === 0 ? (
                                        <div className="no-issues">
                                            <SvgAsset iconName="check-circle" size={48} />
                                            <span>{t("local_music_page.no_ignored_items")}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="ignored-list">
                                                {ignoredItems.map((item, index) => (
                                                    <div key={index} className="ignored-item">
                                                        <span className="ignored-title">{item.title || "未知"}</span>
                                                        <span className="ignored-artist">{item.artist || "未知艺术家"}</span>
                                                        <button 
                                                            className="btn-restore"
                                                            onClick={() => {
                                                                removeFromIgnoredList(item.platform, item.id);
                                                                startScan();
                                                            }}
                                                        >
                                                            {t("local_music_page.restore")}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="action-buttons">
                                                <button 
                                                    className="btn-secondary" 
                                                    onClick={clearIgnoredList}
                                                >
                                                    {t("local_music_page.clear_ignored")}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Base>
    );
}
