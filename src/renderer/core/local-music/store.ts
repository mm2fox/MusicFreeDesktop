import Store from "@/common/store";

const localMusicListStore = new Store<Array<IMusic.IMusicItem & {
    $$localPath: string;
    $$customTags?: string[];
}>>([]);
export default localMusicListStore;