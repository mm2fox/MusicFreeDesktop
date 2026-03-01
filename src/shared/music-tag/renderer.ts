interface IMusicTags {
    title?: string;
    artist?: string;
    album?: string;
    albumArtist?: string;
    year?: string;
    date?: string;
    genre?: string;
    comment?: string;
    lyrics?: string;
    artwork?: string;
}

interface IMusicTagsResult {
    success: boolean;
    tags?: IMusicTags;
    error?: string;
}

interface IMod {
    readTags: (filePath: string) => Promise<IMusicTagsResult>;
    readTagsWithoutArtwork: (filePath: string) => Promise<IMusicTagsResult>;
    writeTags: (filePath: string, tags: IMusicTags) => Promise<IMusicTagsResult>;
}

const mod = window["@shared/music-tag" as any] as unknown as IMod;

const MusicTag = {
    readTags: mod?.readTags ?? (async () => ({ success: false, error: "MusicTag not available" })),
    readTagsWithoutArtwork: mod?.readTagsWithoutArtwork ?? (async () => ({ success: false, error: "MusicTag not available" })),
    writeTags: mod?.writeTags ?? (async () => ({ success: false, error: "MusicTag not available" })),
};

export default MusicTag;

export type { IMusicTags, IMusicTagsResult };
