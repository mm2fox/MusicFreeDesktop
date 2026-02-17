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
    /** 小米登录模式 */
    xiaoaiLoginMode: "direct" | "server";
    /** xiaomusic 服务器地址 */
    xiaoaiServerUrl: string;
    /** 小米设备ID */
    xiaoaiDeviceId: string;
    /** 小米设备局域网IP映射 */
    xiaoaiDeviceLanIps: Record<string, string>;
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
  }
}
