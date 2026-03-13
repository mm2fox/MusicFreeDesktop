# 本地音乐整理重复歌曲功能实现计划

## 功能概述
为本地音乐页面添加重复歌曲检测和整理功能，帮助用户识别和处理重复的本地音乐文件，同时检测文件名格式问题并支持自动整理。

## 功能设计

### 1. 重复检测规则
重复歌曲的判定基于以下条件：
- **标准匹配**：`title` 和 `artist` 都相同
- **智能匹配**：考虑标题和艺术家顺序互换的情况
  - 例如：歌曲A的 `title="告白气球", artist="周杰伦"` 与 歌曲B的 `title="周杰伦", artist="告白气球"` 可能是同一首
  - 通过比对 title-artist 和 artist-title 组合来识别

### 2. 文件名格式检测
检测文件名格式不完整的歌曲：
- **缺少艺术家**：文件名只有 `title`，没有 `artist` 信息（artist 为空或"未知作者"）
- 检测到格式不完整的歌曲时，提示用户修改文件名或手动编辑标签

### 3. 文件名格式整理
自动将文件名规范化为 `歌手-歌曲名.文件后缀` 格式：
- **标准格式**：`{artist}-{title}.{ext}`，例如 `周杰伦-告白气球.mp3`
- **检测不符合格式的文件**：
  - 文件名不包含 `-` 分隔符
  - 文件名格式为 `歌曲名-歌手`（顺序相反）
  - 文件名只有歌曲名，没有歌手
- **批量整理**：
  - 自动重命名为标准格式
  - 同步更新 `localMusicStore` 中的 `$$localPath`
  - 同步更新 `musicStore` 中的 `downloadData.path`（下载管理的链接）
  - 更新内存中的 `localMusicListStore`

### 4. 用户界面设计

#### 4.1 入口按钮
在本地音乐页面的操作区域添加"整理重复"按钮，与其他功能按钮风格一致。

#### 4.2 整理弹窗
创建一个新的模态框组件 `DuplicateMusicManager`，包含三个标签页：
- **重复歌曲**：检测和处理重复歌曲
- **格式问题**：检测文件名格式不完整的歌曲
- **文件名整理**：检测和批量整理文件名格式

#### 4.3 重复歌曲标签页
- **检测模式选择**：标准匹配 / 智能匹配
- **检测结果展示**：
  - 分组显示重复歌曲（每组显示重复数量）
  - 每组可展开查看具体歌曲详情
  - 显示每首歌的文件路径、时长等信息
- **操作选项**：
  - 全选/取消全选
  - 保留指定歌曲（保留第一个/保留最新/保留文件最大的）
  - 从列表移除选中的歌曲
  - 删除本地文件（同时删除文件）

#### 4.4 格式问题标签页
- 显示缺少艺术家信息的歌曲列表
- 提供快捷操作：编辑标签、重命名文件

#### 4.5 文件名整理标签页
- 显示不符合标准格式的文件列表
- 预览重命名效果（原文件名 → 新文件名）
- **批量整理按钮**：一键整理所有不符合格式的文件
- 整理时同步更新数据库

### 5. 技术实现

#### 5.1 新增文件
1. `src/renderer/core/local-music/duplicate-detector.ts` - 重复检测和文件名检测核心逻辑
2. `src/renderer/components/Modal/templates/DuplicateMusicManager/index.tsx` - 弹窗组件
3. `src/renderer/components/Modal/templates/DuplicateMusicManager/index.scss` - 样式文件

#### 5.2 修改文件
1. `src/renderer/pages/main-page/views/local-music-view/index.tsx` - 添加入口按钮
2. `src/renderer/components/Modal/index.ts` - 注册新弹窗组件
3. `res/lang/zh-CN.json` - 添加国际化文本

### 6. 实现步骤

#### 步骤 1：创建核心检测逻辑
- 实现标准匹配检测函数
- 实现智能匹配检测函数（识别标签错位）
- 实现格式问题检测函数
- 实现文件名格式检测函数

