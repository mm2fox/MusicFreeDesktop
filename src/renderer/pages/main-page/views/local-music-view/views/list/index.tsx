import LocalMusicList from "./LocalMusicList";
import { useEffect } from "react";
import currentListSourceStore from "@/renderer/core/current-list-source/store";

interface IProps {
    localMusicList: IMusic.IMusicItem[];
}

export default function ListView(props: IProps) {
    const { localMusicList } = props;

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "local-music",
            path: "/main/local-music",
        });
    }, []);

    return (
        <LocalMusicList
            localMusicList={localMusicList}
        />
    );
}
