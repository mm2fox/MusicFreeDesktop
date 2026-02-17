import { NavigateFunction } from "react-router-dom";

let navigateRef: NavigateFunction | null = null;

export function setNavigateRef(navigate: NavigateFunction) {
    navigateRef = navigate;
}

export function getNavigateRef() {
    return navigateRef;
}

export function navigateTo(path: string) {
    if (navigateRef) {
        navigateRef(path);
    }
}