#### 步骤 2：创建弹窗组件
- 实现弹窗 UI 结构（三个标签页）
- 实现检测结果展示
- 实现歌曲选择和操作功能

#### 步骤 3：添加样式
- 设计清晰的分组展示样式
- 确保与现有 UI 风格一致

#### 步骤 4：集成到本地音乐页面
- 添加"整理重复"按钮
- 调用弹窗组件

#### 步骤 5：添加国际化支持
- 添加中文翻译文本

#### 步骤 6：实现删除和重命名功能
- 从列表移除
- 删除本地文件（可选）
- 批量重命名文件（同步更新数据库）

### 7. 详细实现

#### 7.1 核心检测逻辑 (`duplicate-detector.ts`)

```typescript
type DuplicateDetectMode = 'standard' | 'smart';

interface DuplicateGroup {
  key: string;           // 分组标识
  items: IMusic.IMusicItem[];  // 重复的歌曲列表
  count: number;         // 重复数量
}

interface FormatIssue {
  item: IMusic.IMusicItem;
  issue: 'missing-artist' | 'missing-title';
}

interface FileNameIssue {
  item: IMusic.IMusicItem;
  currentFileName: string;   // 当前文件名（不含路径）
  suggestedFileName: string; // 建议的新文件名
  issue: 'no-separator' | 'wrong-order' | 'missing-artist' | 'other';
}

function detectDuplicates(
  musicList: IMusic.IMusicItem[],
  mode: DuplicateDetectMode
): DuplicateGroup[]

function detectFormatIssues(
  musicList: IMusic.IMusicItem[]
): FormatIssue[]

function detectFileNameIssues(
  musicList: IMusic.IMusicItem[]
): FileNameIssue[]

function generateStandardFileName(item: IMusic.IMusicItem): string
```

#### 7.2 弹窗组件结构

```tsx
// 主要状态
const [activeTab, setActiveTab] = useState<'duplicates' | 'format' | 'filename'>('duplicates');
const [detectMode, setDetectMode] = useState<DuplicateDetectMode>('standard');
const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
const [formatIssues, setFormatIssues] = useState<FormatIssue[]>([]);
const [fileNameIssues, setFileNameIssues] = useState<FileNameIssue[]>([]);
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
const [isScanning, setIsScanning] = useState(false);

// 功能函数
const startDetection = () => { /* 开始检测 */ };
const toggleSelectItem = (id: string) => { /* 切换选中 */ };
const deleteSelected = (deleteFile: boolean) => { /* 删除选中 */ };
const batchRenameFiles = () => { /* 批量重命名 */ };
```

#### 7.3 重命名文件逻辑（复用现有代码）

重命名文件时需要同步更新以下数据：
1. **文件系统**：执行 `fs.renameFile(oldPath, newPath)`
2. **localMusicStore**：更新 `$$localPath`
3. **localMusicListStore**：更新内存中的列表
4. **musicStore**：更新 `downloadData.path`（下载管理的链接）

参考 `LocalMusicList.tsx` 中已有的实现：
```typescript
async function renameMusicFile(
  musicItem: IMusic.IMusicItem,
  oldPath: string,
  newPath: string
) {
  const fs = (window as any)["@shared/utils"].fs;
  
  // 1. 重命名文件
  await fs.renameFile(oldPath, newPath);

  // 2. 更新 localMusicStore
  await musicSheetDB.localMusicStore.update(
    [musicItem.platform, musicItem.id],
    { $$localPath: newPath }
  );

  // 3. 更新内存中的列表
  const currentList = localMusicListStore.getValue();
  const updatedList = currentList.map(item => {
    if (item.id === musicItem.id && item.platform === musicItem.platform) {
      return { ...item, $$localPath: newPath };
    }
    return item;
  });
  localMusicListStore.setValue(updatedList);

  // 4. 更新下载管理中的路径
  const allMusic = await musicSheetDB.musicStore.toArray();
  for (const item of allMusic) {
    const downloadData = getInternalData<IMusic.IMusicItemInternalData>(item, "downloadData");
    if (downloadData?.path === oldPath) {
      const updatedItem = setInternalData<IMusic.IMusicItemInternalData>(
        item,
        "downloadData",
        { ...downloadData, path: newPath },
        true,
      );
      await musicSheetDB.musicStore.update(
        [item.platform, item.id],
        { [internalDataKey]: updatedItem[internalDataKey] }
      );
      break;
    }
  }
}
```

