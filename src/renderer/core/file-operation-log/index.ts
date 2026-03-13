import fileOperationLogDB from "./db";

class FileOperationLogger {
    async log(
        type: IFileOperationLog.OperationType,
        status: IFileOperationLog.OperationStatus,
        details: IFileOperationLog.IOperationDetails,
        summary: string,
    ): Promise<number> {
        const logItem: IFileOperationLog.IFileOperationLogItem = {
            type,
            status,
            timestamp: Date.now(),
            details,
            summary,
        };
        const id = await fileOperationLogDB.logs.add(logItem);
        return id as number;
    }

    async logRename(
        musicItem: IMusic.IMusicItem,
        sourcePath: string,
        targetPath: string,
        success: boolean,
        error?: string,
    ): Promise<number> {
        return this.log(
            "rename",
            success ? "success" : "failed",
            {
                sourcePath,
                targetPath,
                musicItem: {
                    id: musicItem.id,
                    platform: musicItem.platform,
                    title: musicItem.title || "未知标题",
                    artist: musicItem.artist || "未知艺术家",
                },
                error: error,
            },
            success 
                ? `重命名: "${musicItem.title}"` 
                : `重命名失败: "${musicItem.title}" - ${error || "未知错误"}`,
        );
    }

    async logDelete(
        musicItem: IMusic.IMusicItem,
        sourcePath: string,
        success: boolean,
        error?: string,
    ): Promise<number> {
        return this.log(
            "delete",
            success ? "success" : "failed",
            {
                sourcePath,
                musicItem: {
                    id: musicItem.id,
                    platform: musicItem.platform,
                    title: musicItem.title || "未知标题",
                    artist: musicItem.artist || "未知艺术家",
                },
                error: error,
            },
            success 
                ? `删除文件: "${musicItem.title}"` 
                : `删除失败: "${musicItem.title}" - ${error || "未知错误"}`,
        );
    }

    async logMove(
        musicItem: IMusic.IMusicItem,
        sourcePath: string,
        targetPath: string,
        success: boolean,
        error?: string,
    ): Promise<number> {
        return this.log(
            "move",
            success ? "success" : "failed",
            {
                sourcePath,
                targetPath,
                musicItem: {
                    id: musicItem.id,
                    platform: musicItem.platform,
                    title: musicItem.title || "未知标题",
                    artist: musicItem.artist || "未知艺术家",
                },
                error: error,
            },
            success 
                ? `移动文件: "${musicItem.title}"` 
                : `移动失败: "${musicItem.title}" - ${error || "未知错误"}`,
        );
    }

    async logBatchDelete(
        items: Array<{
            musicItem: IMusic.IMusicItem;
            sourcePath: string;
            success: boolean;
            error?: string;
        }>,
    ): Promise<number> {
        const successCount = items.filter(i => i.success).length;
        const failCount = items.length - successCount;
        const status: IFileOperationLog.OperationStatus = 
            failCount === 0 ? "success" : 
                successCount === 0 ? "failed" : "partial";

        const batchItems: IFileOperationLog.IBatchItem[] = items.map(item => ({
            sourcePath: item.sourcePath,
            musicItem: {
                id: item.musicItem.id,
                platform: item.musicItem.platform,
                title: item.musicItem.title || "未知标题",
                artist: item.musicItem.artist || "未知艺术家",
            },
            status: item.success ? "success" : "failed",
            error: item.error,
        }));

        return this.log(
            "batch_delete",
            status,
            {
                batchItems,
                successCount,
                failCount,
            },
            `批量删除: 成功 ${successCount} 个, 失败 ${failCount} 个`,
        );
    }

    async logBatchMove(
        items: Array<{
            musicItem: IMusic.IMusicItem;
            sourcePath: string;
            targetPath: string;
            success: boolean;
            error?: string;
        }>,
        targetFolder: string,
    ): Promise<number> {
        const successCount = items.filter(i => i.success).length;
        const failCount = items.length - successCount;
        const status: IFileOperationLog.OperationStatus = 
            failCount === 0 ? "success" : 
                successCount === 0 ? "failed" : "partial";

        const batchItems: IFileOperationLog.IBatchItem[] = items.map(item => ({
            sourcePath: item.sourcePath,
            targetPath: item.targetPath,
            musicItem: {
                id: item.musicItem.id,
                platform: item.musicItem.platform,
                title: item.musicItem.title || "未知标题",
                artist: item.musicItem.artist || "未知艺术家",
            },
            status: item.success ? "success" : "failed",
            error: item.error,
        }));

        return this.log(
            "batch_move",
            status,
            {
                batchItems,
                successCount,
                failCount,
            },
            `批量移动到 "${targetFolder}": 成功 ${successCount} 个, 失败 ${failCount} 个`,
        );
    }

