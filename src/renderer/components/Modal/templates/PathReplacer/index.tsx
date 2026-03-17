import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { hideModal } from "../..";
import localMusicListStore from "@/renderer/core/local-music/store";
import musicSheetDB from "@/renderer/core/db/music-sheet-db";
import { localPluginName, musicRefSymbol } from "@/common/constant";
import { getMediaPrimaryKey } from "@/common/media-util";
import { queryAllSheets } from "@/renderer/core/music-sheet/backend";

type MatchResult = {
    oldItem: IMusic.IMusicItem;
    newItem: IMusic.IMusicItem;
    sheetNames: string[];
};

type UnmatchedItem = {
    item: IMusic.IMusicItem;
    sheetNames: string[];
    selectedNewItem?: IMusic.IMusicItem;
};

export default function PathReplacer() {
    const { t } = useTranslation();
    const [isScanning, setIsScanning] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [matchedItems, setMatchedItems] = useState<MatchResult[]>([]);
    const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItem[]>([]);
    const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
    const [manualMatchIndex, setManualMatchIndex] = useState<number | null>(null);
    const [searchText, setSearchText] = useState("");
    const [selectedManualItems, setSelectedManualItems] = useState<Map<number, IMusic.IMusicItem>>(new Map());
    const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
    const modalRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);

    const localMusicList = localMusicListStore.useValue() || [];

    useEffect(() => {
        scanInvalidMusic();
    }, []);

    const handleDragStart = (e: React.MouseEvent) => {
        if (!modalRef.current) return;
        isDragging.current = true;
        dragStartPos.current = {
            x: e.clientX - modalPosition.x,
            y: e.clientY - modalPosition.y,
        };
        document.addEventListener("mousemove", handleDragMove);
        document.addEventListener("mouseup", handleDragEnd);
    };

    const handleDragMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        setModalPosition({
            x: e.clientX - dragStartPos.current.x,
            y: e.clientY - dragStartPos.current.y,
        });
    };

    const handleDragEnd = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleDragMove);
        document.removeEventListener("mouseup", handleDragEnd);
    };

    const scanInvalidMusic = async () => {
        setIsScanning(true);
        setMatchedItems([]);
        setUnmatchedItems([]);
        setSelectedMatches(new Set());
        setManualMatchIndex(null);
        setSelectedManualItems(new Map());

        try {
            const localMusicMap = new Map<string, IMusic.IMusicItem>();
            const localMusicByTitleArtist = new Map<string, IMusic.IMusicItem[]>();

            localMusicList.forEach((item) => {
                localMusicMap.set(getMediaPrimaryKey(item), item);
                const key = `${(item.title || "").toLowerCase().trim()}-${(item.artist || "").toLowerCase().trim()}`;
                if (!localMusicByTitleArtist.has(key)) {
                    localMusicByTitleArtist.set(key, []);
                }
                localMusicByTitleArtist.get(key)!.push(item);
            });

            const sheets = await musicSheetDB.sheets.toArray();
            const allMusic = await musicSheetDB.musicStore.toArray();
            const sheetMusicMap = new Map<string, string[]>();

            sheets.forEach((sheet) => {
                const musicList = sheet.musicList || [];
                musicList.forEach((mi) => {
                    const key = getMediaPrimaryKey(mi);
                    if (!sheetMusicMap.has(key)) {
                        sheetMusicMap.set(key, []);
                    }
                    sheetMusicMap.get(key)!.push(sheet.title || "未命名歌单");
                });
            });

            const invalidLocalMusic: IMusic.IMusicItem[] = [];
            const seenKeys = new Set<string>();

            allMusic.forEach((musicItem) => {
                if (musicItem.platform === localPluginName) {
                    const key = getMediaPrimaryKey(musicItem);
                    if (!localMusicMap.has(key) && !seenKeys.has(key)) {
                        seenKeys.add(key);
                        invalidLocalMusic.push(musicItem);
                    }
                }
            });

            const newMatchedItems: MatchResult[] = [];
            const newUnmatchedItems: UnmatchedItem[] = [];

            for (const oldItem of invalidLocalMusic) {
                const key = getMediaPrimaryKey(oldItem);
                const sheetNames = sheetMusicMap.get(key) || [];

                const titleArtistKey = `${(oldItem.title || "").toLowerCase().trim()}-${(oldItem.artist || "").toLowerCase().trim()}`;
                const candidates = localMusicByTitleArtist.get(titleArtistKey) || [];

                if (candidates.length > 0) {
                    const newItem = candidates[0];
                    newMatchedItems.push({
                        oldItem,
                        newItem,
                        sheetNames,
                    });
                } else {
                    newUnmatchedItems.push({
                        item: oldItem,
                        sheetNames,
                    });
                }
            }

            setMatchedItems(newMatchedItems);
            setUnmatchedItems(newUnmatchedItems);
            setSelectedMatches(new Set(newMatchedItems.map((_, i) => i)));
        } catch (e) {
            console.error("[PathReplacer] Scan error:", e);
            toast.error(t("path_replacer.scan_failed"));
        } finally {
            setIsScanning(false);
        }
    };

    const toggleSelect = (index: number) => {
        const newSet = new Set(selectedMatches);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setSelectedMatches(newSet);
    };

    const selectAll = () => {
        setSelectedMatches(new Set(matchedItems.map((_, i) => i)));
    };

    const deselectAll = () => {
        setSelectedMatches(new Set());
    };

    const handleManualSelect = (unmatchedIndex: number, newItem: IMusic.IMusicItem) => {
        const newMap = new Map(selectedManualItems);
        newMap.set(unmatchedIndex, newItem);
        setSelectedManualItems(newMap);
        setManualMatchIndex(null);
        setSearchText("");
    };

    const cancelManualMatch = () => {
        setManualMatchIndex(null);
        setSearchText("");
    };

    const confirmManualMatches = () => {
        const newMatchedItems = [...matchedItems];
        const newUnmatchedItems = unmatchedItems.filter((_, index) => !selectedManualItems.has(index));

        selectedManualItems.forEach((newItem, unmatchedIndex) => {
            const unmatched = unmatchedItems[unmatchedIndex];
            newMatchedItems.push({
                oldItem: unmatched.item,
                newItem,
                sheetNames: unmatched.sheetNames,
            });
        });

        setMatchedItems(newMatchedItems);
        setUnmatchedItems(newUnmatchedItems);
        setSelectedMatches(new Set(newMatchedItems.map((_, i) => i)));
        setSelectedManualItems(new Map());
    };

    const handleReplace = async () => {
        const totalSelected = selectedMatches.size + selectedManualItems.size;
        if (totalSelected === 0) {
            toast.warn(t("path_replacer.no_selection"));
            return;
        }

        setIsProcessing(true);

        try {
            const sheets = await musicSheetDB.sheets.toArray();
            const allMusic = await musicSheetDB.musicStore.toArray();

            const oldToNewMap = new Map<string, IMusic.IMusicItem>();
            matchedItems.forEach((match, index) => {
                if (selectedMatches.has(index)) {
                    oldToNewMap.set(getMediaPrimaryKey(match.oldItem), match.newItem);
                }
            });

            selectedManualItems.forEach((newItem, unmatchedIndex) => {
                const unmatched = unmatchedItems[unmatchedIndex];
                if (unmatched) {
                    oldToNewMap.set(getMediaPrimaryKey(unmatched.item), newItem);
                }
            });

            const musicUpdates: Map<string, any> = new Map();
            const musicDeletes: string[] = [];

            for (const musicItem of allMusic) {
                const key = getMediaPrimaryKey(musicItem);
                if (oldToNewMap.has(key)) {
                    musicDeletes.push(key);
                }
            }

            for (const [oldKey, newItem] of oldToNewMap) {
                const newKey = getMediaPrimaryKey(newItem);
                const existingMusic = allMusic.find(m => getMediaPrimaryKey(m) === newKey);
                
                if (existingMusic) {
                    musicUpdates.set(newKey, {
                        ...existingMusic,
                        [musicRefSymbol]: (existingMusic[musicRefSymbol] || 0) + 1,
                    });
                } else {
                    musicUpdates.set(newKey, {
                        ...newItem,
                        [musicRefSymbol]: 1,
                    });
                }
            }

            await musicSheetDB.transaction(
                "rw",
                musicSheetDB.sheets,
                musicSheetDB.musicStore,
                async () => {
                    for (const sheet of sheets) {
                        let modified = false;
                        const newMusicList = (sheet.musicList || []).map((mi) => {
                            const key = getMediaPrimaryKey(mi);
                            if (oldToNewMap.has(key)) {
                                const newItem = oldToNewMap.get(key)!;
                                modified = true;
                                return {
                                    platform: newItem.platform,
                                    id: newItem.id,
                                };
                            }
                            return mi;
                        });

                        if (modified) {
                            await musicSheetDB.sheets.update(sheet.id, {
                                musicList: newMusicList,
                            });
                        }
                    }

                    for (const key of musicDeletes) {
                        const [platform, id] = key.split("@");
                        await musicSheetDB.musicStore.delete([platform, id]);
                    }

                    for (const [key, value] of musicUpdates) {
                        const [platform, id] = key.split("@");
                        await musicSheetDB.musicStore.put(value);
                    }
                },
            );

            await queryAllSheets();

            toast.success(t("path_replacer.replace_success", { count: totalSelected }));
            hideModal();
        } catch (e) {
            console.error("[PathReplacer] Replace error:", e);
            toast.error(t("path_replacer.replace_failed"));
        } finally {
            setIsProcessing(false);
        }
    };

    const filteredLocalMusic = localMusicList.filter((item) => {
        if (!searchText.trim()) return true;
        const search = searchText.toLowerCase();
        return (
            (item.title || "").toLowerCase().includes(search) ||
            (item.artist || "").toLowerCase().includes(search) ||
            (item.album || "").toLowerCase().includes(search)
        );
    });

    const totalInvalid = matchedItems.length + unmatchedItems.length;
    const totalSelected = selectedMatches.size + selectedManualItems.size;

    return (
        <Base defaultClose>
            <div className="modal--path-replacer-container shadow backdrop-color">
                <Base.Header>{t("path_replacer.title")}</Base.Header>
                <div className="modal--body-container">
                    <div className="hint-text">{t("path_replacer.hint")}</div>

                    {isScanning ? (
                        <div className="scanning-area">
                            <span>{t("path_replacer.scanning")}</span>
                        </div>
                    ) : (
                        <>
                            {totalInvalid === 0 ? (
                                <div className="no-invalid">
                                    <span>{t("path_replacer.no_invalid_music")}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="summary">
                                        <span className="matched-count">
                                            {t("path_replacer.matched_count", { count: matchedItems.length })}
                                        </span>
                                        {unmatchedItems.length > 0 && (
                                            <span className="unmatched-count">
                                                {t("path_replacer.unmatched_count", { count: unmatchedItems.length })}
                                            </span>
                                        )}
                                    </div>

                                    {matchedItems.length > 0 && (
                                        <>
                                            <div className="selection-actions">
                                                <button onClick={selectAll}>{t("local_music_page.select_all")}</button>
                                                <button onClick={deselectAll}>{t("local_music_page.clear_selection")}</button>
                                                <span className="selection-count">
                                                    {t("local_music_page.selected_count", { count: selectedMatches.size })}
                                                </span>
                                            </div>

                                            <div className="match-list">
                                                {matchedItems.map((match, index) => {
                                                    const isSelected = selectedMatches.has(index);
                                                    return (
                                                        <div
                                                            key={index}
                                                            className={`match-item ${isSelected ? "selected" : ""}`}
                                                            onClick={() => toggleSelect(index)}
                                                        >
                                                            <div className="match-check">
                                                                <span>{isSelected ? "☑" : "☐"}</span>
                                                            </div>
                                                            <div className="match-content">
                                                                <div className="match-title">{match.oldItem.title || t("media.unknown_title")}</div>
                                                                <div className="match-artist">{match.oldItem.artist || t("media.unknown_artist")}</div>
                                                                <div className="match-sheets">
                                                                    {t("path_replacer.in_sheets")}: {match.sheetNames.join(", ")}
                                                                </div>
                                                            </div>
                                                            <div className="match-arrow">→</div>
                                                            <div className="match-new">
                                                                <span className="new-badge">{t("path_replacer.new")}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}

                                    {unmatchedItems.length > 0 && (
                                        <div className="unmatched-section">
                                            <div className="unmatched-header">
                                                {t("path_replacer.unmatched_hint")}
                                            </div>
                                            <div className="unmatched-list">
                                                {unmatchedItems.map((item, index) => {
                                                    const hasManualMatch = selectedManualItems.has(index);
                                                    const isEditing = manualMatchIndex === index;
                                                    const manualItem = selectedManualItems.get(index);

                                                    return (
                                                        <div key={index} className={`unmatched-item ${hasManualMatch ? "has-match" : ""}`}>
                                                            <div className="unmatched-info">
                                                                <span className="item-title">{item.item.title || t("media.unknown_title")}</span>
                                                                <span className="item-artist">{item.item.artist || t("media.unknown_artist")}</span>
                                                                <span className="item-sheets">{t("path_replacer.in_sheets")}: {item.sheetNames.join(", ")}</span>
                                                            </div>
                                                            {hasManualMatch ? (
                                                                <div className="manual-match-result">
                                                                    <span className="arrow">→</span>
                                                                    <span className="matched-title">{manualItem?.title}</span>
                                                                    <span className="matched-artist">{manualItem?.artist}</span>
                                                                    <button 
                                                                        className="btn-remove-match"
                                                                        onClick={() => {
                                                                            const newMap = new Map(selectedManualItems);
                                                                            newMap.delete(index);
                                                                            setSelectedManualItems(newMap);
                                                                        }}
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button 
                                                                    className="btn-manual-match"
                                                                    onClick={() => setManualMatchIndex(index)}
                                                                >
                                                                    {t("path_replacer.manual_match")}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {manualMatchIndex !== null && (
                                        <div 
                                            className="manual-match-modal"
                                            ref={modalRef}
                                            style={{
                                                transform: `translate(calc(-50% + ${modalPosition.x}px), calc(-50% + ${modalPosition.y}px))`,
                                            }}
                                        >
                                            <div className="manual-match-header" onMouseDown={handleDragStart}>
                                                <span>{t("path_replacer.select_local_music")}</span>
                                                <button className="btn-close" onClick={cancelManualMatch}>×</button>
                                            </div>
                                            <div className="manual-match-search">
                                                <input
                                                    type="text"
                                                    placeholder={t("path_replacer.search_local_music")}
                                                    value={searchText}
                                                    onChange={(e) => setSearchText(e.target.value)}
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="manual-match-list">
                                                {filteredLocalMusic.slice(0, 50).map((item, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="local-music-item"
                                                        onClick={() => handleManualSelect(manualMatchIndex, item)}
                                                    >
                                                        <span className="item-title">{item.title || t("media.unknown_title")}</span>
                                                        <span className="item-artist">{item.artist || t("media.unknown_artist")}</span>
                                                        <span className="item-album">{item.album || t("media.unknown_album")}</span>
                                                    </div>
                                                ))}
                                                {filteredLocalMusic.length === 0 && (
                                                    <div className="no-results">{t("path_replacer.no_local_music_found")}</div>
                                                )}
                                                {filteredLocalMusic.length > 50 && (
                                                    <div className="more-results">
                                                        {t("path_replacer.more_results", { count: filteredLocalMusic.length - 50 })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
                <div className="footer-options">
                    <div role="button" data-type="normalButton" onClick={hideModal}>
                        {t("common.cancel")}
                    </div>
                    <div
                        role="button"
                        data-type="normalButton"
                        onClick={scanInvalidMusic}
                        data-disabled={isScanning || isProcessing}
                    >
                        {t("path_replacer.rescan")}
                    </div>
                    {selectedManualItems.size > 0 && (
                        <div
                            role="button"
                            data-type="normalButton"
                            onClick={confirmManualMatches}
                            data-disabled={isScanning || isProcessing}
                        >
                            {t("path_replacer.confirm_manual", { count: selectedManualItems.size })}
                        </div>
                    )}
                    <div
                        role="button"
                        data-type="primaryButton"
                        onClick={handleReplace}
                        data-disabled={isScanning || isProcessing || totalSelected === 0}
                    >
                        {isProcessing ? t("path_replacer.processing") : t("path_replacer.replace")}
                    </div>
                </div>
            </div>
        </Base>
    );
}
