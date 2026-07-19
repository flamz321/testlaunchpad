import { profilePath as sharedProfilePath } from "@shared/profileUsername";

export { profilePath } from "@shared/profileUsername";

/** Build /u/... from loose fields (feed items, notifications, etc.). */
export function profilePathFrom(
  username?: string | null,
  walletAddress?: string | null
): string {
  return sharedProfilePath({ username, walletAddress });
}
