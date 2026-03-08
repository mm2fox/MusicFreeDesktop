import Store from "@/common/store";
import { getUserPreferenceIDB, setUserPreferenceIDB } from "@/renderer/utils/user-perference";

export interface IRemoteSheetInfo {
    platform: string;
    id: string;
    sheetItem?: IMusic.IMusicSheetItem;
}

const remoteSheetInfoStore = new Store<IRemoteSheetInfo | null>(null);

remoteSheetInfoStore.onValueChange((newValue) => {
    if (newValue) {
        setUserPreferenceIDB("remoteSheetInfo", newValue);
    }
});

export async function initRemoteSheetInfo() {
    const savedInfo = await getUserPreferenceIDB("remoteSheetInfo");
    if (savedInfo) {
        remoteSheetInfoStore.setValue(savedInfo);
    }
    return savedInfo;
}

export default remoteSheetInfoStore;
