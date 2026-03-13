import Dexie, { Table } from "dexie";

class FileOperationLogDB extends Dexie {
    logs: Table<IFileOperationLog.IFileOperationLogItem, number>;

    constructor() {
        super("fileOperationLogDB");
        this.version(1).stores({
            logs: "++id, type, status, timestamp, summary",
        });
    }
}

const fileOperationLogDB = new FileOperationLogDB();
export default fileOperationLogDB;
