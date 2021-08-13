import SoundCloud from "soundcloud.ts";
import { ExtractorPlugin, Playlist, Song } from "distube";
import type { GuildMember } from "discord.js";
import type { OtherSongInfo, PlaylistInfo } from "distube";
import type { SoundcloudPlaylistV2, SoundcloudTrackV2 } from "soundcloud.ts";
const sc = new SoundCloud();

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
   * @param {'track'|'playlist'} type type
   * @param {number} limit limit
   * @returns {Array<Song|Playlist>}
   */
  static async search(query: string, type = "track", limit = 10) {
    if (typeof query !== "string") throw new TypeError("query must be a string");
    if (!["track", "playlist"].includes(type)) throw new TypeError("type must be 'track' or 'playlist'");
    if (typeof limit !== "number" || limit < 1 || Math.floor(limit) !== limit) {
      throw new TypeError("limit must be a natural number");
    }
    if (type === "track") {
      // TODO: Remove any after `soundcloud.ts` fixed the types problem
      const data = await sc.tracks.searchV2({ q: query, limit } as any);
      if (!data?.collection?.length) throw new Error("Cannot find any result!");
      return data.collection.map(t => new Song(new SoundCloudTrack(t)));
    }
    // TODO: Remove any after `soundcloud.ts` fixed the types problem
    const data = await sc.playlists.searchV2({ q: query, limit } as any);
    const playlists = data.collection;
    return Promise.all(
      playlists.map(async p => {
        const playlist = new SoundCloudPlaylist(p);
        if (!playlist.tracks?.length) return;
        playlist.songs = (await resolveTracks(playlist.tracks)).map(s => new Song(new SoundCloudTrack(s)));
        // eslint-disable-next-line consistent-return
        return new Playlist(playlist);
      }),
    );
  }
  /**
   * Search for tracks/playlists on SoundCloud
   * @param {string} query String query
   * @param {'track'|'playlist'} type type
   * @param {number} limit limit
   * @returns {Array<Song|Playlist>}
   */
  search(query: string, type = "track", limit = 10) {
    return SoundCloudPlugin.search(query, type, limit);
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async validate(url: string) {
    return /^https?:\/\/(?:(?:www|m)\.)?soundcloud\.com\/(.*)$/.test(url);
  }
  /**
   * Execute if the url is validated
   * @param {string} url URL
   * @param {*} member Requested user
   * @returns {Promise<Song|Song[]|Playlist>}
   */
  async resolve(url: string, member: GuildMember): Promise<Song | Playlist> {
    url = url.replace(/:\/\/(m|www)\./g, "://");
    const data = await sc.resolve.getV2(url, true).catch(() => undefined);
    if (!data || !["track", "playlist"].includes(data.kind)) {
      throw Error("[SoundCloudPlugin] This link is not supported. It must be a public track or playlist link.");
    }
    if (data.kind === "playlist") {
      const playlist = new SoundCloudPlaylist(data);
      if (!playlist.tracks?.length) throw Error("[SoundCloudPlugin] The playlist is empty!");
      playlist.songs = (await resolveTracks(playlist.tracks)).map(
        s => new Song(new SoundCloudTrack(s), member, "soundcloud"),
      );
      return new Playlist(playlist, member);
    } else {
      return new Song(new SoundCloudTrack(data), member);
    }
  }

  async getRelatedSongs(url: string | number) {
    const related = await sc.tracks.relatedV2(url, 10);
    return related.filter(t => t.title).map(t => new Song(new SoundCloudTrack(t)));
  }

  getStreamURL(url: string) {
    return sc.util.streamLink(url);
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
