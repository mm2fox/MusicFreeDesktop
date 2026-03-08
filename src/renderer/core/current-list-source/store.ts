import Store from "@/common/store";
import { getUserPreferenceIDB, setUserPreferenceIDB } from "@/renderer/utils/user-perference";

export interface ICurrentListSource {
    type: "search" | "local-music" | "music-sheet" | "download" | "recently-play" | "invalid-downloads";
    path: string;
    title?: string;
}

const currentListSourceStore = new Store<ICurrentListSource | null>(null);

currentListSourceStore.onValueChange((newValue) => {
    if (newValue) {
        setUserPreferenceIDB("currentListSource", newValue);
    }
});

export async function initCurrentListSource() {
    const savedSource = await getUserPreferenceIDB("currentListSource");
    if (savedSource) {
        currentListSourceStore.setValue(savedSource);
    }
    return savedSource;
}

export default currentListSourceStore;