#### 7.4 生成标准文件名

```typescript
function generateStandardFileName(item: IMusic.IMusicItem): string {
  const artist = item.artist || "未知艺术家";
  const title = item.title || "未知标题";
  const localPath = (item as any).$$localPath || (item as any).localPath;
  const ext = window.path.extname(localPath);
  
  // 清理文件名中的非法字符
  const cleanArtist = artist.replace(/[<>:"/\\|?*]/g, '_');
  const cleanTitle = title.replace(/[<>:"/\\|?*]/g, '_');
  
  return `${cleanArtist}-${cleanTitle}${ext}`;
}
```

### 8. 国际化文本

```json
{
  "local_music_page": {
    "manage_duplicates": "整理重复",
    "duplicate_scanning": "扫描中...",
    "duplicate_scan_complete": "扫描完成，发现 {{count}} 组重复歌曲",
    "no_duplicates_found": "未发现重复歌曲",
    "duplicate_detect_mode": "检测模式",
    "duplicate_mode_standard": "标准匹配",
    "duplicate_mode_smart": "智能匹配（识别标签错位）",
    "duplicate_group": "重复组 {{index}}",
    "duplicate_count": "{{count}} 首重复",
    "keep_first": "保留第一首",
    "keep_newest": "保留最新",
    "keep_largest": "保留文件最大",
    "remove_from_list": "从列表移除",
    "delete_files": "删除文件",
    "delete_confirm": "确定要删除选中的 {{count}} 首歌曲吗？",
    "delete_file_confirm": "确定要删除选中的 {{count}} 个文件吗？此操作不可恢复！",
    "tab_duplicates": "重复歌曲",
    "tab_format_issues": "格式问题",
    "tab_filename_organize": "文件名整理",
    "format_issue_missing_artist": "缺少艺术家信息",
    "format_issue_hint": "以下歌曲缺少艺术家信息，建议修改文件名或编辑标签",
    "no_format_issues": "未发现格式问题",
    "filename_issue_no_separator": "文件名缺少分隔符",
    "filename_issue_wrong_order": "文件名顺序错误",
    "filename_issue_missing_artist": "文件名缺少艺术家",
    "filename_organize_hint": "以下文件名不符合标准格式（歌手-歌曲名.后缀）",
    "filename_current": "当前文件名",
    "filename_suggested": "建议文件名",
    "batch_rename": "批量整理",
    "batch_renaming": "正在整理...",
    "batch_rename_complete": "整理完成，成功 {{success}} 个，失败 {{fail}} 个",
    "no_filename_issues": "所有文件名格式正确",
    "rename_preview": "预览重命名结果"
  }
}
```

### 9. 注意事项

1. **性能考虑**：
   - 大量歌曲时检测可能耗时，需要显示进度
   - 批量重命名时分批处理避免阻塞 UI

2. **安全性**：
   - 删除文件前需要二次确认
   - 重命名前检查目标文件是否已存在

3. **用户体验**：
   - 清晰展示每首歌的区分信息（路径、时长、大小）
   - 提供智能推荐保留哪一首的功能
   - 文件名整理提供预览功能

## 文件变更清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/renderer/core/local-music/duplicate-detector.ts` | 新建 | 重复检测和文件名检测核心逻辑 |
| `src/renderer/components/Modal/templates/DuplicateMusicManager/index.tsx` | 新建 | 弹窗组件 |
| `src/renderer/components/Modal/templates/DuplicateMusicManager/index.scss` | 新建 | 弹窗样式 |
| `src/renderer/components/Modal/index.ts` | 修改 | 注册弹窗组件 |
| `src/renderer/pages/main-page/views/local-music-view/index.tsx` | 修改 | 添加入口按钮 |
| `res/lang/zh-CN.json` | 修改 | 添加国际化文本 |
