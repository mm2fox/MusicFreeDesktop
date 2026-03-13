import Base from "../Base";
import "./index.scss";
import { useTranslation } from "react-i18next";
import SvgAsset from "@/renderer/components/SvgAsset";
import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import fileOperationLogger from "@/renderer/core/file-operation-log";
import { shellUtil } from "@shared/utils/renderer";

type FilterType = "all" | IFileOperationLog.OperationType;

export default function FileOperationLogModal() {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<IFileOperationLog.IFileOperationLogItem[]>([]);
    const [stats, setStats] = useState<IFileOperationLog.ILogStats | null>(null);
    const [filter, setFilter] = useState<FilterType>("all");
    const [isLoading, setIsLoading] = useState(true);

    const loadLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const options: IFileOperationLog.ILogQueryOptions = {
                limit: 100,
            };
            if (filter !== "all") {
                options.type = filter;
            }
            const [logData, statsData] = await Promise.all([
                fileOperationLogger.getLogs(options),
                fileOperationLogger.getLogStats(),
            ]);
            setLogs(logData);
            setStats(statsData);
        } catch (e) {
            console.error("[FileOperationLog] Load error:", e);
        } finally {
            setIsLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const handleClearLogs = async () => {
        try {
            await fileOperationLogger.clearLogs();
            toast.success(t("file_operation_log.clear_success"));
            loadLogs();
        } catch (e) {
            console.error("[FileOperationLog] Clear error:", e);
            toast.error(t("file_operation_log.clear_failed"));
        }
    };

    const handleDeleteLog = async (id: number) => {
        try {
            await fileOperationLogger.deleteLog(id);
            loadLogs();
        } catch (e) {
            console.error("[FileOperationLog] Delete error:", e);
        }
    };

    const handleOpenFolder = async (path: string) => {
        try {
            const dirPath = window.path.dirname(path);
            await shellUtil.openPath(dirPath);
        } catch (e) {
            console.error("[FileOperationLog] Open folder error:", e);
        }
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const getOperationIcon = (type: IFileOperationLog.OperationType) => {
        switch (type) {
            case "rename":
                return "pencil-square";
            case "delete":
                return "trash";
            case "move":
                return "folder-open";
            case "batch_delete":
                return "trash";
            case "batch_rename":
                return "pencil-square";
            case "batch_move":
                return "folder-open";
            case "organize_duplicate":
                return "playlist";
            default:
                return "list-bullet";
        }
    };

    const getStatusClass = (status: IFileOperationLog.OperationStatus) => {
        switch (status) {
            case "success":
                return "status-success";
            case "failed":
                return "status-failed";
            case "partial":
                return "status-partial";
            default:
                return "";
        }
    };

    const getTypeLabel = (type: IFileOperationLog.OperationType) => {
        return t(`file_operation_log.type_${type}`);
    };

    const getStatusLabel = (status: IFileOperationLog.OperationStatus) => {
        return t(`file_operation_log.status_${status}`);
    };

    return (
        <Base>
            <div className="modal--file-operation-log-container shadow backdrop-color">
                <Base.Header>
                    <span className="header-title">{t("file_operation_log.title")}</span>
                </Base.Header>

                <div className="log-content">
                    <div className="log-toolbar">
                        <div className="filter-section">
                            <span className="filter-label">{t("file_operation_log.filter_type")}:</span>
                            <select 
                                value={filter} 
                                onChange={(e) => setFilter(e.target.value as FilterType)}
                                className="filter-select"
                            >
                                <option value="all">{t("file_operation_log.filter_all")}</option>
                                <option value="rename">{t("file_operation_log.type_rename")}</option>
                                <option value="delete">{t("file_operation_log.type_delete")}</option>
                                <option value="move">{t("file_operation_log.type_move")}</option>
                                <option value="batch_delete">{t("file_operation_log.type_batch_delete")}</option>
                                <option value="batch_rename">{t("file_operation_log.type_batch_rename")}</option>
                                <option value="batch_move">{t("file_operation_log.type_batch_move")}</option>
                                <option value="organize_duplicate">{t("file_operation_log.type_organize_duplicate")}</option>
                            </select>
                        </div>

                        {stats && (
                            <div className="stats-section">
                                <span className="stats-item">
                                    {t("file_operation_log.total_operations")}: {stats.total}
                                </span>
                            </div>
                        )}

                        <button 
                            className="btn-clear"
                            onClick={handleClearLogs}
                            disabled={logs.length === 0}
                        >
                            <SvgAsset iconName="trash" size={14} />
                            <span>{t("file_operation_log.clear_all")}</span>
                        </button>
                    </div>

                    <div className="log-list">
                        {isLoading ? (
                            <div className="loading-state">
                                <SvgAsset iconName="rolling-1s" size={24} />
                                <span>{t("file_operation_log.loading")}</span>
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="empty-state">
                                <SvgAsset iconName="list-bullet" size={48} />
                                <span>{t("file_operation_log.no_logs")}</span>
                            </div>
                        ) : (
                            logs.map((log) => (
                                <div key={log.id} className={`log-item ${getStatusClass(log.status)}`}>
                                    <div className="log-header">
                                        <div className="log-type">
                                            <SvgAsset iconName={getOperationIcon(log.type)} size={16} />
                                            <span className="type-label">{getTypeLabel(log.type)}</span>
                                            <span className={`status-badge ${getStatusClass(log.status)}`}>
                                                {getStatusLabel(log.status)}
                                            </span>
                                        </div>
                                        <div className="log-time">{formatTimestamp(log.timestamp)}</div>
                                    </div>
                                    
                                    <div className="log-summary">{log.summary}</div>
                                    
                                    {log.details.musicItem && (
                                        <div className="log-music-info">
                                            <span className="music-title">{log.details.musicItem.title}</span>
                                            <span className="music-artist">- {log.details.musicItem.artist}</span>
                                        </div>
                                    )}

                                    <div className="log-details">
                                        {log.details.sourcePath && (
                                            <div className="detail-row">
                                                <span className="detail-label">{t("file_operation_log.source_path")}:</span>
                                                <span 
                                                    className="detail-value path-value"
                                                    onClick={() => handleOpenFolder(log.details.sourcePath!)}
                                                    title={log.details.sourcePath}
                                                >
                                                    {log.details.sourcePath}
                                                </span>
                                            </div>
                                        )}
                                        {log.details.targetPath && (
                                            <div className="detail-row">
                                                <span className="detail-label">{t("file_operation_log.target_path")}:</span>
                                                <span 
                                                    className="detail-value path-value"
                                                    onClick={() => handleOpenFolder(log.details.targetPath!)}
                                                    title={log.details.targetPath}
                                                >
                                                    {log.details.targetPath}
                                                </span>
                                            </div>
                                        )}
                                        {log.details.error && (
                                            <div className="detail-row error-row">
                                                <span className="detail-label">{t("file_operation_log.error")}:</span>
                                                <span className="detail-value error-value">{log.details.error}</span>
                                            </div>
                                        )}
                                        {log.details.batchItems && log.details.batchItems.length > 0 && (
                                            <div className="batch-items">
                                                <div className="batch-header">
                                                    {t("file_operation_log.batch_items")} ({log.details.successCount} / {log.details.batchItems.length})
                                                </div>
                                                <div className="batch-list">
                                                    {log.details.batchItems.slice(0, 5).map((item, idx) => (
                                                        <div key={idx} className={`batch-item ${item.status === "success" ? "success" : "failed"}`}>
                                                            <SvgAsset 
                                                                iconName={item.status === "success" ? "check-circle" : "x-mark"} 
                                                                size={12} 
                                                            />
                                                            <span className="batch-item-title">{item.musicItem.title}</span>
                                                            {item.error && (
                                                                <span className="batch-item-error">{item.error}</span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {log.details.batchItems.length > 5 && (
                                                        <div className="batch-more">
                                                            {t("file_operation_log.more_items", { count: log.details.batchItems.length - 5 })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <button 
                                        className="btn-delete-log"
                                        onClick={() => handleDeleteLog(log.id!)}
                                        title={t("file_operation_log.delete_log")}
                                    >
                                        <SvgAsset iconName="x-mark" size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Base>
    );
}
