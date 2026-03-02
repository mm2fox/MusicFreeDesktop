import { useState, useEffect, useCallback, useMemo } from "react";
import { hideModal } from "../..";
import Base from "../Base";
import "./index.scss";
import Condition from "@/renderer/components/Condition";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useTranslation } from "react-i18next";
import FileConverter from "@shared/file-converter/renderer";
import { toast } from "react-toastify";

interface MusicItemWithPath extends IMusic.IMusicItem {
    $$localPath?: string;
}

interface IProps {
    musicItems?: MusicItemWithPath[];
    defaultFormat?: string;
    onConvertComplete?: (results: { inputPath: string; outputPath?: string; success: boolean }[]) => void;
}

interface ConvertTask {
    inputPath: string;
    outputPath?: string;
    format: string;
    status: "pending" | "converting" | "success" | "failed";
    progress: number;
    error?: string;
}

const supportedInputFormats = [".m4s", ".mp3", ".wav", ".aac", ".ogg", ".wma", ".m4a", ".flac", ".opus"];

export default function FileConverterModal(props: IProps) {
    const { musicItems, defaultFormat = "flac", onConvertComplete } = props;
    const { t } = useTranslation();
    
    const [selectedFormat, setSelectedFormat] = useState(defaultFormat);
    const [selectedInputFilter, setSelectedInputFilter] = useState<string>("all");
    const [outputDir, setOutputDir] = useState<string>("");
    const [quality, setQuality] = useState<string>("original");
    const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
    const [ffmpegError, setFfmpegError] = useState<string>("");
    const [tasks, setTasks] = useState<ConvertTask[]>([]);
    const [isConverting, setIsConverting] = useState(false);

    const inputFormatStats = useMemo(() => {
        const stats: Record<string, number> = { all: 0 };
        supportedInputFormats.forEach((fmt) => {
            stats[fmt] = 0;
        });
        
        if (musicItems) {
            musicItems.forEach((item) => {
                const localPath = item.$$localPath;
                if (localPath) {
                    stats.all++;
                    const ext = window.path.extname(localPath).toLowerCase();
                    if (stats[ext] !== undefined) {
                        stats[ext]++;
                    }
                }
            });
        }
        return stats;
    }, [musicItems]);

    const filteredTasks = useMemo(() => {
        if (selectedInputFilter === "all") {
            return tasks;
        }
        return tasks.filter((task) => {
            const ext = window.path.extname(task.inputPath).toLowerCase();
            return ext === selectedInputFilter;
        });
    }, [tasks, selectedInputFilter]);

    useEffect(() => {
        FileConverter.checkFfmpeg().then((result) => {
            setFfmpegAvailable(result.available);
            if (!result.available) {
                setFfmpegError(result.error || "FFmpeg not available");
            }
        });
    }, []);

    useEffect(() => {
        if (musicItems && musicItems.length > 0) {
            const firstItem = musicItems[0];
            const localPath = firstItem?.$$localPath;
            if (localPath) {
                setOutputDir(window.path.dirname(localPath));
            }
            
            const initialTasks: ConvertTask[] = musicItems
                .filter((item) => item.$$localPath)
                .map((item) => ({
                    inputPath: item.$$localPath || "",
                    format: selectedFormat,
                    status: "pending" as const,
                    progress: 0,
                }));
            setTasks(initialTasks);
        }
    }, [musicItems]);

    const selectOutputDirectory = async () => {
        const result = await FileConverter.selectOutputDir();
        if (result.success && result.path) {
            setOutputDir(result.path);
        }
    };

    const startConversion = useCallback(async () => {
        if (!outputDir || filteredTasks.length === 0) return;
        
        setIsConverting(true);
        const results: { inputPath: string; outputPath?: string; success: boolean }[] = [];

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            
            const ext = window.path.extname(task.inputPath).toLowerCase();
            if (selectedInputFilter !== "all" && ext !== selectedInputFilter) {
                continue;
            }
            
            setTasks((prev) => {
                const newTasks = [...prev];
                newTasks[i] = { ...newTasks[i], status: "converting" };
                return newTasks;
            });

            const inputExt = window.path.extname(task.inputPath);
            const inputBaseName = window.path.basename(task.inputPath, inputExt);
            const outputPath = window.path.join(outputDir, `${inputBaseName}.${selectedFormat}`);

            try {
                const result = await FileConverter.convert({
                    inputPath: task.inputPath,
                    outputPath,
                    format: selectedFormat,
                    quality,
                });

                if (result.success) {
                    setTasks((prev) => {
                        const newTasks = [...prev];
                        newTasks[i] = { 
                            ...newTasks[i], 
                            status: "success", 
                            progress: 100,
                            outputPath: result.outputPath,
                        };
                        return newTasks;
                    });
                    results.push({ 
                        inputPath: task.inputPath, 
                        outputPath: result.outputPath, 
                        success: true, 
                    });
                } else {
                    setTasks((prev) => {
                        const newTasks = [...prev];
                        newTasks[i] = { 
                            ...newTasks[i], 
                            status: "failed", 
                            error: result.error,
                        };
                        return newTasks;
                    });
                    results.push({ 
                        inputPath: task.inputPath, 
                        success: false, 
                    });
                }
            } catch (error: any) {
                setTasks((prev) => {
                    const newTasks = [...prev];
                    newTasks[i] = { 
                        ...newTasks[i], 
                        status: "failed", 
                        error: error?.message || "Unknown error",
                    };
                    return newTasks;
                });
                results.push({ 
                    inputPath: task.inputPath, 
                    success: false, 
                });
            }
        }

        setIsConverting(false);
        
        const successCount = results.filter((r) => r.success).length;
        const failCount = results.length - successCount;
        
        toast.success(t("file_converter.convert_complete", { 
            success: successCount, 
            fail: failCount, 
        }));
        
        onConvertComplete?.(results);
    }, [outputDir, tasks, selectedFormat, selectedInputFilter, quality, t, onConvertComplete, filteredTasks.length]);

    const formatOptions = [
        { value: "flac", label: "FLAC (无损)" },
        { value: "mp3", label: "MP3" },
        { value: "wav", label: "WAV" },
        { value: "aac", label: "AAC" },
        { value: "ogg", label: "OGG" },
    ];

    const qualityOptions = [
        { value: "original", label: t("file_converter.quality_original") },
        { value: "low", label: t("file_converter.quality_low") },
        { value: "standard", label: t("file_converter.quality_standard") },
        { value: "high", label: t("file_converter.quality_high") },
    ];

    const inputFilterOptions = useMemo(() => {
        const options: Array<{ value: string; label: string; count: number }> = [];
        
        options.push({ 
            value: "all", 
            label: t("file_converter.filter_all"), 
            count: inputFormatStats.all, 
        });
        
        supportedInputFormats.forEach((fmt) => {
            if (inputFormatStats[fmt] > 0) {
                options.push({
                    value: fmt,
                    label: fmt.toUpperCase().replace(".", ""),
                    count: inputFormatStats[fmt],
                });
            }
        });
        
        return options;
    }, [inputFormatStats, t]);

    const successCount = filteredTasks.filter((task) => task.status === "success").length;
    const failedCount = filteredTasks.filter((task) => task.status === "failed").length;

    return (
        <Base defaultClose withBlur={false}>
            <div className="modal--file-converter-container shadow backdrop-color">
                <Base.Header>{t("file_converter.title")}</Base.Header>
                
                <Condition condition={ffmpegAvailable === false}>
                    <div className="ffmpeg-warning">
                        <SvgAsset iconName="exclamation-circle" />
                        <span>{t("file_converter.ffmpeg_not_found")}</span>
                        <span className="error-detail">{ffmpegError}</span>
                    </div>
                </Condition>

                <div className="modal--body-container">
                    <div className="options-row">
                        <div className="option-group">
                            <label>{t("file_converter.filter_by_format")}</label>
                            <select 
                                value={selectedInputFilter} 
                                onChange={(e) => setSelectedInputFilter(e.target.value)}
                                disabled={isConverting}
                            >
                                {inputFilterOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label} ({opt.count})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="option-group">
                            <label>{t("file_converter.output_format")}</label>
                            <select 
                                value={selectedFormat} 
                                onChange={(e) => setSelectedFormat(e.target.value)}
                                disabled={isConverting}
                            >
                                {formatOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="option-group">
                            <label>{t("file_converter.quality")}</label>
                            <select 
                                value={quality} 
                                onChange={(e) => setQuality(e.target.value)}
                                disabled={isConverting}
                            >
                                {qualityOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="output-dir-row">
                        <label>{t("file_converter.output_directory")}</label>
                        <div className="output-dir-input">
                            <input 
                                type="text" 
                                value={outputDir} 
                                readOnly 
                                placeholder={t("file_converter.select_output_directory")}
                            />
                            <button 
                                onClick={selectOutputDirectory}
                                disabled={isConverting}
                                data-type="normalButton"
                            >
                                {t("file_converter.browse")}
                            </button>
                        </div>
                    </div>

                    <div className="task-list-header">
                        <span>{t("file_converter.task_list")} ({filteredTasks.length})</span>
                        <Condition condition={successCount > 0 || failedCount > 0}>
                            <span className="task-summary">
                                {t("file_converter.task_summary", { 
                                    success: successCount, 
                                    failed: failedCount, 
                                })}
                            </span>
                        </Condition>
                    </div>

                    <div className="task-list">
                        {filteredTasks.map((task) => (
                            <div 
                                key={task.inputPath} 
                                className={`task-item ${task.status}`}
                            >
                                <div className="task-info">
                                    <span className="task-name">
                                        {window.path.basename(task.inputPath)}
                                    </span>
                                    <span className="task-status">
                                        <Condition condition={task.status === "pending"}>
                                            {t("file_converter.status_pending")}
                                        </Condition>
                                        <Condition condition={task.status === "converting"}>
                                            {t("file_converter.status_converting")}...
                                        </Condition>
                                        <Condition condition={task.status === "success"}>
                                            <SvgAsset iconName="check" />
                                            {t("file_converter.status_success")}
                                        </Condition>
                                        <Condition condition={task.status === "failed"}>
                                            <SvgAsset iconName="x-mark" />
                                            {t("file_converter.status_failed")}
                                        </Condition>
                                    </span>
                                </div>
                                <Condition condition={task.status === "failed" && task.error}>
                                    <div className="task-error">{task.error}</div>
                                </Condition>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="footer-options">
                    <div
                        role="button"
                        data-type="normalButton"
                        onClick={() => {
                            hideModal();
                        }}
                    >
                        {t("common.cancel")}
                    </div>
                    <div
                        role="button"
                        data-type="primaryButton"
                        data-disabled={isConverting || !outputDir || !ffmpegAvailable || filteredTasks.length === 0}
                        onClick={startConversion}
                    >
                        {isConverting 
                            ? t("file_converter.converting") 
                            : t("file_converter.start_convert")}
                    </div>
                </div>
            </div>
        </Base>
    );
}
