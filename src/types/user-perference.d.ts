declare namespace IUserPreference {
  interface IType {
    /** 重复模式 */
    repeatMode: string;
    /** 当前进度 */
    currentMusic: IMusic.IMusicItem;
    currentProgress: number;
    currentQuality: IMusic.IQualityKey;
    /** 当前音量 */
    volume: number;
    /** 倍速 */
    speed: number;
    /** 订阅 */
    subscription: Array<{
      title?: string;
      srcUrl: string;
    }>;
    skipVersion: string;
    inlineLyricFontSize: string;
    /** 展示翻译 */
    showTranslation: boolean;
    /** 小米账号用户名 */
    xiaoaiUsername: string;
    /** 小米账号密码 */
    xiaoaiPassword: string;
    /** 小米设备ID */
    xiaoaiDeviceId: string;
    /** 是否使用小米音箱输出 */
    useXiaoaiOutput: boolean;
    /** 小米登录模式 */
    xiaoaiLoginMode: string;
  }

  interface IDBType {
    /** 当前播放队列 */
    playList: IMusic.IMusicItem[];
    /** 最近播放队列 */
    recentlyPlayList: IMusic.IMusicItem[];
    /** 已下载列表 */
    downloadedList: IMedia.IMediaBase[];
    /** 本地音乐监听列表 */
    localWatchDir: string[];
    /** 本地音乐勾选的监听列表 */
    localWatchDirChecked: string[];
    /** 收藏的歌单 */
    starredMusicSheets: IMedia.IMediaBase[];
    /** 搜索历史 */
    searchHistory: string[];
    /** 插件数据 */
    pluginMeta: Record<string, IPlugin.IPluginMeta>;
    /** 当前浏览的歌单来源 */
    currentListSource: {
      type: "search" | "local-music" | "music-sheet" | "download" | "recently-play" | "invalid-downloads";
      path: string;
      title?: string;
    };
    /** 远程歌单信息（用于恢复浏览的网络歌单） */
    remoteSheetInfo: {
      platform: string;
      id: string;
      sheetItem?: IMusic.IMusicSheetItem;
    };
  }
}
