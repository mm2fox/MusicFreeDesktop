import "./index.scss";
import Condition, { IfTruthy } from "@/renderer/components/Condition";
import Loading from "@/renderer/components/Loading";
import { useEffect, useRef, useState } from "react";
import { showCustomContextMenu } from "@/renderer/components/ContextMenu";
import {
    getUserPreference,
    setUserPreference,
    useUserPreference,
} from "@/renderer/utils/user-perference";
import { toast } from "react-toastify";
import { showModal } from "@/renderer/components/Modal";
import SvgAsset from "@/renderer/components/SvgAsset";
import LyricParser from "@/renderer/utils/lyric-parser";
import { getLinkedLyric, unlinkLyric, saveTranslation, getSavedTranslation } from "@/renderer/core/link-lyric";
import { getMediaPrimaryKey } from "@/common/media-util";
import { useTranslation } from "react-i18next";
import { useLyric } from "@renderer/core/track-player/hooks";
import trackPlayer from "@renderer/core/track-player";
import { dialogUtil, fsUtil } from "@shared/utils/renderer";
import { translateLyricLines, isLyricChinese, getAutoTranslateNonChinese } from "@/renderer/services/translate-service";
import AppConfig from "@shared/app-config/renderer";

export default function Lyric() {
    const lyricContext = useLyric();
    const lyricParser = lyricContext?.parser;
    const currentLrc = lyricContext?.currentLrc;

    const containerRef = useRef<HTMLDivElement>();

    const [fontSize, setFontSize] = useState<string | null>(
        getUserPreference("inlineLyricFontSize"),
    );

    const [showTranslation, setShowTranslation] =
    useUserPreference("showTranslation");
    const [isTranslating, setIsTranslating] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const { t } = useTranslation();

    const mountRef = useRef(false);
    const lastAutoTranslateMusicRef = useRef<string | null>(null);

    const cancelTranslation = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const handleAutoTranslate = async () => {
        if (!lyricParser || isTranslating) return;
        
        const lyricItems = lyricParser.getLyricItems();
        if (!lyricItems || lyricItems.length === 0) return;

        const currentMusic = trackPlayer.currentMusic;
        if (!currentMusic) {
            toast.error(t("music_detail.auto_translate_fail"));
            return;
        }

        setIsTranslating(true);
        abortControllerRef.current = new AbortController();
        const toastId = toast.loading(
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span>{t("music_detail.auto_translating")}</span>
                <button 
                    onClick={() => {
                        cancelTranslation();
                        toast.dismiss(toastId);
                    }}
                    style={{
                        background: "transparent",
                        border: "1px solid currentColor",
                        borderRadius: "4px",
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontSize: "12px",
                    }}
                >
                    {t("music_detail.cancel")}
                </button>
            </div>,
            { autoClose: false },
        );

        try {
            const lines = lyricItems.map(item => item.lrc);
            const result = await translateLyricLines(lines, abortControllerRef.current.signal);
            
            if (!result.success) {
                throw new Error(result.error || "Translation failed");
            }
            
            const timeToLrctime = (sec: number) => {
                const min = Math.floor(sec / 60);
                sec = sec - min * 60;
                const secInt = Math.floor(sec);
                const secFloat = sec - secInt;
                return `[${min.toFixed(0).padStart(2, "0")}:${secInt
                    .toString()
                    .padStart(2, "0")}.${secFloat.toFixed(2).slice(2)}]`;
            };
            
            const translationWithTimestamp = lyricItems
                .map((item, index) => `${timeToLrctime(item.time)} ${result.lines[index] || ""}`)
                .join("\r\n");
            
            const newParser = new LyricParser(lyricParser.toString({ withTimestamp: true }), {
                musicItem: currentMusic,
                translation: translationWithTimestamp,
            });
            
            trackPlayer.setCurrentLyric({
                parser: newParser,
                currentLrc: newParser.getPosition(trackPlayer.progress.currentTime || 0),
            });
            
            setShowTranslation(true);
            
            const autoSaveTranslation = AppConfig.getConfig("translate.autoSaveTranslation") ?? true;
            if (autoSaveTranslation) {
                await saveTranslation(currentMusic, translationWithTimestamp);
            }
            
            const successMsg = result.failedCount > 0 
                ? `${t("music_detail.auto_translate_success")} (${result.failedCount} ${t("music_detail.translate_lines_failed")})`
                : t("music_detail.auto_translate_success");
            
            toast.update(toastId, {
                render: successMsg,
                type: result.failedCount > 0 ? "warning" : "success",
                isLoading: false,
                autoClose: 3000,
            });
        } catch (error) {
            const errorMessage = (error as Error).message;
            if (errorMessage === "Translation cancelled") {
                toast.update(toastId, {
                    render: t("music_detail.translate_cancelled"),
                    type: "info",
                    isLoading: false,
                    autoClose: 2000,
                });
            } else {
                console.error("Auto translate error:", error);
                toast.update(toastId, {
                    render: `${t("music_detail.auto_translate_fail")}: ${errorMessage}`,
                    type: "error",
                    isLoading: false,
                    autoClose: 3000,
                });
            }
        } finally {
            setIsTranslating(false);
            abortControllerRef.current = null;
        }
    };

    useEffect(() => {
        if (containerRef.current) {
            const currentIndex = lyricContext?.currentLrc?.index;
            if (currentIndex >= 0) {
                const dom = document.querySelector(`#lyric-item-id-${currentIndex}`) as
          | HTMLDivElement
          | undefined;
                if (dom) {
                    const offsetTop =
            dom.offsetTop -
            containerRef.current.clientHeight / 2 +
            dom.clientHeight / 2;
                    containerRef.current.scrollTo({
                        behavior: mountRef.current ? "smooth" : "auto",
                        top: offsetTop,
                    });
                }
            }
        }
        mountRef.current = true;
    }, [currentLrc]);

    useEffect(() => {
        const autoTranslateNonChinese = getAutoTranslateNonChinese();
        if (!autoTranslateNonChinese || !lyricParser || isTranslating) return;
        
        if (lyricParser.hasTranslation) return;
        
        const currentMusic = trackPlayer.currentMusic;
        if (!currentMusic) return;
        
        const musicKey = getMediaPrimaryKey(currentMusic);
        if (lastAutoTranslateMusicRef.current === musicKey) return;
        lastAutoTranslateMusicRef.current = musicKey;
        
        const rawLrc = lyricParser.toString({ withTimestamp: true });
        if (isLyricChinese(rawLrc)) return;
        
        handleAutoTranslate();
    }, [lyricParser]);

    const optionsComponent = (
        <div className="lyric-options-container">
            <div
                className="lyric-option-item"
                role="button"
                title={t("music_detail.translation")}
                data-active={
                    !!showTranslation && (lyricParser?.hasTranslation ?? false)
                }
                data-disabled={!lyricParser?.hasTranslation}
                onClick={() => {
                    setShowTranslation(!showTranslation);
                }}
            >
                <SvgAsset iconName="language"></SvgAsset>
            </div>
            <div
                className="lyric-option-item"
                role="button"
                title={t("music_detail.auto_translate")}
                data-disabled={!lyricParser || isTranslating}
                onClick={handleAutoTranslate}
            >
                <SvgAsset iconName={isTranslating ? "rolling-1s" : "sparkles"}></SvgAsset>
            </div>
        </div>
    );

    return (
        <div className="lyric-container-outer">
            <div
                className="lyric-container"
                data-loading={lyricContext === null}
                onContextMenu={(e) => {
                    showCustomContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        width: 200,
                        height: 146,
                        component: (
                            <LyricContextMenu
                                setLyricFontSize={setFontSize}
                                lyricParser={lyricParser}
                            ></LyricContextMenu>
                        ),
                    });
                }}
                style={
                    fontSize
                        ? {
                            fontSize: `${fontSize}px`,
                        }
                        : null
                }
                ref={containerRef}
            >
                {
                    <Condition
                        condition={lyricContext !== null}
                        falsy={<Loading></Loading>}
                    >
                        <Condition
                            condition={lyricParser}
                            falsy={
                                <>
                                    <div className="lyric-item">{t("music_detail.no_lyric")}</div>
                                    <div
                                        className="lyric-item search-lyric"
                                        role="button"
                                        onClick={() => {
                                            const currentMusic = trackPlayer.currentMusic;
                                            showModal("SearchLyric", {
                                                defaultTitle: currentMusic?.title,
                                                musicItem: currentMusic,
                                            });
                                        }}
                                    >
                                        {t("music_detail.search_lyric")}
                                    </div>
                                </>
                            }
                        >
                            {lyricParser?.getLyricItems?.()?.map((lyricItem, index) => (
                                <div key={index}>
                                    <div
                                        className="lyric-item"
                                        id={`lyric-item-id-${index}`}
                                        data-highlight={currentLrc?.index === index}
                                    >
                                        {lyricItem.lrc}
                                    </div>
                                    <IfTruthy
                                        condition={lyricParser?.hasTranslation && showTranslation}
                                    >
                                        <div
                                            className="lyric-item lyric-item-translation"
                                            id={`tr-lyric-item-id-${index}`}
                                            data-highlight={currentLrc?.index === index}
                                        >
                                            {lyricItem.translation}
                                        </div>
                                    </IfTruthy>
                                </div>
                            ))}
                        </Condition>
                    </Condition>
                }
            </div>
            {optionsComponent}
        </div>
    );
}

