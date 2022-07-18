import SoundCloud from "soundcloud.ts";
import { DisTubeError, ExtractorPlugin, Playlist, Song } from "distube";
import type { GuildMember } from "discord.js";
import type { OtherSongInfo, PlaylistInfo } from "distube";
import type { SoundcloudPlaylistV2, SoundcloudTrackV2 } from "soundcloud.ts";
const sc = new SoundCloud();

type Falsy = undefined | null | false | 0 | "";
const isTruthy = <T>(x: T | Falsy): x is T => Boolean(x);
type ElementOf<A> = A extends readonly (infer T)[] ? T : never;
const SEARCH_SUPPORT = ["track", "playlist"] as const;

const chunker = (arr: any[], size: number) => {
  const chunks = [];
  let i = 0;
  while (i < arr.length) chunks.push(arr.slice(i, (i += size)));
  return chunks;
};

const resolveTracks = async (tracks: SoundcloudTrackV2[]): Promise<SoundcloudTrackV2[]> => {
  const unsolved = tracks.splice(tracks.findIndex(t => !t.title));
  const chunks = chunker(unsolved, 50);
  const promises = chunks.map(ts => sc.api.getV2("/tracks", { ids: ts.map(t => t.id).join(",") }));
  const solvedTracks = await Promise.all(promises);
  return tracks.concat(solvedTracks.flat());
};

export class SoundCloudPlugin extends ExtractorPlugin {
  /**
   * Search for tracks/playlists on SoundCloud
   * @param {string} query String query
   * @param {'track'|'playlist'} [type='track'] type
   * @param {number} [limit=10] limit
   * @returns {Array<Song>|Array<Playlist>}
   */
  static async search(query: string, type: ElementOf<typeof SEARCH_SUPPORT> = "track", limit = 10) {
    if (typeof query !== "string") throw new DisTubeError("INVALID_TYPE", "string", query, "query");
    if (!SEARCH_SUPPORT.includes(type)) throw new DisTubeError("INVALID_TYPE", SEARCH_SUPPORT, type, "type");
    if (typeof limit !== "number" || limit < 1 || !Number.isInteger(limit)) {
      throw new DisTubeError("INVALID_TYPE", "natural number", limit, "limit");
    }
    if (type === "track") {
      const data = await sc.tracks.searchV2({ q: query, limit });
      if (!data?.collection?.length) {
        throw new DisTubeError("SOUNDCLOUD_PLUGIN_NO_RESULT", `Cannot find any "${query}" ${type} on SoundCloud!`);
      }
      return data.collection.map(t => new Song(new SoundCloudTrack(t)));
    }
    const data = await sc.playlists.searchV2({ q: query, limit });
    const playlists = data.collection;
    return (
      await Promise.all(
        playlists.map(async p => {
          const playlist = new SoundCloudPlaylist(p);
          if (!playlist.tracks?.length) return;
          playlist.songs = (await resolveTracks(playlist.tracks)).map(s => new Song(new SoundCloudTrack(s)));
          // eslint-disable-next-line consistent-return
          return new Playlist(playlist);
        }),
      )
    ).filter(isTruthy);
  }

  /**
   * Search for tracks/playlists on SoundCloud
   * @param {string} query String query
   * @param {'track'|'playlist'} [type='track'] type
   * @param {number} [limit=10] limit
   * @returns {Array<Song>|Array<Playlist>}
   */
  search(query: string, type: ElementOf<typeof SEARCH_SUPPORT> = "track", limit = 10) {
    return SoundCloudPlugin.search(query, type, limit);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async validate(url: string) {
    return /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(.*)$/.test(url);
  }

  async resolve(url: string, options: { member?: GuildMember; metadata?: any }) {
    const opt = { ...options, source: "soundcloud" };
    url = url.replace(/:\/\/(m|www)\./g, "://");
    const data = await sc.resolve.getV2(url, true).catch(() => undefined);
    if (!data || !["track", "playlist"].includes(data.kind)) {
      throw new DisTubeError("SOUNDCLOUD_PLUGIN_NOT_SUPPORTED", "Only public links are supported.");
    }
    if (data.kind === "playlist") {
      const playlist = new SoundCloudPlaylist(data);
      if (!playlist.tracks?.length) throw new DisTubeError("SOUNDCLOUD_PLUGIN_EMPTY_PLAYLIST", "Playlist is empty.");
      playlist.songs = (await resolveTracks(playlist.tracks)).map(s => new Song(new SoundCloudTrack(s), opt));
      return new Playlist(playlist, opt);
    } else {
      return new Song(new SoundCloudTrack(data), opt);
    }
  }

  override async getRelatedSongs(url: string | number) {
    const related = await sc.tracks.relatedV2(url, 10);
    return related.filter(t => t.title).map(t => new Song(new SoundCloudTrack(t)));
  }

  override async getStreamURL(url: string) {
    const stream = await sc.util.streamLink(url);
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
  songs!: Song[];
  id: number;
  name: string;
  url: string;
  thumbnail?: string;
  tracks: SoundcloudTrackV2[];
  constructor(info: SoundcloudPlaylistV2) {
    this.source = "soundcloud";
    this.id = info.id;
    this.name = info.title;
    this.url = info.permalink_url;
    this.thumbnail = info.artwork_url ?? undefined;
    this.tracks = info.tracks;
  }
}

export default SoundCloudPlugin;
