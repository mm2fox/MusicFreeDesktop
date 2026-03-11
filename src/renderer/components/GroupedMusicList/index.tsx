import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MusicList from "../MusicList";
import SvgAsset from "../SvgAsset";
import "./index.scss";

interface IGroupedMusicListProps {
    musicList: Array<IMusic.IMusicItem & { $$playTime?: number }>;
    musicSheet?: IMusic.IMusicSheetItem;
    getPlayTime?: (item: IMusic.IMusicItem) => number | undefined;
}

function formatDate(date: Date, t: (key: string, options?: any) => string): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (targetDate.getTime() === today.getTime()) {
        return t("recently_play.today");
    } else if (targetDate.getTime() === yesterday.getTime()) {
        return t("recently_play.yesterday");
    } else {
        const thisWeekStart = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
        if (targetDate >= thisWeekStart) {
            const weekDays = [
                t("recently_play.weekday_0"),
                t("recently_play.weekday_1"),
                t("recently_play.weekday_2"),
                t("recently_play.weekday_3"),
                t("recently_play.weekday_4"),
                t("recently_play.weekday_5"),
                t("recently_play.weekday_6"),
            ];
            return weekDays[date.getDay()];
        } else {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        }
    }
}

function getDateKey(timestamp: number): number {
    const date = new Date(timestamp);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export default function GroupedMusicList(props: IGroupedMusicListProps) {
    const { musicList, musicSheet, getPlayTime } = props;
    const { t } = useTranslation();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

    const groupedMusicList = useMemo(() => {
        if (!musicList || musicList.length === 0) {
            return [];
        }

        const groups: Map<number, Array<IMusic.IMusicItem & { $$playTime?: number }>> = new Map();

        musicList.forEach((item) => {
            const playTime = getPlayTime ? getPlayTime(item) : (item as any).$$playTime;
            const timestamp = playTime || Date.now();
            const dateKey = getDateKey(timestamp);

            if (!groups.has(dateKey)) {
                groups.set(dateKey, []);
            }
            const groupItems = groups.get(dateKey);
            if (groupItems) {
                groupItems.push(item);
            }
        });

        const sortedGroups = Array.from(groups.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([timestamp, items]) => ({
                date: new Date(timestamp),
                label: formatDate(new Date(timestamp), t),
                items,
            }));

        return sortedGroups;
    }, [musicList, getPlayTime, t]);

    const toggleGroup = (dateKey: number) => {
        setCollapsedGroups((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(dateKey)) {
                newSet.delete(dateKey);
            } else {
                newSet.add(dateKey);
            }
            return newSet;
        });
    };

    if (!musicList || musicList.length === 0) {
        return (
            <MusicList
                musicList={[]}
                musicSheet={musicSheet}
            />
        );
    }

    return (
        <div className="grouped-music-list-container">
            {groupedMusicList.map((group) => {
                const isCollapsed = collapsedGroups.has(group.date.getTime());
                return (
                    <div key={group.date.getTime()} className="music-group">
                        <div
                            className="group-header"
                            onClick={() => toggleGroup(group.date.getTime())}
                        >
                            <div className="group-header-left">
                                <span
                                    className={`collapse-icon ${isCollapsed ? "collapsed" : ""}`}
                                >
                                    <SvgAsset iconName="chevron-right" size={14} />
                                </span>
                                <span className="group-date-label">{group.label}</span>
                            </div>
                            <span className="group-count">{group.items.length} {t("recently_play.songs")}</span>
                        </div>
                        {!isCollapsed && (
                            <MusicList
                                musicList={group.items}
                                musicSheet={musicSheet}
                                virtualProps={{
                                    getScrollElement() {
                                        return document.querySelector("#page-container");
                                    },
                                    offsetHeight: () => 0,
                                    fallbackRenderCount: 50,
                                }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