interface ILyricContextMenuProps {
    setLyricFontSize: (val: string) => void;
    lyricParser: LyricParser;
}

function LyricContextMenu(props: ILyricContextMenuProps) {
    const { setLyricFontSize, lyricParser } = props;

    const [fontSize, setFontSize] = useState<string | null>(
        getUserPreference("inlineLyricFontSize") ?? "13",
    );
    const [showTranslation, setShowTranslation] =
    useUserPreference("showTranslation");

    const [linkedLyricInfo, setLinkedLyricInfo] = useState<IMedia.IUnique>(null);

    const { t } = useTranslation();

    const currentMusicRef = useRef<IMusic.IMusicItem>(
        trackPlayer.currentMusic ?? ({} as any),
    );

    useEffect(() => {
        if (currentMusicRef.current?.platform) {
            getLinkedLyric(currentMusicRef.current).then((linked) => {
                if (linked) {
                    setLinkedLyricInfo(linked);
                }
            });
        }
    }, []);

    function handleFontSize(val: string | number) {
        if (val) {
            const nVal = +val;
            if (8 <= nVal && nVal <= 32) {
                setUserPreference("inlineLyricFontSize", `${val}`);
                setLyricFontSize(`${val}`);
            }
        }
    }

    async function downloadLyric(fileType: "lrc" | "txt") {
        let rawLrc = "";
        if (fileType === "lrc") {
            rawLrc = lyricParser.toString({
                withTimestamp: true,
            });
        } else {
            rawLrc = lyricParser.toString();
        }

        try {
            const result = await dialogUtil.showSaveDialog({
                title: t("music_detail.lyric_ctx_download_lyric"),
                defaultPath:
          currentMusicRef.current.title +
          (fileType === "lrc" ? ".lrc" : ".txt"),
                filters: [
                    {
                        name: t("media.media_type_lyric"),
                        extensions: ["lrc", "txt"],
                    },
                ],
            });
            if (!result.canceled && result.filePath) {
                await fsUtil.writeFile(result.filePath, rawLrc, "utf-8");
                toast.success(t("music_detail.lyric_ctx_download_success"));
            } else {
                throw new Error();
            }
        } catch {
            toast.error(t("music_detail.lyric_ctx_download_fail"));
        }
    }

    return (
        <>
            <div className="lyric-ctx-menu--set-font-title">
                {t("music_detail.lyric_ctx_set_font_size")}
            </div>
            <div
                className="lyric-ctx-menu--font-container"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    role="button"
                    className="font-size-button"
                    onClick={() => {
                        if (fontSize) {
                            setFontSize((prev) => {
                                const newFontSize = +prev - 1;
                                handleFontSize(newFontSize);
                                if (newFontSize < 8) {
                                    return "8";
                                } else if (newFontSize > 32) {
                                    return "32";
                                }
                                return `${newFontSize}`;
                            });
                        }
                    }}
                >
                    <SvgAsset iconName="font-size-smaller"></SvgAsset>
                </div>
                <input
                    type="number"
                    max={32}
                    min={8}
                    value={fontSize}
                    onChange={(e) => {
                        const val = e.target.value;
                        handleFontSize(val);
                        setFontSize(e.target.value.trim());
                    }}
                ></input>
                <div
                    role="button"
                    className="font-size-button"
                    onClick={() => {
                        if (fontSize) {
                            setFontSize((prev) => {
                                const newFontSize = +prev + 1;
                                handleFontSize(newFontSize);
                                if (newFontSize < 8) {
                                    return "8";
                                } else if (newFontSize > 32) {
                                    return "32";
                                }
                                return `${newFontSize}`;
                            });
                        }
                    }}
                >
                    <SvgAsset iconName="font-size-larger"></SvgAsset>
                </div>
            </div>
            <div className="divider"></div>
            <div
                className="lyric-ctx-menu--row-container"
                role="button"
                data-disabled={!lyricParser?.hasTranslation}
                onClick={() => {
                    setShowTranslation(!showTranslation);
                }}
            >
                {showTranslation
                    ? t("music_detail.hide_translation")
                    : t("music_detail.show_translation")}
            </div>
            <div
                className="lyric-ctx-menu--row-container"
                role="button"
                data-disabled={!lyricParser}
                onClick={() => {
                    downloadLyric("lrc");
                }}
            >
                {t("music_detail.lyric_ctx_download_lyric_lrc")}
            </div>
            <div
                className="lyric-ctx-menu--row-container"
                role="button"
                data-disabled={!lyricParser}
                onClick={() => {
                    downloadLyric("txt");
                }}
            >
                {t("music_detail.lyric_ctx_download_lyric_txt")}
            </div>
            <div className="divider"></div>
            <div
                className="lyric-ctx-menu--row-container"
                role="button"
                onClick={() => {
                    showModal("SearchLyric", {
                        defaultTitle: currentMusicRef.current.title,
                        musicItem: currentMusicRef.current,
                    });
                }}
            >
                <span>
                    {linkedLyricInfo
                        ? `${t("music_detail.media_lyric_linked")} ${getMediaPrimaryKey(
                            linkedLyricInfo,
                        )}`
                        : t("music_detail.search_lyric")}
                </span>
            </div>
            <div
                className="lyric-ctx-menu--row-container"
                role="button"
                data-disabled={!linkedLyricInfo}
                onClick={async () => {
                    try {
                        await unlinkLyric(currentMusicRef.current);
                        if (trackPlayer.isCurrentMusic(currentMusicRef.current)) {
                            trackPlayer.fetchCurrentLyric(true);
                        }
                        toast.success(t("music_detail.toast_media_lyric_unlinked"));
                    } catch {
                        // pass
                    }
                }}
            >
                {t("music_detail.unlink_media_lyric")}
            </div>
        </>
    );
}
