import localMusicListStore from "@/renderer/core/local-music/store";
import { allCustomTagsStore } from "@/renderer/core/local-music/custom-tags";
import "./index.scss";
import { useMemo, useState } from "react";
import groupBy from "@/renderer/utils/groupBy";
import MusicList from "@/renderer/components/MusicList";
import { Trans } from "react-i18next";

interface IProps {
    localMusicList: IMusic.IMusicItem[];
}

export default function TagView(props: IProps) {
    const { localMusicList } = props;
    const allTags = allCustomTagsStore.useValue();

    const [keys, allMusic] = useMemo(() => {
        const grouped: Record<string, IMusic.IMusicItem[]> = {};
        
        localMusicList?.forEach(item => {
            const tags = (item as any).$$customTags || [];
            tags.forEach((tag: string) => {
                if (!grouped[tag]) {
                    grouped[tag] = [];
                }
                grouped[tag].push(item);
            });
        });
        
        const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        return [sortedKeys, grouped];
    }, [localMusicList]);

    const [selectedKey, setSelectedKey] = useState<string>();

    const actualSelectedKey = selectedKey ?? keys?.[0];

    return (
        <div className="local-music--tag-view-container">
            <div className="left-part">
                {keys.length === 0 ? (
                    <div className="no-tags-hint">
                        <Trans i18nKey="custom_tags.no_tags_hint" />
                    </div>
                ) : (
                    keys.map((it) => (
                        <div
                            className="tag-item list-behavior"
                            key={it}
                            data-selected={actualSelectedKey === it}
                            onClick={() => {
                                setSelectedKey(it);
                            }}
                        >
                            <span className="tag-name">{it}</span>
                            <span className="tag-count">
                                <Trans
                                    i18nKey={"local_music_page.total_music_num"}
                                    values={{
                                        number: allMusic?.[it]?.length ?? 0,
                                    }}
                                ></Trans>
                            </span>
                        </div>
                    ))
                )}
            </div>
            <div className="right-part">
                {actualSelectedKey && allMusic[actualSelectedKey] ? (
                    <MusicList
                        musicList={allMusic[actualSelectedKey] ?? []}
                        virtualProps={{
                            fallbackRenderCount: -1,
                        }}
                    ></MusicList>
                ) : (
                    <div className="empty-hint">
                        {keys.length === 0 ? (
                            <Trans i18nKey="custom_tags.no_tags_hint" />
                        ) : (
                            <Trans i18nKey="custom_tags.select_tag_hint" />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
