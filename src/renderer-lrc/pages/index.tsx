import "./index.scss";
import classNames from "@/renderer/utils/classnames";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Condition from "@/renderer/components/Condition";
import SvgAsset from "@/renderer/components/SvgAsset";
import { DownloadState, PlayerState, localPluginName } from "@/common/constant";
import getTextWidth from "@/renderer/utils/get-text-width";
import useAppConfig from "@/hooks/useAppConfig";
import { appWindowUtil } from "@shared/utils/renderer";
import AppConfig from "@shared/app-config/renderer";
import messageBus, { useAppStatePartial } from "@shared/message-bus/renderer/extension";
import { IAppState } from "@shared/message-bus/type";

type TranslationMode = "both" | "none" | "translation";

const translationModeTitle: Record<TranslationMode, string> = {
    both: "显示原歌词和翻译",
    none: "只显示原歌词",
    translation: "只显示翻译",
};

const nextTranslationMode: Record<TranslationMode, TranslationMode> = {
    both: "none",
    none: "translation",
    translation: "both",
};

export default function LyricWindowPage() {
    const currentMusic = useAppStatePartial("musicItem");
    const playerState = useAppStatePartial("playerState");
    const downloadState = useAppStatePartial("downloadState");
    const isFavorite = useAppStatePartial("isFavorite");
    const lockLyric = useAppConfig("lyric.lockLyric");
    const showTranslationConfig = useAppConfig("lyric.showTranslation");
    const [showOperations, setShowOperations] = useState(false);

    const mouseOverTimerRef = useRef<number | null>(null);

    const translationMode: TranslationMode = showTranslationConfig ?? "both";

    useEffect(() => {
        if (lockLyric) {
            setShowOperations(false);
        }
    }, [lockLyric]);

    useEffect(() => {
        if (!lockLyric) {
            appWindowUtil.ignoreMouseEvent(true);
        }
    }, [lockLyric]);

    const isDownloadedOrLocal =
        downloadState === DownloadState.DONE ||
        currentMusic?.platform === localPluginName;

    const isDownloading =
        downloadState !== DownloadState.NONE &&
        downloadState !== DownloadState.ERROR &&
        downloadState !== DownloadState.DONE;

    let downloadIconName: "array-download-tray" | "check-circle" | "rolling-1s" = "array-download-tray";
    if (isDownloadedOrLocal) {
        downloadIconName = "check-circle";
    } else if (isDownloading) {
        downloadIconName = "rolling-1s";
    }

    const toggleTranslation = () => {
        const nextMode = nextTranslationMode[translationMode];
        AppConfig.setConfig({
            "lyric.showTranslation": nextMode,
        });
    };

    return (
        <div
            className={classNames({
                "container": true,
                "lock-lyric": lockLyric,
            })}
            onDoubleClick={() => {
                appWindowUtil.showMainWindow();
            }}
            onMouseOver={() => {
                if (!lockLyric || mouseOverTimerRef.current) {
                    if (!lockLyric) {
                        setShowOperations(true);
                    }
                    return;
                }
                mouseOverTimerRef.current = window.setTimeout(() => {
                    setShowOperations(true);
                    clearTimeout(mouseOverTimerRef.current);
                    mouseOverTimerRef.current = null;
                }, 1000);
            }}
            onMouseLeave={() => {
                setShowOperations(false);
                if (mouseOverTimerRef.current) {
                    clearTimeout(mouseOverTimerRef.current);
                    mouseOverTimerRef.current = null;
                }
            }}
        >
            <div className='operation-outer-container'>
                <Condition condition={showOperations}>
                    <div
                        className="operation-container"
                        onMouseOver={() => {
                            appWindowUtil.ignoreMouseEvent(false);
                        }}
                        onMouseLeave={() => {
                            appWindowUtil.ignoreMouseEvent(true);
                        }}
                    >
                        <Condition condition={!lockLyric}>
                            <div className="music-title">
                                {currentMusic ? `${currentMusic.title} - ${currentMusic.artist}` : ""}
                            </div>
                        </Condition>
                        <div
                            className="operation-button"
                            onClick={() => {
                                messageBus.sendCommand("SkipToPrevious");
                            }}
                        >
                            <SvgAsset iconName="skip-left"></SvgAsset>
                        </div>
                        <div
                            className="operation-button"
                            onClick={() => {
                                if (currentMusic) {
                                    messageBus.sendCommand("TogglePlayerState");
                                }
                            }}
                        >
                            <SvgAsset
                                iconName={
                                    playerState === PlayerState.Playing ? "pause" : "play"
                                }
                            ></SvgAsset>
                        </div>
                        <div
                            className="operation-button"
                            onClick={() => {
                                messageBus.sendCommand("SkipToNext");
                            }}
                        >
                            <SvgAsset iconName="skip-right"></SvgAsset>
                        </div>
                        <div
                            className="operation-button"
                            onClick={() => {
                                if (currentMusic) {
                                    messageBus.sendCommand("ToggleFavorite", currentMusic);
                                }
                            }}
                        >
                            <SvgAsset iconName={isFavorite ? "heart" : "heart-outline"}></SvgAsset>
                        </div>
                        <div
                            className="operation-button"
                            onClick={() => {
                                if (currentMusic && !isDownloadedOrLocal && !isDownloading) {
                                    messageBus.sendCommand("DownloadMusic", currentMusic);
                                }
                            }}
                        >
                            <SvgAsset iconName={downloadIconName}></SvgAsset>
                        </div>
                        <div
                            className={classNames({
                                "operation-button": true,
                                "active": translationMode === "both",
                                "translation-only": translationMode === "translation",
                            })}
                            onClick={toggleTranslation}
                            title={translationModeTitle[translationMode]}
                        >
                            <SvgAsset iconName="language"></SvgAsset>
                        </div>
                        <Condition
                            condition={lockLyric}
                            falsy={
                                <div
                                    className="operation-button"
                                    onClick={() => {
                                        AppConfig.setConfig({
                                            "lyric.lockLyric": true,
                                        });
                                    }}
                                >
                                    <SvgAsset iconName="lock-closed"></SvgAsset>
                                </div>
                            }
                        >
                            <div
                                className="operation-button"
                                onClick={() => {
                                    AppConfig.setConfig({
                                        "lyric.lockLyric": false,
                                    });
                                }}
                            >
                                <SvgAsset iconName="lock-open"></SvgAsset>
                            </div>
                        </Condition>
                        <div
                            className="operation-button"
                            onClick={() => {
                                appWindowUtil.setLyricWindow(false);
                            }}
                        >
                            <SvgAsset iconName="x-mark"></SvgAsset>
                        </div>
                    </div>
                </Condition>
            </div>
            <div className="content-container">
                <LyricContent></LyricContent>
            </div>
        </div>
    );
}

