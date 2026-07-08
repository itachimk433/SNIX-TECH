export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: number;
  followerCount: number;
  followingCount: number;
}

export interface VPNPost {
  id: string;
  uid: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  description: string;
  vpnApp: string;
  customVpnName?: string;
  sharingMode?: 'downloadable' | 'cloud_only' | 'cloud_link';
  configFileName?: string;
  configContent: string;
  isBinary?: boolean;
  countries?: string[];
  heartCount: number;
  okCount: number;
  downCount: number;
  upvotes?: number;
  downvotes?: number;
  downloadCount?: number;
  commentCount?: number;
  createdAt: number;
  expiresAt?: number | null;
  expiryLabel?: string;
  expiredManually?: boolean;
  authorIsPro?: boolean;
}

export interface UserFollow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: number;
}

export interface PostReaction {
  id: string;
  userId: string;
  postId: string;
  type: 'heart' | 'ok' | 'down';
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  createdAt: number;
  likeCount?: number;
  likedBy?: string[];
  replyToId?: string;
  replyToName?: string;
}

export interface CommentLike {
  commentId: string;
  postId: string;
  userId: string;
  createdAt: number;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'like' | 'reply' | 'comment' | 'follow';
  fromName: string;
  fromAvatar?: string;
  postId?: string;
  commentId?: string;
  commentPreview?: string;
  read: boolean;
  createdAt: number;
}

// VPN app → allowed file extensions
export const VPN_EXT_MAP: Record<string, string[]> = {
  "OpenVPN":      [".ovpn"],
  "WireGuard":    [".conf"],
  "ShadowSocks":  [".json", ".conf", ".txt", ".ss"],
  "v2ray / VMess":[".json", ".v2r", ".vmess"],
  "Trojan":       [".json", ".conf", ".trojan"],
  "HTTP Injector":[".ehi"],
  "Http Custom":  [".hc"],
  "TLS Tunnel":   [".tls"],
  "HA Tunnel Plus":[".hat"],
  "KPN Tunnel":   [".ktc"],
  "NapsternetV":  [".npv2"],
  "Stark VPN":    [".stark"],
  "Psiphon":      [".conf", ".txt", ".psiphon"],
  "Other":        [],
};

export const VPN_APPS_LIST = [
  "None",
  "OpenVPN",
  "WireGuard",
  "ShadowSocks",
  "v2ray / VMess",
  "Trojan",
  "HTTP Injector",
  "Http Custom",
  "TLS Tunnel",
  "HA Tunnel Plus",
  "KPN Tunnel",
  "NapsternetV",
  "Stark VPN",
  "Psiphon",
  "Other"
];

export const EXPIRY_OPTIONS = [
  { label: "1 Hour",   ms: 60 * 60 * 1000 },
  { label: "3 Hours",  ms: 3 * 60 * 60 * 1000 },
  { label: "6 Hours",  ms: 6 * 60 * 60 * 1000 },
  { label: "12 Hours", ms: 12 * 60 * 60 * 1000 },
  { label: "24 Hours", ms: 24 * 60 * 60 * 1000 },
  { label: "3 Days",   ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "7 Days",   ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 Days",  ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "Lifetime", ms: null },
];

export const CLOUD_EXPIRY_OPTIONS = [
  { label: "15 min",   ms: 15 * 60 * 1000 },
  { label: "30 min",   ms: 30 * 60 * 1000 },
  { label: "1 Hour",   ms: 60 * 60 * 1000 },
  { label: "3 Hours",  ms: 3 * 60 * 60 * 1000 },
  { label: "6 Hours",  ms: 6 * 60 * 60 * 1000 },
  { label: "12 Hours", ms: 12 * 60 * 60 * 1000 },
  { label: "24 Hours", ms: 24 * 60 * 60 * 1000 },
  { label: "No Expiry",ms: null },
];

export const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "ZA", name: "South Africa",   flag: "🇿🇦" },
  { code: "NG", name: "Nigeria",         flag: "🇳🇬" },
  { code: "KE", name: "Kenya",           flag: "🇰🇪" },
  { code: "GH", name: "Ghana",           flag: "🇬🇭" },
  { code: "EG", name: "Egypt",           flag: "🇪🇬" },
  { code: "ET", name: "Ethiopia",        flag: "🇪🇹" },
  { code: "TZ", name: "Tanzania",        flag: "🇹🇿" },
  { code: "UG", name: "Uganda",          flag: "🇺🇬" },
  { code: "ZW", name: "Zimbabwe",        flag: "🇿🇼" },
  { code: "ZM", name: "Zambia",          flag: "🇿🇲" },
  { code: "MW", name: "Malawi",          flag: "🇲🇼" },
  { code: "MZ", name: "Mozambique",      flag: "🇲🇿" },
  { code: "NA", name: "Namibia",         flag: "🇳🇦" },
  { code: "BW", name: "Botswana",        flag: "🇧🇼" },
  { code: "SN", name: "Senegal",         flag: "🇸🇳" },
  { code: "CI", name: "Côte d'Ivoire",   flag: "🇨🇮" },
  { code: "CM", name: "Cameroon",        flag: "🇨🇲" },
  { code: "CD", name: "DR Congo",        flag: "🇨🇩" },
  { code: "AO", name: "Angola",          flag: "🇦🇴" },
  { code: "MG", name: "Madagascar",      flag: "🇲🇬" },
  { code: "RW", name: "Rwanda",          flag: "🇷🇼" },
  { code: "TN", name: "Tunisia",         flag: "🇹🇳" },
  { code: "MA", name: "Morocco",         flag: "🇲🇦" },
  { code: "SD", name: "Sudan",           flag: "🇸🇩" },
  { code: "SO", name: "Somalia",         flag: "🇸🇴" },
  { code: "LS", name: "Lesotho",         flag: "🇱🇸" },
  { code: "SZ", name: "Eswatini",        flag: "🇸🇿" },
  { code: "US", name: "United States",   flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom",  flag: "🇬🇧" },
  { code: "DE", name: "Germany",         flag: "🇩🇪" },
  { code: "FR", name: "France",          flag: "🇫🇷" },
  { code: "NL", name: "Netherlands",     flag: "🇳🇱" },
  { code: "CA", name: "Canada",          flag: "🇨🇦" },
  { code: "AU", name: "Australia",       flag: "🇦🇺" },
  { code: "IN", name: "India",           flag: "🇮🇳" },
  { code: "SG", name: "Singapore",       flag: "🇸🇬" },
  { code: "JP", name: "Japan",           flag: "🇯🇵" },
  { code: "BR", name: "Brazil",          flag: "🇧🇷" },
  { code: "TR", name: "Turkey",          flag: "🇹🇷" },
  { code: "PK", name: "Pakistan",        flag: "🇵🇰" },
  { code: "ID", name: "Indonesia",       flag: "🇮🇩" },
  { code: "PH", name: "Philippines",     flag: "🇵🇭" },
];
