declare namespace IFileOperationLog {
    export type OperationType = 
        | 'rename' 
        | 'delete' 
        | 'move'
        | 'batch_delete' 
        | 'batch_rename'
        | 'batch_move'
        | 'organize_duplicate';

    export type OperationStatus = 'success' | 'failed' | 'partial';

    interface IFileOperationLogItem {
        id?: number;
        type: OperationType;
        status: OperationStatus;
        timestamp: number;
        details: IOperationDetails;
        summary: string;
    }

    interface IOperationDetails {
        sourcePath?: string;
        targetPath?: string;
        musicItem?: {
            id: string;
            platform: string;
            title: string;
            artist: string;
        };
        batchItems?: IBatchItem[];
        error?: string;
        successCount?: number;
        failCount?: number;
    }

    interface IBatchItem {
        sourcePath: string;
        targetPath?: string;
        musicItem: {
            id: string;
            platform: string;
            title: string;
            artist: string;
        };
        status: 'success' | 'failed';
        error?: string;
    }

    interface ILogQueryOptions {
        type?: OperationType;
        status?: OperationStatus;
        startDate?: number;
        endDate?: number;
        limit?: number;
        offset?: number;
    }

    interface ILogStats {
        total: number;
        byType: Record<OperationType, number>;
        byStatus: Record<OperationStatus, number>;
    }
}
