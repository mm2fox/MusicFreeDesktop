import React, { memo, useEffect } from "react";
import MusicList from "@/renderer/components/MusicList";
import { RequestStateCode } from "@/common/constant";
import useSearch from "../../../hooks/useSearch";
import currentListSourceStore from "@/renderer/core/current-list-source/store";
import { useMatch } from "react-router-dom";

interface IMediaResultProps {
    data: IMusic.IMusicItem[];
    state: RequestStateCode;
    pluginHash: string;
}

function MusicResult(props: IMediaResultProps) {
    const { data, state, pluginHash } = props;
    const search = useSearch();
    const match = useMatch("/main/search/:query");
    const query = decodeURIComponent(match?.params?.query ?? "");

    useEffect(() => {
        currentListSourceStore.setValue({
            type: "search",
            path: `/main/search/${encodeURIComponent(query)}`,
            title: query,
        });
    }, [query]);

    return (
        <MusicList
            doubleClickBehavior="normal"
            musicList={data}
            state={state}
            onPageChange={() => {
                search(undefined, undefined, "music", pluginHash);
            }}
            virtualProps={{
                fallbackRenderCount: -1,
            }}
        ></MusicList>
    );
}

export default memo(
    MusicResult,
    (prev, curr) =>
        prev.data === curr.data &&
    prev.state === curr.state &&
    prev.pluginHash === curr.pluginHash,
);
