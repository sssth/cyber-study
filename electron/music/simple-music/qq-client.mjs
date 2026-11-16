// From Simple Music v2.7.0. See NOTICE.md and LICENSE.
import { decryptQrc } from "qrc-decoder";
import { deviceDigits } from "./device-identity.mjs";
const rec = (v) => typeof v === "object" && v !== null ? v : {};
const str = (v) => v === null || v === void 0 ? "" : String(v);
const numOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const arr = (v) => Array.isArray(v) ? v : [];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const QQ_MUSICU_URL = "https://u.y.qq.com/cgi-bin/musicu.fcg";
const QQ_HEADERS = {
  Referer: "https://y.qq.com/",
  "User-Agent": UA
};
const QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: "RS01", ext: ".flac", level: "hires", label: "Hi-Res FLAC" },
  { prefix: "F000", ext: ".flac", level: "lossless", label: "\u65E0\u635F FLAC" },
  { prefix: "M800", ext: ".mp3", level: "exhigh", label: "320k MP3" },
  { prefix: "M500", ext: ".mp3", level: "standard", label: "128k MP3" },
  { prefix: "C400", ext: ".m4a", level: "aac", label: "AAC/M4A" }
];
async function requestText(targetUrl, opts = {}, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Request timeout")), 1e4);
  try {
    const response = await fetch(targetUrl, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      body,
      signal: controller.signal
    });
    const text = await response.text();
    if (response.status >= 400) {
      const err = new Error("HTTP " + response.status);
      err.statusCode = response.status;
      err.body = text;
      throw err;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
function parseJSONText(text) {
  const raw = String(text || "").trim();
  const json = raw.replace(/^callback\(([\s\S]*)\);?$/, "$1");
  return JSON.parse(json);
}
const COOKIE_ATTRIBUTE_NAMES = /* @__PURE__ */ new Set([
  "path",
  "domain",
  "expires",
  "max-age",
  "samesite",
  "secure",
  "httponly"
]);
function collectCookiePair(picked, key, value) {
  const k = String(key || "").trim();
  if (!k || COOKIE_ATTRIBUTE_NAMES.has(k.toLowerCase())) return;
  if (value === null || value === void 0) return;
  picked.set(k, String(value).trim());
}
function collectCookieInput(input, picked) {
  if (input === null || input === void 0) return;
  if (Array.isArray(input)) {
    input.forEach((item) => collectCookieInput(item, picked));
    return;
  }
  if (typeof input === "object") {
    const obj = input;
    if (obj.name && Object.prototype.hasOwnProperty.call(obj, "value")) {
      collectCookiePair(picked, obj.name, obj.value);
      return;
    }
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
        collectCookiePair(picked, key, value.value);
      } else if (typeof value !== "object") {
        collectCookiePair(picked, key, value);
      }
    });
    return;
  }
  String(input).split(/\r?\n/).forEach((line) => {
    line.split(";").forEach((part) => {
      const raw = String(part || "").trim();
      const idx = raw.indexOf("=");
      if (idx <= 0) return;
      collectCookiePair(picked, raw.slice(0, idx), raw.slice(idx + 1));
    });
  });
}
function normalizeCookieHeader(input) {
  const picked = /* @__PURE__ */ new Map();
  collectCookieInput(input, picked);
  return Array.from(picked.entries()).filter(([key, value]) => key && value != null && String(value) !== "").map(([key, value]) => `${key}=${value}`).join("; ");
}
function rawCookieFallback(input) {
  if (typeof input === "string") return input.trim();
  if (Array.isArray(input) && input.every((item) => typeof item === "string")) {
    return input.join("; ").trim();
  }
  return "";
}
function computeSavedQQCookie(input) {
  return normalizeCookieHeader(input) || rawCookieFallback(input);
}
function parseCookieString(cookieText) {
  const out = {};
  String(cookieText || "").split(";").forEach((part) => {
    const raw = String(part || "").trim();
    if (!raw) return;
    const idx = raw.indexOf("=");
    if (idx <= 0) return;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key) out[key] = value;
  });
  return out;
}
function serializeCookieObject(obj) {
  return Object.keys(obj || {}).filter((k) => obj[k] != null && String(obj[k]) !== "").map((k) => k + "=" + String(obj[k])).join("; ");
}
function normalizeQQUin(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || digits;
}
function qqCookieUin(obj) {
  const raw = Number(obj.login_type) === 2 ? obj.wxuin || obj.uin || obj.p_uin : obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin;
  return normalizeQQUin(raw);
}
function qqCookieMusicKey(obj) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey || obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || "";
}
function qqCookiePlaybackKey(obj) {
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || "";
}
function qqAuthComm(cookie) {
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const comm = {
    uin,
    format: "json",
    ct: musicKey ? 19 : 24,
    cv: 0
  };
  if (musicKey) comm.authst = musicKey;
  return comm;
}
function decodeQQCookieValue(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, "%20")).trim();
  } catch {
    return String(value || "").trim();
  }
}
function qqCookieNickname(obj, uinInput) {
  const uin = normalizeQQUin(uinInput || qqCookieUin(obj));
  const padded = uin ? "0" + uin : "";
  const keys = [
    uin && "ptnick_" + uin,
    padded && "ptnick_" + padded
  ].filter(Boolean);
  for (const key of keys) {
    if (obj[key]) {
      const nick = decodeQQCookieValue(obj[key]);
      if (nick) return nick;
    }
  }
  return "";
}
function qqCookieAvatar(obj, uinInput) {
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || "";
  if (direct) return decodeQQCookieValue(direct);
  const uin = normalizeQQUin(uinInput || qqCookieUin(obj));
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : "";
}
function normalizeQQCookieInput(cookieText) {
  const obj = parseCookieString(cookieText);
  if (Number(obj.login_type) === 2 && obj.wxuin && !obj.uin) obj.uin = obj.wxuin;
  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) obj.uin = obj.qqmusic_uin || obj.p_uin;
  if (obj.uin) obj.uin = normalizeQQUin(obj.uin);
  return serializeCookieObject(obj);
}
function playbackRestriction(provider, category, message, action, extra) {
  return {
    provider,
    category,
    action: action || "",
    message,
    ...extra || {}
  };
}
function classifyQQPlaybackRestriction(info, session, feeHint) {
  const sessionObj = typeof session === "object" ? session : { hasSession: !!session, hasPlaybackKey: !!session };
  const hasSession = !!sessionObj.hasSession;
  const hasPlaybackKey = typeof session === "object" ? !!sessionObj.hasPlaybackKey : hasSession;
  const infoRec = rec(info);
  const rawMsg = String(
    infoRec.msg || infoRec.tips || infoRec.errmsg || infoRec.message || ""
  ).trim();
  const code = Number(infoRec.result || infoRec.code || infoRec.errtype || 0);
  const lower = rawMsg.toLowerCase();
  if (!hasSession) {
    return playbackRestriction("qq", "login_required", "QQ \u97F3\u4E50\u9700\u8981\u767B\u5F55\u6216\u6388\u6743\u540E\u624D\u80FD\u83B7\u53D6\u64AD\u653E\u5730\u5740", "login", {
      code,
      rawMessage: rawMsg
    });
  }
  if (!hasPlaybackKey && code === 104003) {
    return playbackRestriction(
      "qq",
      "login_required",
      "QQ \u97F3\u4E50\u5F53\u524D\u53EA\u62FF\u5230\u4E86\u7F51\u9875\u767B\u5F55\u72B6\u6001\uFF0C\u8FD8\u7F3A\u5C11\u64AD\u653E\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5B98\u65B9 QQ \u97F3\u4E50\u767B\u5F55\u7A97\u53E3\u5B8C\u6210\u6388\u6743",
      "login",
      { code, rawMessage: rawMsg, missingPlaybackKey: true }
    );
  }
  if (code === 104003 && feeHint) {
    return playbackRestriction(
      "qq",
      "paid_required",
      "QQ \u97F3\u4E50\u663E\u793A\u8FD9\u9996\u6B4C\u662F\u4ED8\u8D39/\u4F1A\u5458\u66F2\u76EE\uFF0C\u9700\u8981\u5F00\u901A\u4F1A\u5458\u6216\u8D2D\u4E70\u540E\u624D\u80FD\u64AD\u653E\uFF0C\u4E5F\u53EF\u4EE5\u6362\u4E00\u9996\u6216\u5207\u5230\u7F51\u6613\u4E91\u6E90",
      "upgrade",
      { code, rawMessage: rawMsg }
    );
  }
  if (code === 104003) {
    return playbackRestriction(
      "qq",
      "copyright_unavailable",
      "QQ \u97F3\u4E50\u6CA1\u6709\u7ED9\u5F53\u524D\u7248\u672C\u8FD4\u56DE\u64AD\u653E\u5730\u5740\uFF0C\u901A\u5E38\u662F\u7248\u6743\u3001\u4F1A\u5458\u6216\u5B98\u65B9\u7248\u672C\u9650\u5236\uFF0C\u53EF\u4EE5\u6362\u4E00\u4E2A\u641C\u7D22\u7ED3\u679C\u6216\u5207\u5230\u7F51\u6613\u4E91\u6E90",
      "switch_source",
      { code, rawMessage: rawMsg }
    );
  }
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) {
    return playbackRestriction("qq", "paid_required", "QQ \u97F3\u4E50\u6B4C\u66F2\u9700\u8981\u4F1A\u5458\u3001\u8D2D\u4E70\u6216\u6570\u5B57\u4E13\u8F91\u6743\u9650", "upgrade", {
      code,
      rawMessage: rawMsg
    });
  }
  if (code && code !== 0) {
    return playbackRestriction(
      "qq",
      "copyright_unavailable",
      rawMsg || "QQ \u97F3\u4E50\u7248\u6743\u6682\u4E0D\u53EF\u64AD\u6216\u4EC5\u5B98\u65B9\u5BA2\u6237\u7AEF\u53EF\u64AD",
      "switch_source",
      { code, rawMessage: rawMsg }
    );
  }
  return playbackRestriction(
    "qq",
    "url_unavailable",
    "QQ \u97F3\u4E50\u6CA1\u6709\u8FD4\u56DE\u64AD\u653E\u5730\u5740\uFF0C\u53EF\u80FD\u53D7\u7248\u6743\u3001\u4F1A\u5458\u6216\u5B98\u65B9\u5BA2\u6237\u7AEF\u9650\u5236",
    "switch_source",
    { code, rawMessage: rawMsg }
  );
}
function normalizeQualityPreference(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (["max", "best", "highest", "auto"].includes(raw)) return "max";
  if (["jymaster", "master", "studio", "svip"].includes(raw)) return "jymaster";
  if (["hires", "hi-res", "highres", "zhenyin", "spatial"].includes(raw)) return "hires";
  if (["lossless", "flac", "sq"].includes(raw)) return "lossless";
  if (["exhigh", "high", "higher", "medium", "192", "192k", "320", "320k", "hq"].includes(raw)) return "exhigh";
  if (["standard", "normal", "128", "128k", "std"].includes(raw)) return "standard";
  if (["aac", "m4a", "c400"].includes(raw)) return "aac";
  return "hires";
}
function qualityCandidatesFrom(target, candidates) {
  const t = normalizeQualityPreference(target);
  let start = candidates.findIndex((item) => item.level === t);
  if (start < 0) start = 0;
  return candidates.slice(start);
}
const QQ_LIKED_PLAYLIST_ID = "qq-liked:201";
const QQ_TOPLIST_PREFIX = "qq-toplist:";
function isQQLikedPlaylistReference(value) {
  return String(value || "").trim() === QQ_LIKED_PLAYLIST_ID;
}
function qqAuthErrorStatus(error) {
  const statusCode = Number(rec(error).statusCode);
  if (statusCode === 401 || statusCode === 403) return statusCode;
  const message = error instanceof Error ? error.message : str(error);
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "AUTH_EXPIRED") return 403;
  return null;
}
function isQQToplistReference(value) {
  return /^qq-toplist:\d+$/.test(String(value || "").trim());
}
function isQQNumericPlaylistId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
}
function qqPlaylistReference(value) {
  const id = String(value || "").trim();
  if (isQQLikedPlaylistReference(id)) return { kind: "liked", id: "201" };
  if (id.startsWith(QQ_TOPLIST_PREFIX)) {
    return { kind: "toplist", id: id.slice(QQ_TOPLIST_PREFIX.length) };
  }
  return { kind: "playlist", id };
}
function isQQFavoritePlaylist(raw) {
  return String(raw.dirid ?? raw.dirId ?? "").trim() === "201";
}
function isQzoneBackgroundPlaylist(pl) {
  const text = String((pl && pl.name || "") + " " + (pl && pl.creator || "")).toLowerCase();
  return /qzone|空间|背景音乐/i.test(text);
}
function qqAlbumCover(albumMid, size) {
  if (!albumMid) return "";
  const px = size || 300;
  return "https://y.qq.com/music/photo_new/T002R" + px + "x" + px + "M000" + albumMid + ".jpg?max_age=2592000";
}
function qqSingerAvatar(singerMid, size) {
  if (!singerMid) return "";
  const px = size || 300;
  return "https://y.qq.com/music/photo_new/T001R" + px + "x" + px + "M000" + singerMid + ".jpg?max_age=2592000";
}
function pickQQImageUrl(...values) {
  for (const value of values) {
    const raw = str(value).trim();
    if (!raw) continue;
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    try {
      const parsed = new URL(normalized);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return normalized;
    } catch {
    }
  }
  return "";
}
function pickQQPlaylistCover(detail, tracks) {
  const playlist = rec(detail);
  return pickQQImageUrl(
    playlist.logo,
    playlist.diss_cover,
    playlist.cover,
    ...tracks.map((track) => rec(track).cover)
  );
}
function qqArtistAliases(name, title) {
  const alias = title.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  return alias && name && alias[1].trim() === name && alias[2].trim() !== name ? { aliases: [alias[2].trim()] } : {};
}
function mapQQArtists(raw) {
  return arr(raw).map((a) => {
    const o = rec(a);
    const mid = str(o.mid || o.singerMid || o.singermid);
    return {
      id: mid || null,
      mid,
      qqArtistId: o.id || o.singerId || o.singerID || "",
      name: str(o.name || o.title || o.singerName),
      ...qqArtistAliases(str(o.name), str(o.title))
    };
  }).filter((a) => a.name);
}
function plainTextDescription(raw) {
  return str(raw).replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p\s*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
}
function mapQQTrack(track, fallback) {
  const t = rec(track);
  const fb = rec(fallback);
  const album = rec(t.album);
  const rawArtists = t.singer || [];
  const artists = mapQQArtists(rawArtists);
  const displayArtists = artists.length ? artists : mapQQArtists(fb.artists);
  const linkedArtist = displayArtists.find((artist) => artist.mid);
  const mid = str(t.mid || fb.mid || fb.songmid);
  const albumMid = str(album.mid || album.pmid);
  const pay = rec(t.pay);
  return {
    provider: "qq",
    source: "qq",
    type: "qq",
    id: mid,
    qqId: t.id || fb.qqId || fb.id || "",
    songType: typeof t.type === "number" ? t.type : void 0,
    mid,
    songmid: mid,
    mediaMid: rec(t.file).media_mid,
    name: str(t.name || t.title || fb.name),
    artist: artists.map((a) => a.name).join(" / ") || str(fb.artist) || displayArtists.map((a) => a.name).join(" / "),
    artists: displayArtists,
    artistId: linkedArtist?.id,
    artistMid: linkedArtist?.mid,
    album: str(album.name || album.title || fb.album),
    albumMid,
    cover: qqAlbumCover(albumMid, 300) || str(fb.cover),
    duration: numOf(t.interval) * 1e3,
    fee: pay && numOf(pay.pay_play) ? 1 : 0,
    playable: false
  };
}
function mapQQPlaylist(raw, kind) {
  const pl = rec(raw);
  const upstreamId = pl.dissid || pl.tid || pl.dirid || pl.id || pl.diss_id;
  const playlist = {
    provider: "qq",
    source: "qq",
    type: "playlist",
    id: upstreamId ? String(upstreamId) : "",
    // 收藏列表（fcg_get_profile_order_asset）用 dissname/listennum/nickname。
    name: str(pl.diss_name || pl.dissname || pl.name || pl.title),
    cover: pickQQImageUrl(pl.diss_cover, pl.logo, pl.picurl, pl.cover),
    trackCount: numOf(pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count),
    playCount: numOf(pl.listen_num || pl.listennum || pl.visitnum || pl.play_count),
    creator: str(pl.hostname || pl.nick || pl.nickname || pl.creator) || "QQ \u97F3\u4E50",
    subscribed: kind === "collect",
    specialType: 0
  };
  if (kind === "created") {
    const show = Number(pl.dir_show);
    if (show === 1 || show === 2) playlist.private = show === 2;
  }
  if (kind !== "collect" && isQQFavoritePlaylist(pl)) {
    playlist.id = QQ_LIKED_PLAYLIST_ID;
  }
  return playlist;
}
function mapQQFeedPlaylist(raw) {
  const item = rec(raw);
  const pl = rec(item.Playlist || item.playlist || item);
  const basic = rec(pl.basic || pl);
  const cover = rec(basic.cover);
  const creator = rec(basic.creator);
  const id = basic.tid || basic.dirid || basic.id;
  return {
    provider: "qq",
    source: "qq",
    id: id ? String(id) : "",
    name: str(basic.title || basic.name),
    cover: pickQQImageUrl(
      cover.medium_url,
      cover.big_url,
      cover.default_url,
      cover.small_url,
      basic.cover
    ),
    trackCount: numOf(basic.song_cnt || basic.songnum),
    playCount: numOf(basic.play_cnt || basic.listen_num),
    creator: str(creator.nick || creator.name) || "QQ \u97F3\u4E50",
    subscribed: false,
    specialType: 0
  };
}
function mapQQPlaylistTrack(raw) {
  const r = rec(raw);
  const track = r.songid || r.songmid || r.mid || r.name ? r : rec(r.track_info || r.songInfo || r.songinfo || r.song);
  const album = rec(track.album);
  const artists = mapQQArtists(track.singer || track.singers || []);
  const linkedArtist = artists.find((artist) => artist.mid);
  const mid = str(track.mid || track.songmid || r.mid || r.songmid);
  const albumMid = str(album.mid || track.albummid || r.albummid);
  const pay = rec(track.pay);
  return {
    provider: "qq",
    source: "qq",
    type: "qq",
    id: mid,
    qqId: track.id || track.songid || r.id || r.songid || "",
    songType: typeof track.type === "number" ? track.type : void 0,
    mid,
    songmid: mid,
    mediaMid: str(rec(track.file).media_mid || track.strMediaMid || track.media_mid || r.strMediaMid),
    name: str(track.name || track.songname || r.songname),
    artist: artists.map((a) => a.name).join(" / ") || str(track.singername || r.singername),
    artists,
    artistId: linkedArtist?.id,
    artistMid: linkedArtist?.mid,
    album: str(album.name || album.title || track.albumname || r.albumname),
    albumMid,
    cover: qqAlbumCover(albumMid, 300),
    duration: numOf(track.interval || r.interval) * 1e3,
    fee: pay && numOf(pay.pay_play) ? 1 : 0,
    playable: false
  };
}
function mapQQComment(raw) {
  const r = rec(raw);
  const user = rec(r.user || r.uin);
  const nickname = str(
    r.nick || r.nickname || r.encrypt_uin || user.nick || user.nickname || user.name
  ) || "QQ \u97F3\u4E50\u7528\u6237";
  const avatar = str(r.avatarurl || r.avatar || user.avatarurl || user.avatar);
  const timeRaw = numOf(r.time || r.commenttime || r.createTime);
  return {
    id: r.commentid || r.commentId || r.id || "",
    content: decodeHtmlEntities(str(r.rootcommentcontent || r.content || r.comment).replace(/<br\s*\/?>/gi, "\n")),
    likedCount: numOf(r.praisenum || r.praise_num || r.likedCount),
    time: timeRaw && timeRaw < 1e10 ? timeRaw * 1e3 : timeRaw,
    user: {
      id: r.encrypt_uin || r.uin || user.uin || "",
      nickname,
      avatar
    }
  };
}
function decodeHtmlEntities(text) {
  return String(text || "").replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
function decodeQQLyricText(text) {
  let raw = decodeHtmlEntities(String(text || "").trim());
  if (!raw) return "";
  if (/^[\da-f]+$/i.test(raw) && raw.length % 16 === 0) {
    if (raw.length > 1024 * 1024) return "";
    try {
      raw = decryptQrc(raw);
    } catch {
      return "";
    }
  }
  const compact = raw.replace(/\s+/g, "");
  const looksBase64 = compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  if (looksBase64 && !/^\s*\[/.test(raw)) {
    try {
      const decoded = Buffer.from(compact, "base64").toString("utf8").replace(/^﻿/, "");
      if (decoded && (decoded.includes("[") || /[一-龥]/.test(decoded))) raw = decoded;
    } catch (e) {
      console.warn("[QQLyric] base64 decode failed:", e.message);
    }
  }
  return decodeHtmlEntities(raw).replace(/\r\n/g, "\n").trim();
}
function normalizeQQSongId(id) {
  const raw = String(id || "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  return Number(raw);
}
async function qqMusicRequest(cookie, payload, opts = {}) {
  const body = JSON.stringify(payload);
  const headers = {
    ...QQ_HEADERS,
    "Content-Type": "application/json;charset=UTF-8",
    "Content-Length": String(Buffer.byteLength(body))
  };
  if (opts.cookie && cookie) headers.Cookie = cookie;
  const text = await requestText(QQ_MUSICU_URL, { method: "POST", headers }, body);
  return parseJSONText(text);
}
async function qqGetJSON(cookie, targetUrl, params = {}, opts = {}) {
  const u = new URL(targetUrl);
  Object.keys(params).forEach((k) => {
    if (params[k] != null) u.searchParams.set(k, String(params[k]));
  });
  const headers = { ...QQ_HEADERS, ...opts.headers || {} };
  if (opts.cookie !== false && cookie) headers.Cookie = cookie;
  const text = await requestText(u.toString(), { headers });
  return parseJSONText(text);
}
function normalizeQQProfile(cookie, body, cookieObj) {
  const uin = qqCookieUin(cookieObj);
  const b = rec(body);
  const data = rec(b.data || b.profile || b.creator || b.result);
  const creator = rec(data.creator || data.user || data.profile || data);
  const vipInfo = rec(data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo);
  const profileNick = str(
    creator.nick || creator.nickname || creator.name || creator.hostname || creator.title
  );
  const profileAvatar = str(creator.headpic || creator.avatar || creator.avatarUrl || creator.logo);
  const cookieNick = qqCookieNickname(cookieObj, uin);
  const nick = profileNick || cookieNick || "";
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin);
  let vipType = Number(
    cookieObj.vipType || cookieObj.vip_type || data.vipType || data.vip_type || data.viptype || data.music_vip_level || data.green_vip_level || data.luxury_vip_level || creator.vipType || creator.vip_type || creator.music_vip_level || creator.green_vip_level || creator.luxury_vip_level || vipInfo.vipType || vipInfo.vip_type || vipInfo.music_vip_level || vipInfo.green_vip_level || vipInfo.luxury_vip_level || 0
  ) || 0;
  if (!vipType) {
    const vipFlag = data.isVip || data.is_vip || data.vipFlag || data.vipflag || creator.isVip || creator.is_vip || vipInfo.isVip || vipInfo.is_vip || vipInfo.vipFlag;
    if (vipFlag === true || Number(vipFlag) > 0 || String(vipFlag || "").toLowerCase() === "true") {
      vipType = 1;
    }
  }
  return {
    provider: "qq",
    loggedIn: !!(uin && qqCookieMusicKey(cookieObj)),
    preview: false,
    userId: uin,
    nickname: nick,
    avatar,
    vipType,
    hasCookie: !!cookie,
    playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? "qq-profile" : cookieNick || avatar ? "cookie" : "fallback"
  };
}
async function getQQLoginInfo(cookie) {
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return { provider: "qq", loggedIn: false, hasCookie: !!cookie };
  const fallback = normalizeQQProfile(cookie, null, cookieObj);
  try {
    const u = new URL("https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg");
    u.searchParams.set("cid", "205360838");
    u.searchParams.set("userid", uin);
    u.searchParams.set("reqfrom", "1");
    u.searchParams.set("g_tk", "5381");
    u.searchParams.set("loginUin", uin);
    u.searchParams.set("hostUin", "0");
    u.searchParams.set("format", "json");
    u.searchParams.set("inCharset", "utf8");
    u.searchParams.set("outCharset", "utf-8");
    u.searchParams.set("notice", "0");
    u.searchParams.set("platform", "yqq.json");
    u.searchParams.set("needNewCode", "0");
    const text = await requestText(u.toString(), {
      headers: { ...QQ_HEADERS, Cookie: cookie }
    });
    const body = rec(parseJSONText(text));
    const info = normalizeQQProfile(cookie, body, cookieObj);
    if (body && (body.code === 1e3 || body.result === 301)) {
      return { ...fallback, profileUnavailable: true };
    }
    return info;
  } catch (e) {
    console.warn("[QQLogin] profile check failed:", e.message);
    return { ...fallback, profileUnavailable: true };
  }
}
async function handleQQUserPlaylists(cookie) {
  const info = await getQQLoginInfo(cookie);
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: "qq", playlists: [] };
  const uin = info.userId;
  const createdReq = qqGetJSON(
    cookie,
    "https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss",
    {
      hostUin: 0,
      hostuin: uin,
      sin: 0,
      size: 200,
      g_tk: 5381,
      loginUin: uin,
      format: "json",
      inCharset: "utf8",
      outCharset: "utf-8",
      notice: 0,
      platform: "yqq.json",
      needNewCode: 0
    },
    { headers: { Referer: "https://y.qq.com/portal/profile.html" } }
  );
  const collectReq = qqGetJSON(
    cookie,
    "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg",
    { ct: 20, cid: 205360956, userid: uin, reqtype: 3, sin: 0, ein: 80 },
    { headers: { Referer: "https://y.qq.com/portal/profile.html" } }
  );
  const [createdRaw, collectRaw] = await Promise.allSettled([createdReq, collectReq]);
  const created = createdRaw.status === "fulfilled" && Array.isArray(rec(rec(createdRaw.value).data).disslist) ? rec(rec(createdRaw.value).data).disslist.map((pl) => mapQQPlaylist(pl, "created")) : [];
  const collected = collectRaw.status === "fulfilled" && Array.isArray(rec(rec(collectRaw.value).data).cdlist) ? rec(rec(collectRaw.value).data).cdlist.map((pl) => mapQQPlaylist(pl, "collect")) : [];
  const seen = /* @__PURE__ */ new Set();
  const playlists = created.concat(collected).filter((pl) => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false;
    if (isQzoneBackgroundPlaylist(pl)) return false;
    seen.add(pl.id);
    return true;
  }).sort((a, b) => Number(b.id === QQ_LIKED_PLAYLIST_ID) - Number(a.id === QQ_LIKED_PLAYLIST_ID));
  const liked = playlists.find((playlist) => playlist.id === QQ_LIKED_PLAYLIST_ID);
  if (liked && !liked.cover) {
    try {
      const detail = await handleQQLikedPlaylist(cookie);
      liked.cover = str(rec(detail.playlist).cover);
    } catch {
    }
  }
  return { loggedIn: true, provider: "qq", userId: uin, playlists };
}
async function handleQQUserAlbums(cookie) {
  const info = await getQQLoginInfo(cookie);
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: "qq", albums: [] };
  const uin = info.userId;
  const albums = [];
  const seen = /* @__PURE__ */ new Set();
  for (let page = 0; page < 20; page++) {
    const data = rec(rec(await qqGetJSON(
      cookie,
      "https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg",
      { ct: 20, cid: 205360956, userid: uin, reqtype: 2, sin: page * 60, ein: page * 60 + 59 },
      { headers: { Referer: "https://y.qq.com/portal/profile.html" } }
    )).data);
    const items = arr(data.albumlist);
    for (const raw of items) {
      const a = rec(raw);
      const mid = str(a.albummid);
      if (!mid || seen.has(mid)) continue;
      seen.add(mid);
      albums.push({
        provider: "qq",
        source: "qq",
        type: "album",
        id: mid,
        name: str(a.albumname),
        cover: qqAlbumCover(mid, 300),
        trackCount: numOf(a.songnum),
        playCount: 0,
        creator: str(a.singername),
        tag: "\u4E13\u8F91"
      });
    }
    if (!numOf(data.has_more) || items.length === 0) break;
  }
  return { loggedIn: true, provider: "qq", albums };
}
async function handleQQRadarSong(cookie) {
  const info = await getQQLoginInfo(cookie);
  if (!info.loggedIn) return { provider: "qq", playlist: null, tracks: [] };
  const comm = qqAuthComm(cookie);
  const seen = /* @__PURE__ */ new Set();
  const tracks = [];
  for (let page = 1; page <= 4 && tracks.length < 30; page++) {
    let json;
    try {
      json = rec(
        await qqMusicRequest(
          cookie,
          {
            comm,
            radar: {
              module: "music.recommend.TrackRelationServer",
              method: "GetRadarSong",
              param: { Page: page }
            }
          },
          { cookie: true }
        )
      );
    } catch (e) {
      console.warn("[QQRadar] batch failed:", e.message);
      break;
    }
    const block = rec(json.radar);
    const data = rec(block.data);
    const rawList = [data.VecSongs, data.songList, data.vec_song, data.tracks, data.List, data.data].map(arr).find((list) => list.length) || [];
    if (rawList.length === 0) break;
    for (const raw of rawList) {
      const song = mapQQPlaylistTrack(rec(raw).Track || raw);
      const key = str(song.mid) || str(song.id);
      if (!key || seen.has(key) || !song.name) continue;
      seen.add(key);
      tracks.push(song);
      if (tracks.length >= 30) break;
    }
    if (!data.HasMore) break;
  }
  if (tracks.length === 0) return { provider: "qq", playlist: null, tracks: [] };
  const playlist = {
    provider: "qq",
    source: "qq",
    type: "playlist",
    id: "qq-radar",
    name: "\u79C1\u4EBA\u96F7\u8FBE",
    cover: str(tracks[0].cover),
    trackCount: tracks.length,
    playCount: 0,
    creator: "QQ \u97F3\u4E50"
  };
  return { provider: "qq", playlist, tracks };
}
async function handleQQRecommendFeed(cookie, page) {
  const from = Math.max(0, page) * 20;
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: { ct: 24, cv: 0 },
      feed: {
        module: "music.playlist.PlaylistSquare",
        method: "GetRecommendFeed",
        param: { From: from, Size: 20 }
      }
    })
  );
  const block = rec(json.feed);
  const data = rec(block.data);
  const rawList = [data.content, data.List, data.v_playlist, data.playlist, data.disslist].map(arr).find((list) => list.length) || [];
  const playlists = rawList.map(mapQQFeedPlaylist).filter((pl) => pl.id && pl.name);
  return { provider: "qq", playlists };
}
async function handleQQRecommendSongs(cookie) {
  const info = await getQQLoginInfo(cookie);
  if (!info.loggedIn) return { provider: "qq", songs: [] };
  const seen = /* @__PURE__ */ new Set();
  const songs = [];
  for (let i = 0; i < 4 && songs.length < 20; i++) {
    let json;
    try {
      json = rec(
        await qqMusicRequest(
          cookie,
          {
            comm: qqAuthComm(cookie),
            radio: {
              module: "music.radioProxy.MbTrackRadioSvr",
              method: "get_radio_track",
              param: {}
            }
          },
          { cookie: true }
        )
      );
    } catch (e) {
      console.warn("[QQRecommendSongs] batch failed:", e.message);
      break;
    }
    const block = rec(json.radio);
    const data = rec(block.data);
    const rawList = [data.track, data.songList, data.vec_song, data.tracks].map(arr).find((list) => list.length) || [];
    if (rawList.length === 0) break;
    for (const raw of rawList) {
      const song = mapQQPlaylistTrack(raw);
      const key = str(song.mid) || str(song.id);
      if (!key || seen.has(key) || !song.name) continue;
      seen.add(key);
      songs.push(song);
      if (songs.length >= 20) break;
    }
  }
  return { provider: "qq", songs };
}
const QQ_PLAYLIST_PAGE_SIZE = 100;
const QQ_PLAYLIST_MAX_PAGES = 100;
function qqHasLoginCookie(cookie) {
  const cookieObj = parseCookieString(cookie);
  return !!(qqCookieUin(cookieObj) && qqCookieMusicKey(cookieObj));
}
function qqPlaylistReportedTotal(data, detail) {
  for (const value of [data.total_song_num, data.songlist_size, data.totalNum, detail.total_song_num, detail.songlist_size, detail.totalNum]) {
    if (typeof value !== "number" && typeof value !== "string" || String(value).trim() === "") continue;
    const count = Number(value);
    if (Number.isSafeInteger(count) && count >= 0) return count;
  }
  return void 0;
}
function qqPlaylistTotal(data, detail) {
  return qqPlaylistReportedTotal(data, detail) ?? 0;
}
function qqPageHasMore(data, offset, rawCount, total) {
  const marker = data.hasmore ?? data.hasMore;
  if (marker !== void 0) return marker === true || Number(marker) > 0;
  if (total > 0) return offset + rawCount < total;
  return rawCount >= QQ_PLAYLIST_PAGE_SIZE;
}
async function fetchQQDissPage(cookie, ref, offset, num = QQ_PLAYLIST_PAGE_SIZE) {
  const liked = ref.kind === "liked";
  if (!liked && !isQQNumericPlaylistId(ref.id)) throw new Error("Invalid QQ playlist id");
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        playlist: {
          module: "music.srfDissInfo.DissInfo",
          method: "CgiGetDiss",
          param: {
            disstid: liked ? 0 : Number(ref.id),
            dirid: liked ? 201 : 0,
            tag: true,
            song_begin: offset,
            song_num: num,
            userinfo: true,
            orderlist: true,
            onlysonglist: false
          }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.playlist);
  const data = rec(block.data);
  const failedCode = [json.code, block.code, data.code, data.subcode].find((code) => code !== void 0 && Number(code) !== 0);
  if (!json.playlist || failedCode !== void 0 || !Array.isArray(data.songlist)) {
    const code = Number(failedCode || block.result || 0);
    const message = str(block.message || block.msg || data.message || data.msg);
    if (liked && qqHasLoginCookie(cookie) && ([301, 1e3].includes(code) || /auth|cookie|login|登录|未登陆|过期|失效|票据/i.test(message))) {
      const error = new Error("AUTH_EXPIRED");
      error.statusCode = 403;
      throw error;
    }
    throw new Error(message || "QQ_PLAYLIST_DETAIL_FAILED");
  }
  return { data, detail: rec(data.dirinfo), rawTracks: data.songlist };
}
async function fetchQQToplistPage(cookie, topId, offset, num = QQ_PLAYLIST_PAGE_SIZE) {
  if (!/^\d+$/.test(topId)) throw new Error("Invalid QQ toplist id");
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        toplist: {
          module: "music.musicToplist.Toplist",
          method: "GetDetail",
          param: { topId: Number(topId), offset, num, withTags: true }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.toplist);
  if (!json.toplist || Number(block.code || 0) !== 0) {
    throw new Error(str(block.message || block.msg) || "QQ_TOPLIST_DETAIL_FAILED");
  }
  const data = rec(block.data);
  return { data, detail: rec(data.data), rawTracks: arr(data.songInfoList) };
}
function mapQQToplistPreviewTrack(raw) {
  const item = rec(raw);
  const song = rec(item.songInfo || item.songinfo || item);
  const artists = mapQQArtists(song.singer || song.singers);
  return {
    name: str(song.name || song.title || song.songname || item.title),
    artist: artists.map((artist) => artist.name).join(" / ") || str(song.singerName || song.singername || item.singerName)
  };
}
function mapQQToplistEntry(raw) {
  const item = rec(raw);
  const topId = str(item.topId || item.topid || item.id);
  const preview = arr(item.song || item.songList || item.songlist).map(mapQQToplistPreviewTrack).filter((track) => track.name).slice(0, 3);
  return {
    playlist: {
      provider: "qq",
      source: "qq",
      type: "playlist",
      id: topId ? `${QQ_TOPLIST_PREFIX}${topId}` : "",
      name: str(item.title || item.name),
      cover: pickQQImageUrl(
        item.frontPicUrl,
        item.frontpic,
        item.headPicUrl,
        item.picUrl,
        item.toplistPic,
        item.cover
      ),
      trackCount: numOf(item.songNum || item.totalNum || item.total_song_num),
      playCount: numOf(item.listenNum || item.listen_num || item.playCount),
      creator: "QQ \u97F3\u4E50",
      tag: "\u6392\u884C\u699C",
      description: plainTextDescription(item.intro || item.desc)
    },
    updateFrequency: str(item.updateTips || item.updateTime || item.period),
    preview
  };
}
async function handleQQToplists(cookie) {
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        toplists: {
          module: "music.musicToplist.Toplist",
          method: "GetAll",
          param: {}
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.toplists);
  if (!json.toplists || Number(block.code || 0) !== 0) {
    throw new Error(str(block.message || block.msg || block.code) || "QQ_TOPLISTS_FAILED");
  }
  const groups = arr(rec(block.data).group).map((rawGroup) => {
    const group = rec(rawGroup);
    const entries = arr(group.toplist || group.list).map(mapQQToplistEntry).filter((entry) => {
      const playlist = rec(entry.playlist);
      return playlist.id && playlist.name;
    });
    return {
      title: str(group.groupName || group.groupTitle || group.title || group.name) || "\u6392\u884C\u699C",
      entries
    };
  }).filter((group) => group.entries.length > 0);
  return { provider: "qq", groups };
}
async function handleQQToplistPreview(cookie, id) {
  if (!isQQToplistReference(id)) {
    return { provider: "qq", error: "INVALID_QQ_TOPLIST_ID", preview: [] };
  }
  const ref = qqPlaylistReference(id);
  const topId = ref.kind === "toplist" ? ref.id : "";
  const result = await fetchQQToplistPage(cookie, topId, 0, 3);
  const preview = result.rawTracks.map(mapQQToplistPreviewTrack).filter((track) => track.name).slice(0, 3);
  return { provider: "qq", preview };
}
async function handleQQLikedPlaylist(cookie) {
  if (!qqHasLoginCookie(cookie)) {
    return { loggedIn: false, provider: "qq", playlist: null };
  }
  const result = await fetchQQDissPage(cookie, { kind: "liked", id: "201" }, 0, 1);
  const tracks = result.rawTracks.map(mapQQPlaylistTrack).filter((track) => track.name && track.mid);
  const detail = result.detail;
  return {
    loggedIn: true,
    provider: "qq",
    playlist: {
      provider: "qq",
      source: "qq",
      type: "playlist",
      id: QQ_LIKED_PLAYLIST_ID,
      name: str(detail.title || detail.name || detail.dissname || detail.diss_name) || "\u6211\u559C\u6B22\u7684\u97F3\u4E50",
      cover: pickQQPlaylistCover(detail, tracks),
      trackCount: qqPlaylistTotal(result.data, detail),
      playCount: numOf(detail.listen_num || detail.visitnum || detail.play_count),
      creator: str(detail.nick || detail.hostname || detail.creator) || "QQ \u97F3\u4E50",
      tag: "\u6536\u85CF"
    }
  };
}
function mapQQPlaylistPageTracks(ref, rawTracks) {
  return rawTracks.map(ref.kind === "toplist" ? (raw) => mapQQTrack(raw, {}) : mapQQPlaylistTrack).filter((track) => track.mid).map((track) => ({ ...track, name: str(track.name).trim() ? track.name : `\u6B4C\u66F2 ID ${track.mid}` }));
}
async function handleQQPlaylistPage(cookie, id, offset, limit) {
  const ref = qqPlaylistReference(id);
  const loggedIn = qqHasLoginCookie(cookie);
  if (!ref.id) return { loggedIn, provider: "qq", error: "Missing QQ playlist id", tracks: [], total: null, hasMore: false };
  if (ref.kind === "liked" && !loggedIn) return { loggedIn: false, provider: "qq", tracks: [], total: null, hasMore: false };
  const start = Math.max(0, Math.floor(offset) || 0);
  const num = Math.max(1, Math.min(QQ_PLAYLIST_PAGE_SIZE, Math.floor(limit) || QQ_PLAYLIST_PAGE_SIZE));
  const result = ref.kind === "toplist" ? await fetchQQToplistPage(cookie, ref.id, start, num) : await fetchQQDissPage(cookie, ref, start, num);
  const total = qqPlaylistReportedTotal(result.data, result.detail) ?? null;
  const rawCount = result.rawTracks.length;
  const known = (result.data.hasmore ?? result.data.hasMore) !== void 0 || (total ?? 0) > 0;
  const hasMore = rawCount > 0 && (known ? qqPageHasMore(result.data, start, rawCount, total ?? 0) : rawCount >= num);
  return {
    loggedIn,
    provider: "qq",
    tracks: mapQQPlaylistPageTracks(ref, result.rawTracks),
    total,
    nextOffset: start + rawCount,
    hasMore
  };
}
async function handleQQPlaylistTracks(cookie, id, current = () => true) {
  const ref = qqPlaylistReference(id);
  const loggedIn = qqHasLoginCookie(cookie);
  if (!ref.id) {
    return { loggedIn, provider: "qq", error: "Missing QQ playlist id", trackIds: [], tracks: [] };
  }
  if (ref.kind === "liked" && !loggedIn) {
    return { loggedIn: false, provider: "qq", trackIds: [], tracks: [] };
  }
  const tracks = [];
  let detail = {};
  let total;
  let offset = 0;
  let complete = false;
  for (let page = 0; page < QQ_PLAYLIST_MAX_PAGES; page++) {
    if (!current()) throw new Error("QQ \u8D26\u53F7\u5DF2\u53D8\u5316\u6216\u8BF7\u6C42\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u91CD\u8BD5");
    const result = ref.kind === "toplist" ? await fetchQQToplistPage(cookie, ref.id, offset) : await fetchQQDissPage(cookie, ref, offset);
    if (!current()) throw new Error("QQ \u8D26\u53F7\u5DF2\u53D8\u5316\u6216\u8BF7\u6C42\u5DF2\u53D6\u6D88\uFF0C\u8BF7\u91CD\u8BD5");
    if (page === 0) detail = result.detail;
    const pageTotal = qqPlaylistReportedTotal(result.data, result.detail);
    if (total !== void 0 && pageTotal !== void 0 && total !== pageTotal) {
      throw new Error("QQ \u6B4C\u5355\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D");
    }
    total = pageTotal ?? total;
    tracks.push(...mapQQPlaylistPageTracks(ref, result.rawTracks));
    const rawCount = result.rawTracks.length;
    const hasMore = qqPageHasMore(result.data, offset, rawCount, total ?? 0);
    const moreMarker = result.data.hasmore ?? result.data.hasMore;
    if (!rawCount && (moreMarker === true || Number(moreMarker) > 0)) {
      throw new Error("QQ \u6B4C\u5355\u6B4C\u66F2\u5217\u8868\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    }
    if (!rawCount || !hasMore) {
      complete = true;
      break;
    }
    offset += rawCount;
  }
  if (!complete) throw new Error("QQ \u6B4C\u5355\u6B4C\u66F2\u5217\u8868\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  const playlistId = ref.kind === "liked" ? QQ_LIKED_PLAYLIST_ID : ref.kind === "toplist" ? `${QQ_TOPLIST_PREFIX}${ref.id}` : ref.id;
  const playlist = {
    provider: "qq",
    source: "qq",
    type: ref.kind === "toplist" ? "toplist" : "playlist",
    id: playlistId,
    name: str(detail.title || detail.name || detail.dissname || detail.diss_name) || (ref.kind === "liked" ? "\u6211\u559C\u6B22\u7684\u97F3\u4E50" : ""),
    cover: pickQQPlaylistCover(detail, tracks),
    trackCount: Math.max(total ?? 0, tracks.length),
    description: plainTextDescription(detail.desc || detail.intro || detail.description),
    creator: str(detail.host_nick || detail.nick || detail.nickname),
    playCount: numOf(detail.listennum || detail.listen_num || detail.visitnum)
  };
  return {
    loggedIn,
    provider: "qq",
    playlist,
    trackIds: tracks.map((track) => track.id),
    tracks
  };
}
async function qqSongDetail(cookie, mid, fallback) {
  if (!mid) return fallback;
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: { ct: 24, cv: 0 },
      songinfo: {
        module: "music.pf_song_detail_svr",
        method: "get_song_detail_yqq",
        param: { song_mid: mid }
      }
    })
  );
  const data = rec(rec(json.songinfo).data);
  return mapQQTrack(data.track_info, fallback);
}
async function handleQQArtistDetail(cookie, mid, limit) {
  const singerMid = String(mid || "").trim();
  const num = Math.max(10, Math.min(80, parseInt(String(limit || "36"), 10) || 36));
  if (!singerMid) return { provider: "qq", error: "MISSING_SINGER_MID", artist: null, songs: [] };
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: { ct: 24, cv: 0 },
        singer: {
          module: "music.web_singer_info_svr",
          method: "get_singer_detail_info",
          param: { sort: 5, singermid: singerMid, sin: 0, num }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.singer);
  if (!json.singer || Number(block.code || 0) !== 0) {
    return {
      provider: "qq",
      error: block && (block.message || block.msg || block.code) || "QQ_ARTIST_DETAIL_FAILED",
      artist: null,
      songs: []
    };
  }
  const data = rec(block.data);
  const info = rec(data.singer_info || data.singerInfo);
  const rawSongs = arr(data.songlist);
  const songs = rawSongs.map((raw) => {
    const r = rec(raw);
    return mapQQTrack(r.track_info || r.songInfo || r.songinfo || r.song || raw, {});
  }).filter((song) => song && song.name && (song.mid || song.id));
  const firstArtists = songs[0] ? songs[0].artists : void 0;
  const matchedSongArtist = firstArtists && firstArtists.find((a) => a && a.mid === singerMid);
  const artistMid = str(info.mid || info.singerMid || info.singermid) || singerMid;
  const artistName = str(info.name || info.title) || matchedSongArtist && matchedSongArtist.name || "";
  const totalSong = numOf(data.total_song || data.song_count) || songs.length;
  return {
    provider: "qq",
    artist: {
      provider: "qq",
      source: "qq",
      id: artistMid,
      mid: artistMid,
      qqArtistId: info.id || "",
      name: artistName,
      avatar: str(info.pic || info.avatar) || qqSingerAvatar(artistMid, 300),
      description: str(data.singer_brief),
      fans: numOf(info.fans),
      musicSize: totalSong,
      albumSize: numOf(data.total_album),
      mvSize: numOf(data.total_mv)
    },
    total: totalSong,
    songs
  };
}
async function handleQQArtistSimilar(cookie, mid, limit) {
  const singerMid = String(mid || "").trim();
  if (!singerMid) return { provider: "qq", error: "MISSING_SINGER_MID", artists: [] };
  const number = Math.max(1, Math.min(30, limit || 10));
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm: qqAuthComm(cookie),
        similarSinger: {
          module: "music.SimilarSingerSvr",
          method: "GetSimilarSingerList",
          param: { singerMid, number }
        }
      },
      { cookie: true }
    )
  );
  const block = rec(json.similarSinger);
  if (!json.similarSinger || Number(json.code || 0) !== 0 || Number(block.code || 0) !== 0) {
    throw new Error(str(block.message || block.msg) || "QQ_ARTIST_SIMILAR_FAILED");
  }
  const seen = /* @__PURE__ */ new Set([singerMid]);
  const artists = arr(rec(block.data).singerlist || rec(block.data).singerList).map((raw) => {
    const artist = rec(raw);
    const artistMid = str(artist.singerMid || artist.singerMID || artist.mid);
    return {
      provider: "qq",
      source: "qq",
      id: artistMid,
      mid: artistMid,
      qqArtistId: artist.singerId || artist.singerID || artist.id || "",
      name: str(artist.singerName || artist.name),
      avatar: pickQQImageUrl(artist.singerPic, artist.pic, artist.avatar) || qqSingerAvatar(artistMid, 300)
    };
  }).filter((artist) => {
    if (!artist.mid || !artist.name || seen.has(artist.mid)) return false;
    seen.add(artist.mid);
    return true;
  });
  return { provider: "qq", artists };
}
async function requestQQSearch(cookie, query, searchType, limit) {
  const module = "music.search.SearchCgiService";
  const payload = {
    [module]: {
      module,
      method: "DoSearchForQQMusicDesktop",
      param: { search_type: searchType, query, page_num: 1, num_per_page: limit }
    }
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const json = rec(await qqMusicRequest(cookie, payload));
    const block = rec(json[module]);
    const code = Number(json.code || 0) || Number(block.code || 0);
    if (code === 0 && json[module]) return block;
    if (code === 2001 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    throw new Error(code ? `QQ_SEARCH_FAILED (${code})` : "QQ_SEARCH_FAILED");
  }
  throw new Error("QQ_SEARCH_FAILED");
}
async function handleQQArtistSearch(cookie, keywords, limit) {
  const kw = String(keywords || "").trim();
  if (!kw) return [];
  const num = Math.max(1, Math.min(limit || 5, 10));
  const block = await requestQQSearch(cookie, kw, 1, num);
  const list = arr(rec(rec(rec(block.data).body).singer).list);
  return list.map((raw) => {
    const s = rec(raw);
    const mid = str(s.singerMID || s.singermid);
    return {
      provider: "qq",
      id: mid,
      mid,
      qqArtistId: s.singerID || s.singerId || "",
      name: str(s.singerName),
      avatar: str(s.singerPic) || qqSingerAvatar(mid, 300),
      musicSize: numOf(s.songNum)
    };
  }).filter((a) => a.name && a.mid);
}
async function handleQQArtistSongs(cookie, mid, limit, offset) {
  const singerMid = String(mid || "").trim();
  if (!singerMid) return { provider: "qq", error: "MISSING_SINGER_MID", songs: [] };
  const num = Math.max(1, Math.min(100, limit || 30));
  const begin = Math.max(0, offset || 0);
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: { ct: 24, cv: 0 },
      singerSongList: {
        module: "musichall.song_list_server",
        method: "GetSingerSongList",
        param: { singerMid, order: 1, begin, num }
      }
    })
  );
  const block = rec(json.singerSongList);
  if (!json.singerSongList || Number(block.code || 0) !== 0) {
    return {
      provider: "qq",
      error: str(block.message || block.msg) || "QQ_ARTIST_SONGS_FAILED",
      songs: []
    };
  }
  const data = rec(block.data);
  const songs = arr(data.songList).map((raw) => mapQQTrack(rec(raw).songInfo, {})).filter((s) => s && s.name && (s.mid || s.id));
  return { provider: "qq", total: numOf(data.totalNum) || songs.length, songs };
}
function mapQQAlbum(raw) {
  const a = rec(raw);
  const albumMid = str(a.albumMid);
  return {
    provider: "qq",
    source: "qq",
    type: "album",
    id: albumMid,
    name: str(a.albumName),
    cover: qqAlbumCover(albumMid, 300),
    trackCount: numOf(a.totalNum),
    playCount: 0,
    creator: str(a.singerName),
    tag: "\u4E13\u8F91",
    description: str(a.albumTranName)
  };
}
async function handleQQAlbumDetail(cookie, albumMid) {
  const mid = String(albumMid || "").trim();
  if (!mid) return { provider: "qq", error: "MISSING_ALBUM_MID", playlist: null };
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: qqAuthComm(cookie),
      albumInfo: {
        module: "music.musichallAlbum.AlbumInfoServer",
        method: "GetAlbumDetail",
        param: { albumMId: mid }
      }
    })
  );
  const block = rec(json.albumInfo);
  if (!json.albumInfo || Number(block.code || 0) !== 0) {
    return {
      provider: "qq",
      error: str(block.message || block.msg) || "QQ_ALBUM_DETAIL_FAILED",
      playlist: null
    };
  }
  const data = rec(block.data);
  const basic = rec(data.basicInfo);
  if (Object.keys(basic).length === 0) {
    return { provider: "qq", error: "QQ_ALBUM_DETAIL_FAILED", playlist: null };
  }
  const company = rec(data.company);
  const artists = mapQQArtists(rec(data.singer).singerList);
  const resolvedMid = str(basic.albumMid || basic.mid) || mid;
  const publishDate = str(basic.publishDate || basic.publish_date || basic.time_public);
  const companyName = str(company.name);
  return {
    provider: "qq",
    playlist: {
      provider: "qq",
      source: "qq",
      type: "album",
      id: resolvedMid,
      qqAlbumId: basic.albumID || basic.albumId || basic.id || "",
      name: str(basic.albumName || basic.name || basic.title),
      cover: qqAlbumCover(resolvedMid, 300),
      // AlbumInfo 没有可靠的曲目数，详情页使用 AlbumSongList 的实际列表长度。
      trackCount: 0,
      playCount: 0,
      creator: artists.map((artist) => artist.name).join(" / "),
      tag: [publishDate, companyName].filter(Boolean).join(" \xB7 "),
      description: str(basic.desc || basic.description || basic.intro)
    }
  };
}
async function handleQQArtistAlbums(cookie, mid, limit, offset) {
  const singerMid = String(mid || "").trim();
  if (!singerMid) return { provider: "qq", error: "MISSING_SINGER_MID", albums: [] };
  const num = Math.max(1, Math.min(80, limit || 30));
  const begin = Math.max(0, offset || 0);
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: { ct: 24, cv: 0 },
      singerAlbum: {
        module: "music.musichallAlbum.AlbumListServer",
        method: "GetAlbumList",
        param: { singerMid, order: 1, begin, num }
      }
    })
  );
  const block = rec(json.singerAlbum);
  if (!json.singerAlbum || Number(block.code || 0) !== 0) {
    return {
      provider: "qq",
      error: str(block.message || block.msg) || "QQ_ARTIST_ALBUMS_FAILED",
      albums: []
    };
  }
  const data = rec(block.data);
  const albums = arr(data.albumList).map(mapQQAlbum).filter((a) => a.id && a.name);
  return { provider: "qq", albums };
}
async function handleQQAlbumSongs(cookie, albumMid) {
  const mid = String(albumMid || "").trim();
  if (!mid) return { provider: "qq", error: "MISSING_ALBUM_MID", songs: [] };
  const json = rec(
    await qqMusicRequest(cookie, {
      comm: { ct: 24, cv: 0 },
      albumSongs: {
        module: "music.musichallAlbum.AlbumSongList",
        method: "GetAlbumSongList",
        // 专辑曲目一次拉全(专辑规模小,300 足够覆盖合集类)
        param: { albumMid: mid, begin: 0, num: 300, order: 2 }
      }
    })
  );
  const block = rec(json.albumSongs);
  if (!json.albumSongs || Number(block.code || 0) !== 0) {
    return {
      provider: "qq",
      error: str(block.message || block.msg) || "QQ_ALBUM_SONGS_FAILED",
      songs: []
    };
  }
  const data = rec(block.data);
  const songs = arr(data.songList).map((raw) => mapQQTrack(rec(raw).songInfo, {})).filter((s) => s && s.name && (s.mid || s.id));
  return { provider: "qq", total: numOf(data.totalNum) || songs.length, songs };
}
function parseQQRelatedId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
async function requestQQRelated(method, songId, params = {}) {
  if (parseQQRelatedId(songId) === null) throw new Error("INVALID_QQ_SONG_ID");
  const json = rec(await qqMusicRequest("", {
    comm: { ct: 24, cv: 0, format: "json", uin: "0" },
    related: { module: "music.recommend.TrackRelationServer", method, param: { songid: songId, ...params } }
  }));
  const block = rec(json.related);
  const data = rec(block.data);
  if (!json.related || Number(json.code || 0) !== 0 || Number(block.code || 0) !== 0 || Number(data.retcode || 0) !== 0) {
    throw new Error("QQ_RELATED_CONTENT_FAILED");
  }
  return data;
}
async function handleQQSimilarSongs(songId) {
  const data = await requestQQRelated("GetSimilarSongs", songId);
  const raw = [
    ...arr(data.vecSong),
    ...arr(data.vecSongNew).flatMap((group) => arr(rec(group).songs))
  ];
  const seen = /* @__PURE__ */ new Set();
  return raw.map((item) => mapQQTrack(rec(item).track || item, {})).filter((track) => {
    const id = str(track.id);
    if (!id || !track.name || Number(track.qqId) === songId || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, 10);
}
async function handleQQRelatedPlaylists(songId, previousIds = []) {
  if (previousIds.length > 30 || previousIds.some((id) => parseQQRelatedId(id) === null)) {
    throw new Error("INVALID_QQ_PLAYLIST_IDS");
  }
  const data = await requestQQRelated("GetRelatedPlaylist", songId, { vecPlaylist: [...new Set(previousIds)] });
  const seen = new Set(previousIds.map(String));
  const playlists = [
    ...arr(data.vecPlaylist),
    ...arr(data.vecPlaylistNew).flatMap((group) => arr(rec(group).playlists))
  ].map((raw) => {
    const item = rec(raw);
    return {
      ...mapQQPlaylist({ ...item, song_cnt: item.songNum, listen_num: item.playCnt }, "related"),
      type: "playlist"
    };
  }).filter((playlist) => {
    if (parseQQRelatedId(playlist.id) === null || !playlist.name || seen.has(playlist.id)) return false;
    seen.add(playlist.id);
    return true;
  }).slice(0, 30);
  return { playlists, hasMore: Number(data.hasMore) === 1 && playlists.length > 0 };
}
async function handleQQSearchHotkeys() {
  const json = rec(await qqMusicRequest("", {
    comm: { ct: 24, cv: 0, format: "json", uin: "0" },
    hotkeys: {
      module: "music.musicsearch.HotkeyService",
      method: "GetHotkeyForQQMusicMobile",
      param: { search_id: `${Date.now()}${Math.floor(Math.random() * 1e6)}` }
    }
  }));
  const block = rec(json.hotkeys);
  const data = rec(block.data);
  if (!json.hotkeys || Number(json.code || 0) !== 0 || Number(block.code || 0) !== 0 || Number(data.ret_code || 0) !== 0) {
    throw new Error("QQ_SEARCH_HOTKEYS_FAILED");
  }
  const keywords = arr(data.vec_hotkey).map((raw) => {
    const item = rec(raw);
    return typeof item.query === "string" ? item.query.trim() : "";
  }).filter(Boolean);
  return [...new Set(keywords)].slice(0, 10);
}
async function handleQQSearch(cookie, keywords, limit) {
  const kw = String(keywords || "").trim();
  if (!kw) return [];
  const num = Math.max(1, Math.min(20, parseInt(String(limit || "20"), 10) || 20));
  console.log("[QQSearch]", kw, "limit:", num);
  const block = await requestQQSearch(cookie, kw, 0, num);
  const list = arr(rec(rec(rec(block.data).body).song).list);
  const mapped = list.map((raw) => mapQQTrack(raw, {})).filter((song) => song.name && song.mid);
  const seen = /* @__PURE__ */ new Set();
  return mapped.filter((song) => {
    const mid = str(song.mid);
    if (seen.has(mid)) return false;
    seen.add(mid);
    return true;
  });
}
async function handleQQSongUrl(cookie, mid, mediaMid, qualityPreference, feeHint) {
  const isFeeSong = feeHint === true || feeHint === "1" || Number(feeHint) === 1;
  const songmid = String(mid || "").trim();
  if (!songmid) return { provider: "qq", url: "", error: "MISSING_MID", message: "Missing QQ song mid" };
  const guid = deviceDigits("qq:guid", 8);
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const fileMediaMid = String(mediaMid || "").trim();
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(
    (mediaId) => qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES).map((item) => ({
      ...item,
      mediaId,
      filename: item.prefix + mediaId + item.ext
    }))
  );
  const filenames = fileCandidates.map((item) => item.filename);
  const param = {
    guid,
    songmid: filenames.length ? filenames.map(() => songmid) : [songmid],
    songtype: filenames.length ? filenames.map(() => 0) : [0],
    uin,
    loginflag: 1,
    platform: "20"
  };
  if (filenames.length) param.filename = filenames;
  const comm = {
    uin,
    format: "json",
    ct: musicKey ? 19 : 24,
    cv: 0
  };
  if (musicKey) comm.authst = musicKey;
  const json = rec(
    await qqMusicRequest(
      cookie,
      {
        comm,
        req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param }
      },
      { cookie: true }
    )
  );
  const data = rec(rec(json.req_0).data);
  const infos = arr(data.midurlinfo);
  const playableInfos = infos.map((item) => rec(item)).filter((item) => item.purl).sort((a, b) => {
    const aIndex = fileCandidates.findIndex((candidate) => candidate.filename === a.filename);
    const bIndex = fileCandidates.findIndex((candidate) => candidate.filename === b.filename);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });
  const info = playableInfos[0] || infos[0];
  const purl = info ? info.purl : void 0;
  if (info && purl) {
    const sips = arr(data.sip).map(str).filter(Boolean);
    if (sips.length === 0) sips.push("https://ws.stream.qqmusic.qq.com/");
    const fileMeta = fileCandidates.find((item) => item.filename === info.filename) || {};
    const seenUrls = /* @__PURE__ */ new Set();
    const candidates = playableInfos.flatMap((playable) => {
      const meta = fileCandidates.find((item) => item.filename === playable.filename) || {};
      return sips.flatMap((sip) => {
        const url = sip + str(playable.purl);
        if (!url || seenUrls.has(url)) return [];
        seenUrls.add(url);
        return [{
          url,
          trial: false,
          level: meta.level || str(playable.filename),
          quality: meta.label || str(playable.filename),
          filename: str(playable.filename)
        }];
      });
    });
    return {
      provider: "qq",
      url: sips[0] + purl,
      trial: false,
      playable: true,
      level: fileMeta.level || info.filename || "",
      quality: fileMeta.label || info.filename || "",
      filename: info.filename || "",
      candidates,
      requestedQuality
    };
  }
  const restriction = classifyQQPlaybackRestriction(
    info,
    {
      hasSession: !!(uin && musicKey),
      hasPlaybackKey: !!(uin && playbackKey)
    },
    isFeeSong
  );
  return {
    provider: "qq",
    url: "",
    playable: false,
    error: "QQ_URL_UNAVAILABLE",
    loggedIn: !!(uin && musicKey),
    playbackKeyReady: !!(uin && playbackKey),
    restriction,
    reason: restriction.category,
    message: restriction.message,
    qqCode: info && (info.result || info.code || info.errtype),
    rawMessage: info && (info.msg || info.tips || info.errmsg || ""),
    tried: fileCandidates.map((item) => item.label + " \xB7 " + item.filename),
    requestedQuality
  };
}
async function handleQQSongQualities(cookie, mid, mediaMid) {
  const songmid = String(mid || "").trim();
  if (!songmid) return { qualities: [] };
  const guid = deviceDigits("qq:guid", 8);
  const cookieObj = parseCookieString(cookie);
  const uin = qqCookieUin(cookieObj) || "0";
  const musicKey = qqCookieMusicKey(cookieObj);
  const fileMediaMid = String(mediaMid || "").trim();
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (!mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(
    (mediaId) => QQ_QUALITY_CANDIDATE_TEMPLATES.map((item) => ({ ...item, filename: item.prefix + mediaId + item.ext }))
  );
  const filenames = fileCandidates.map((item) => item.filename);
  const param = {
    guid,
    songmid: filenames.map(() => songmid),
    songtype: filenames.map(() => 0),
    uin,
    loginflag: 1,
    platform: "20",
    filename: filenames
  };
  const comm = {
    uin,
    format: "json",
    ct: musicKey ? 19 : 24,
    cv: 0
  };
  if (musicKey) comm.authst = musicKey;
  const json = rec(
    await qqMusicRequest(
      cookie,
      { comm, req_0: { module: "vkey.GetVkeyServer", method: "CgiGetVkey", param } },
      { cookie: true }
    )
  );
  const infos = arr(rec(rec(json.req_0).data).midurlinfo);
  const okFiles = new Set(
    infos.filter((item) => rec(item).purl).map((item) => str(rec(item).filename))
  );
  const seen = /* @__PURE__ */ new Set();
  const qualities = [];
  for (const c of fileCandidates) {
    if (!okFiles.has(c.filename) || seen.has(c.level)) continue;
    seen.add(c.level);
    qualities.push({ level: c.level, label: c.label });
  }
  return { qualities };
}
async function handleQQSongComments(cookie, id, mid, limit, offset) {
  let songId = normalizeQQSongId(id);
  if (!Number.isSafeInteger(songId) || songId <= 0) songId = 0;
  if (!songId && mid) {
    const detail = await qqSongDetail(cookie, mid, { mid });
    songId = normalizeQQSongId(detail.qqId || detail.id);
  }
  if (!Number.isSafeInteger(songId) || songId <= 0) throw new Error("MISSING_QQ_SONG_ID");
  const topid = String(songId);
  const pageSize = Math.max(1, limit || 20);
  const page = Math.max(0, Math.floor((offset || 0) / pageSize));
  const uin = qqCookieUin(parseCookieString(cookie)) || "0";
  const body = rec(
    await qqGetJSON(
      cookie,
      "https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg",
      {
        g_tk: "5381",
        loginUin: uin,
        hostUin: "0",
        format: "json",
        inCharset: "utf8",
        outCharset: "utf-8",
        notice: "0",
        platform: "yqq.json",
        needNewCode: "0",
        cid: "205360772",
        reqtype: "2",
        biztype: "1",
        topid,
        cmd: "8",
        needmusiccrit: "0",
        pagenum: String(page),
        pagesize: String(pageSize)
      },
      { headers: { Referer: "https://y.qq.com/n/ryqq/songDetail/" + encodeURIComponent(mid || topid) } }
    )
  );
  const hotList = rec(body.hot_comment).commentlist;
  const normalList = rec(body.comment).commentlist;
  if (body.code !== void 0 && Number(body.code) !== 0 || !Array.isArray(normalList)) {
    throw new Error("QQ_SONG_COMMENTS_FAILED");
  }
  const comments = normalList.map(mapQQComment).filter((c) => c.content);
  const hotComments = offset === 0 ? arr(hotList).map(mapQQComment).filter((c) => c.content) : [];
  const commentRec = rec(body.comment);
  const rawTotal = commentRec.commenttotal ?? commentRec.comment_total;
  const total = (typeof rawTotal === "number" || typeof rawTotal === "string") && rawTotal !== "" && Number.isSafeInteger(Number(rawTotal)) && Number(rawTotal) >= 0 ? Number(rawTotal) : null;
  const nextOffset = (page + 1) * pageSize;
  const hasMore = normalList.length > 0 && (total === null ? normalList.length >= pageSize : nextOffset < total);
  return {
    provider: "qq",
    id: topid,
    total,
    comments,
    hotComments,
    nextOffset: hasMore ? nextOffset : void 0,
    hot: hotComments.length > 0
  };
}
async function handleQQLyric(cookie, mid, id, wordTiming = false) {
  const songMID = String(mid || "").trim();
  let songID = normalizeQQSongId(id);
  if (!songMID && !songID) return { provider: "qq", error: "Missing QQ song mid or id", lyric: "" };
  let lyricText = "";
  let transText = "";
  let qrcText = "";
  let romaText = "";
  let source = "qq-musicu";
  let reached = false;
  try {
    const param = {};
    if (songMID) param.songMID = songMID;
    if (songID) param.songID = songID;
    const json = rec(
      await qqMusicRequest(
        cookie,
        {
          comm: { ct: 24, cv: 0 },
          lyric: {
            module: "music.musichallSong.PlayLyricInfo",
            method: "GetPlayLyricInfo",
            param
          }
        },
        { cookie: true }
      )
    );
    reached = true;
    const data = rec(rec(json.lyric).data);
    lyricText = decodeQQLyricText(data.lyric);
    transText = decodeQQLyricText(data.trans);
    qrcText = decodeQQLyricText(data.qrc);
    romaText = decodeQQLyricText(data.roma);
  } catch (e) {
    console.warn("[QQLyric] musicu failed:", e.message);
  }
  if (wordTiming && !songID && songMID) {
    try {
      songID = normalizeQQSongId((await qqSongDetail("", songMID, {})).qqId);
    } catch {
    }
  }
  if (wordTiming && !qrcText && songID) {
    try {
      const json = rec(await qqMusicRequest("", {
        comm: { ct: 11, cv: "1003006", v: "1003006", tmeAppID: "qqmusiclight", uid: "0" },
        lyric: {
          module: "music.musichallSong.PlayLyricInfo",
          method: "GetPlayLyricInfo",
          param: { songID, crypt: 1, ct: 19, cv: 2111, qrc: 1, qrc_t: 0, lrc_t: 0, trans: 1, trans_t: 0, roma: 1, roma_t: 0, type: 0 }
        }
      }));
      const block = rec(json.lyric);
      if (!Number(json.code) && !Number(block.code)) {
        reached = true;
        const data = rec(block.data);
        const main = decodeQQLyricText(data.lyric);
        if (/\[\d+,\d+\]/.test(main) && /\(\d+,\d+\)/.test(main)) qrcText = main;
        else if (/\[\d+:\d{2}/.test(main) && !lyricText) lyricText = main;
        const trans = decodeQQLyricText(data.trans);
        const roma = decodeQQLyricText(data.roma);
        if (/\[\d+(?:,|:)/.test(trans)) transText = trans;
        if (/\[\d+(?:,|:)/.test(roma)) romaText = roma;
      }
    } catch (e) {
      console.warn("[QQLyric] word timing unavailable:", e.message);
    }
  }
  if (!lyricText && songMID) {
    try {
      const body = rec(
        await qqGetJSON(
          cookie,
          "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg",
          {
            songmid: songMID,
            songtype: "0",
            format: "json",
            nobase64: "1",
            g_tk: "5381",
            loginUin: qqCookieUin(parseCookieString(cookie)) || "0",
            hostUin: "0",
            inCharset: "utf8",
            outCharset: "utf-8",
            notice: "0",
            platform: "yqq.json",
            needNewCode: "0"
          },
          { headers: { Referer: "https://y.qq.com/portal/player.html" } }
        )
      );
      reached = true;
      lyricText = decodeQQLyricText(body.lyric);
      transText = decodeQQLyricText(body.trans || body.tlyric) || transText;
      source = "qq-legacy";
    } catch (e) {
      console.warn("[QQLyric] legacy failed:", e.message);
    }
  }
  return {
    provider: "qq",
    id: songID || "",
    mid: songMID,
    lyric: lyricText,
    tlyric: transText,
    yrc: "",
    qrc: qrcText,
    roma: romaText,
    source: lyricText || qrcText ? source : "qq-empty",
    ...!reached && !lyricText && !qrcText ? { error: "QQ_LYRIC_UPSTREAM_FAILED" } : {}
  };
}
export {
  QQ_HEADERS,
  QQ_LIKED_PLAYLIST_ID,
  QQ_MUSICU_URL,
  QQ_QUALITY_CANDIDATE_TEMPLATES,
  QQ_TOPLIST_PREFIX,
  UA,
  computeSavedQQCookie,
  getQQLoginInfo,
  handleQQAlbumDetail,
  handleQQAlbumSongs,
  handleQQArtistAlbums,
  handleQQArtistDetail,
  handleQQArtistSearch,
  handleQQArtistSimilar,
  handleQQArtistSongs,
  handleQQLikedPlaylist,
  handleQQLyric,
  handleQQPlaylistPage,
  handleQQPlaylistTracks,
  handleQQRadarSong,
  handleQQRecommendFeed,
  handleQQRecommendSongs,
  handleQQRelatedPlaylists,
  handleQQSearch,
  handleQQSearchHotkeys,
  handleQQSimilarSongs,
  handleQQSongComments,
  handleQQSongQualities,
  handleQQSongUrl,
  handleQQToplistPreview,
  handleQQToplists,
  handleQQUserAlbums,
  handleQQUserPlaylists,
  isQQLikedPlaylistReference,
  isQQNumericPlaylistId,
  isQQToplistReference,
  mapQQTrack,
  normalizeCookieHeader,
  normalizeQQCookieInput,
  normalizeQQUin,
  parseCookieString,
  parseJSONText,
  parseQQRelatedId,
  pickQQImageUrl,
  pickQQPlaylistCover,
  qqAuthComm,
  qqAuthErrorStatus,
  qqCookieMusicKey,
  qqCookiePlaybackKey,
  qqCookieUin,
  qqGetJSON,
  qqMusicRequest,
  qqPlaylistReference,
  rawCookieFallback,
  requestText
};
