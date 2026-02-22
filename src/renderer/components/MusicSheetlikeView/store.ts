import { rem } from "@/common/constant";
import Store from "@/common/store";

export const initValue = 184 + 4 * rem;
export const offsetHeightStore = new Store(initValue);

export interface ILocateMusicInfo {
    musicId: string;
    musicPlatform: string;
}

export const locateMusicStore = new Store<ILocateMusicInfo | null>(null);