function LyricContent() {
    const currentMusic = useAppStatePartial("musicItem");
    const currentLyric = useAppStatePartial("parsedLrc");
    const currentFullLyric = useAppStatePartial("fullLyric");

    const fontDataConfig = useAppConfig("lyric.fontData");
    const fontSizeConfig = useAppConfig("lyric.fontSize");
    const fontColorConfig = useAppConfig("lyric.fontColor");
    const fontStrokeConfig = useAppConfig("lyric.strokeColor");
    const showTranslationConfig = useAppConfig("lyric.showTranslation");

    const [enableTransition, setEnableTransition] = useState(false);

    const translationMode: TranslationMode = showTranslationConfig ?? "both";
    const hasTranslation = currentLyric?.translation && currentLyric.translation.trim() !== "";
    const showLrc = translationMode !== "translation";
    const showTrans = translationMode === "both" && hasTranslation;
    const showOnlyTranslation = translationMode === "translation" && hasTranslation;

    const textWidth = useMemo(() => {
        const mainFontSize = fontSizeConfig ?? 48;
        const transFontSize = mainFontSize * 0.6;

        if (showOnlyTranslation && currentLyric?.translation) {
            return getTextWidth(currentLyric.translation, {
                fontSize: transFontSize,
                fontFamily: fontDataConfig?.family || undefined,
            });
        }

        if (currentLyric?.lrc) {
            const lrcWidth = getTextWidth(currentLyric?.lrc, {
                fontSize: mainFontSize,
                fontFamily: fontDataConfig?.family || undefined,
            });
            if (showTrans) {
                const transWidth = getTextWidth(currentLyric.translation, {
                    fontSize: transFontSize,
                    fontFamily: fontDataConfig?.family || undefined,
                });
                return Math.max(lrcWidth, transWidth);
            }
            return lrcWidth;
        } else if (currentMusic) {
            return getTextWidth(`${currentMusic.title} - ${currentMusic.artist}`, {
                fontSize: mainFontSize,
                fontFamily: fontDataConfig?.family || undefined,
            });
        }
        return 0;
    }, [currentLyric, fontDataConfig, fontSizeConfig, currentMusic, showTrans, showOnlyTranslation]);

    const [left, setLeft] = useState(null);

    useLayoutEffect(() => {
        if (textWidth > window.innerWidth) {
            setEnableTransition(false);
            setLeft(0);
        } else {
            setLeft(null);
        }
    }, [textWidth]);

    useLayoutEffect(() => {
        const callback =(_: any, patch: IAppState) => {
            if (!patch.progress) {
                return;
            }
            if (textWidth > window.innerWidth) {
                if (currentLyric && currentLyric.index > -1 && currentFullLyric) {
                    const nextLyric = currentFullLyric[currentLyric.index + 1];
                    if (nextLyric && (nextLyric.time > currentLyric.time)) {
                        const diff = nextLyric.time - currentLyric.time;
                        const virtualPointer = (patch.progress - currentLyric.time) / diff * textWidth;
                        if (virtualPointer > window.innerWidth * 0.5) {
                            setEnableTransition(true);
                            setLeft(-Math.min((virtualPointer - window.innerWidth * 0.5) * 1.1, textWidth - window.innerWidth));
                            return;
                        }
                    }
                }
                setEnableTransition(false);
                setLeft(0);
            } else {
                setEnableTransition(false);
                setLeft(null);
            }
        };
        messageBus.onStateChange(callback);

        return () => {
            messageBus.offStateChange(callback);
        };

    }, [textWidth, currentFullLyric, currentLyric]);


    return (
        <div
            className="lyric-text-row"
            style={{
                color: fontColorConfig,
                WebkitTextStrokeColor: fontStrokeConfig,
                fontSize: fontSizeConfig,
                fontFamily: fontDataConfig?.family || undefined,
                left: left,
                transition: enableTransition ? "left 900ms linear" : "none",
            }}
        >
            {showOnlyTranslation ? (
                <div
                    className="lyric-translation-only"
                    style={{
                        fontSize: `calc(${fontSizeConfig ?? 48}px * 0.8)`,
                    }}
                >
                    {currentLyric?.translation ?? (currentMusic ? `${currentMusic.title} - ${currentMusic.artist}` : "暂无歌词")}
                </div>
            ) : (
                <>
                    <div className="lyric-main">
                        {currentLyric?.lrc ??
                            (currentMusic
                                ? `${currentMusic.title} - ${currentMusic.artist}`
                                : "暂无歌词")}
                    </div>
                    {showTrans && (
                        <div
                            className="lyric-translation"
                            style={{
                                fontSize: `calc(${fontSizeConfig ?? 48}px * 0.6)`,
                            }}
                        >
                            {currentLyric.translation}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
