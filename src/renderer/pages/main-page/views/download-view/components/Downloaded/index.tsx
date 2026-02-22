import MusicList from "@/renderer/components/MusicList";
import Downloader from "@/renderer/core/downloader";
import { useEffect, useRef } from "react";
import currentListSourceStore from "@/renderer/core/current-list-source/store";

export default function Downloaded() {
    const downloadedList = Downloader.useDownloadedMusicList();
    const musicListContainerRef = useRef<HTMLDivElement>();

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "download",
            path: "/main/download",
        });
    }, []);

    return (
        <div ref={musicListContainerRef}>
            <MusicList
                musicList={downloadedList}
                virtualProps={{
                    getScrollElement() {
                        return document.querySelector("#page-container");
                    },
                    offsetHeight: () => musicListContainerRef.current.offsetTop,
                }}
            ></MusicList>
        </div>
    );
}