    async logBatchRename(
        items: Array<{
            musicItem: IMusic.IMusicItem;
            sourcePath: string;
            targetPath: string;
            success: boolean;
            error?: string;
        }>,
    ): Promise<number> {
        const successCount = items.filter(i => i.success).length;
        const failCount = items.length - successCount;
        const status: IFileOperationLog.OperationStatus = 
            failCount === 0 ? "success" : 
                successCount === 0 ? "failed" : "partial";

        const batchItems: IFileOperationLog.IBatchItem[] = items.map(item => ({
            sourcePath: item.sourcePath,
            targetPath: item.targetPath,
            musicItem: {
                id: item.musicItem.id,
                platform: item.musicItem.platform,
                title: item.musicItem.title || "未知标题",
                artist: item.musicItem.artist || "未知艺术家",
            },
            status: item.success ? "success" : "failed",
            error: item.error,
        }));

        return this.log(
            "batch_rename",
            status,
            {
                batchItems,
                successCount,
                failCount,
            },
            `批量重命名: 成功 ${successCount} 个, 失败 ${failCount} 个`,
        );
    }

    async logOrganizeDuplicate(
        items: Array<{
            musicItem: IMusic.IMusicItem;
            sourcePath: string;
            targetPath?: string;
            success: boolean;
            error?: string;
        }>,
        targetFolder?: string,
    ): Promise<number> {
        const successCount = items.filter(i => i.success).length;
        const failCount = items.length - successCount;
        const status: IFileOperationLog.OperationStatus = 
            failCount === 0 ? "success" : 
                successCount === 0 ? "failed" : "partial";

        const batchItems: IFileOperationLog.IBatchItem[] = items.map(item => ({
            sourcePath: item.sourcePath,
            targetPath: item.targetPath,
            musicItem: {
                id: item.musicItem.id,
                platform: item.musicItem.platform,
                title: item.musicItem.title || "未知标题",
                artist: item.musicItem.artist || "未知艺术家",
            },
            status: item.success ? "success" : "failed",
            error: item.error,
        }));

        const summary = targetFolder 
            ? `整理重复: 移动 ${successCount} 个文件到 "${targetFolder}", 失败 ${failCount} 个`
            : `整理重复: 删除 ${successCount} 个重复文件, 失败 ${failCount} 个`;

        return this.log(
            "organize_duplicate",
            status,
            {
                batchItems,
                successCount,
                failCount,
            },
            summary,
        );
    }

    async getLogs(options: IFileOperationLog.ILogQueryOptions = {}): Promise<IFileOperationLog.IFileOperationLogItem[]> {
        let collection = fileOperationLogDB.logs.orderBy("timestamp").reverse();

        if (options.type) {
            collection = collection.and(log => log.type === options.type);
        }
        if (options.status) {
            collection = collection.and(log => log.status === options.status);
        }
        if (options.startDate) {
            collection = collection.and(log => log.timestamp >= options.startDate!);
        }
        if (options.endDate) {
            collection = collection.and(log => log.timestamp <= options.endDate!);
        }

        let results = await collection.toArray();

        if (options.offset) {
            results = results.slice(options.offset);
        }
        if (options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    async getLogStats(): Promise<IFileOperationLog.ILogStats> {
        const allLogs = await fileOperationLogDB.logs.toArray();
        
        const stats: IFileOperationLog.ILogStats = {
            total: allLogs.length,
            byType: {
                rename: 0,
                delete: 0,
                move: 0,
                batch_delete: 0,
                batch_rename: 0,
                batch_move: 0,
                organize_duplicate: 0,
            },
            byStatus: {
                success: 0,
                failed: 0,
                partial: 0,
            },
        };

        allLogs.forEach(log => {
            stats.byType[log.type]++;
            stats.byStatus[log.status]++;
        });

        return stats;
    }

    async clearLogs(): Promise<void> {
        await fileOperationLogDB.logs.clear();
    }

    async deleteLog(id: number): Promise<void> {
        await fileOperationLogDB.logs.delete(id);
    }

    async getLogCount(): Promise<number> {
        return fileOperationLogDB.logs.count();
    }
}

const fileOperationLogger = new FileOperationLogger();
export default fileOperationLogger;
