import Store from "@/common/store";

export interface ICurrentListSource {
    type: "search" | "local-music" | "music-sheet" | "download" | "recently-play";
    path: string;
    title?: string;
}

const currentListSourceStore = new Store<ICurrentListSource | null>(null);

export default currentListSourceStore;
