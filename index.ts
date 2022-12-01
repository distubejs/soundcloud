import SoundCloud from "soundcloud.ts";
import { DisTubeError, ExtractorPlugin, Playlist, Song, checkInvalidKey } from "distube";
import type { GuildMember } from "discord.js";
import type { OtherSongInfo, PlaylistInfo } from "distube";
import type { SoundcloudPlaylistV2, SoundcloudTrackV2 } from "soundcloud.ts";
const SC = new SoundCloud();

type Falsy = undefined | null | false | 0 | "";
const isTruthy = <T>(x: T | Falsy): x is T => Boolean(x);
export enum SearchType {
  Track = "track",
  Playlist = "playlist",
}

export interface SoundCloudPluginOptions {
  clientId?: string;
  oauthToken?: string;
}

export class SoundCloudPlugin extends ExtractorPlugin {
  #sc: SoundCloud;
  constructor(options: SoundCloudPluginOptions = {}) {
    super();
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new DisTubeError("INVALID_TYPE", ["object", "undefined"], options, "SoundCloudPluginOptions");
    }
    checkInvalidKey(options, ["clientId", "oauthToken"], "SoundCloudPluginOptions");
    if (options.clientId && typeof options.clientId !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", options.clientId, "clientId");
    }
    if (options.oauthToken && typeof options.oauthToken !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", options.oauthToken, "oauthToken");
    }
    this.#sc = new SoundCloud(options?.clientId, options?.oauthToken);
  }
  static search(query: string, type?: SearchType.Track, limit?: number): Promise<Song<undefined>[]>;
  static search(query: string, type: SearchType.Playlist, limit?: number): Promise<Playlist<undefined>[]>;
  static search(query: string, type?: SearchType, limit?: number): Promise<Song<undefined>[] | Playlist<undefined>[]>;
  static async search(query: string, type: SearchType = SearchType.Track, limit = 10) {
    if (typeof query !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", query, "query");
    }
    if (!Object.values(SearchType).includes(type)) {
      throw new DisTubeError("INVALID_TYPE", Object.values(SearchType), type, "type");
    }
    if (typeof limit !== "number" || limit < 1 || !Number.isInteger(limit)) {
      throw new DisTubeError("INVALID_TYPE", "natural number", limit, "limit");
    }

    switch (type) {
      case SearchType.Track: {
        const data = await SC.tracks.searchV2({ q: query, limit });
        if (!data?.collection?.length) {
          throw new DisTubeError("SOUNDCLOUD_PLUGIN_NO_RESULT", `Cannot find any "${query}" ${type} on SoundCloud!`);
        }
        return data.collection.map(t => new Song(new SoundCloudTrack(t)));
      }
      case SearchType.Playlist: {
        const data = await SC.playlists.searchV2({ q: query, limit });
        const playlists = data.collection;
        return (
          await Promise.all(playlists.map(async p => new Playlist(new SoundCloudPlaylist(await SC.playlists.fetch(p)))))
        ).filter(isTruthy);
      }
      default:
        throw new DisTubeError("SOUNDCLOUD_PLUGIN_UNSUPPORTED_TYPE", `${type} search is not supported!`);
    }
  }

  search(query: string, type?: SearchType.Track, limit?: number): Promise<Song<undefined>[]>;
  search(query: string, type: SearchType.Playlist, limit?: number): Promise<Playlist<undefined>[]>;
  search(query: string, type?: SearchType, limit?: number): Promise<Song<undefined>[] | Playlist<undefined>[]>;
  search(query: string, type: SearchType = SearchType.Track, limit = 10) {
    return SoundCloudPlugin.search(query, type, limit);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async validate(url: string) {
    return /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(.*)$/.test(url);
  }

  async resolve(url: string, options: { member?: GuildMember; metadata?: any }) {
    const opt = { ...options, source: "soundcloud" };
    url = url.replace(/:\/\/(m|www)\./g, "://");
    const data = await this.#sc.resolve.getV2(url, true).catch(() => undefined);
    if (!data || !["track", "playlist"].includes(data.kind)) {
      throw new DisTubeError("SOUNDCLOUD_PLUGIN_NOT_SUPPORTED", "Only public links are supported.");
    }

    return data.kind === "playlist"
      ? new Playlist(new SoundCloudPlaylist(await this.#sc.playlists.fetch(data)), opt)
      : new Song(new SoundCloudTrack(data), opt);
  }

  override async getRelatedSongs(url: string | number) {
    const related = await this.#sc.tracks.relatedV2(url, 10);
    return related.filter(t => t.title).map(t => new Song(new SoundCloudTrack(t)));
  }

  override async getStreamURL(url: string) {
    const stream = await this.#sc.util.streamLink(url);
    if (!stream) {
      throw new DisTubeError(
        "SOUNDCLOUD_PLUGIN_RATE_LIMITED",
        "Reached SoundCloud rate limits\nSee more: https://developers.soundcloud.com/docs/api/rate-limits#play-requests",
      );
    }
    return stream;
  }
}

class SoundCloudTrack implements OtherSongInfo {
  src: "soundcloud";
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  duration: number;
  views: number;
  reposts: number;
  uploader: string;
  uploader_url: string;
  constructor(info: SoundcloudTrackV2) {
    this.src = "soundcloud";
    this.id = info.id.toString();
    this.name = info.title;
    this.url = info.permalink_url;
    this.thumbnail = info.artwork_url;
    this.duration = info.duration / 1000;
    this.views = info.playback_count;
    this.reposts = info.reposts_count;
    this.uploader = info.user?.username;
    this.uploader_url = info.user?.permalink_url;
  }
}

class SoundCloudPlaylist implements PlaylistInfo {
  source: "soundcloud";
  songs: Song[];
  id: number;
  name: string;
  url: string;
  thumbnail?: string;
  constructor(info: SoundcloudPlaylistV2) {
    this.source = "soundcloud";
    this.id = info.id;
    this.name = info.title;
    this.url = info.permalink_url;
    this.thumbnail = info.artwork_url ?? undefined;
    if (!info.tracks?.length) throw new DisTubeError("SOUNDCLOUD_PLUGIN_EMPTY_PLAYLIST", "Playlist is empty.");
    this.songs = info.tracks.map(s => new Song(new SoundCloudTrack(s)));
  }
}

export default SoundCloudPlugin;
