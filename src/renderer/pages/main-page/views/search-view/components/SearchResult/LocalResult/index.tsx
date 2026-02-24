import { memo, useEffect, useState, useTransition } from "react";
import MusicList from "@/renderer/components/MusicList";
import { RequestStateCode } from "@/common/constant";
import localMusicListStore from "@/renderer/core/local-music/store";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import Empty from "@/renderer/components/Empty";

interface ILocalResultProps {
    query: string;
}

function LocalResult(props: ILocalResultProps) {
    const { query } = props;
    const localMusicList = localMusicListStore.useValue();
    const [filterMusicList, setFilterMusicList] = useState<
        (IMusic.IMusicItem & { $$localPath: string })[]
    >([]);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "search",
            path: `/main/search/${encodeURIComponent(query)}`,
            title: query,
        });
    }, [query]);

    useEffect(() => {
        if (!query || query.trim() === "") {
            setFilterMusicList([]);
            return;
        }

        startTransition(() => {
            const searchText = query.toLocaleLowerCase();
            const filtered = localMusicList.filter(
                (item) =>
                    item.title?.toLocaleLowerCase()?.includes(searchText) ||
                    item.artist?.toLocaleLowerCase()?.includes(searchText) ||
                    item.album?.toLocaleLowerCase()?.includes(searchText),
            );
            setFilterMusicList(filtered);
        });
    }, [query, localMusicList]);

    if (!query || query.trim() === "") {
        return <Empty></Empty>;
    }

    return (
        <MusicList
            doubleClickBehavior="normal"
            musicList={filterMusicList}
            state={isPending ? RequestStateCode.PENDING_FIRST_PAGE : RequestStateCode.FINISHED}
            virtualProps={{
                fallbackRenderCount: -1,
            }}
        ></MusicList>
    );
}

export default memo(LocalResult, (prev, curr) => prev.query === curr.query);
