const { ExtractorPlugin, Song, Playlist } = require("distube");
const SoundCloud = require("soundcloud.ts").default;
const sc = new SoundCloud();

const chunker = (arr, size) => {
  const chunks = [];
  let i = 0;
  while (i < arr.length) chunks.push(arr.slice(i, i += size));
  return chunks;
};

const resolveTracks = async tracks => {
  const unsolved = tracks.splice(tracks.findIndex(t => !t.title));
  const chunks = chunker(unsolved, 50);
  const promises = chunks.map(ts => sc.api.getV2("/tracks", { ids: ts.map(t => t.id).join(",") }));
  const solvedTracks = await Promise.all(promises);
  return tracks.concat(solvedTracks.flat());
};

class SoundCloudPlugin extends ExtractorPlugin {
  /**
   * Search for tracks/playlists on SoundCloud
   * @param {string} query String query
   * @param {'track'|'playlist'} type type
   * @param {number} limit limit
   * @returns {Array<Song|Playlist>}
   */
  static async search(query, type = "track", limit = 10) {
    if (typeof query !== "string") throw new TypeError("query must be a string");
    if (!["track", "playlist"].includes(type)) throw new TypeError("type must be 'track' or 'playlist'");
    if (typeof limit !== "number" || limit < 1 || Math.floor(limit) !== limit || limit == Infinity) throw new TypeError("limit must be a natural number");
    if (type === "track") {
      const data = await sc.tracks.searchV2({ q: query, limit });
      if (!data?.collection?.length) throw new Error("Cannot find any result!");
      return data.collection.map(t => new Song(new SoundCloudTrack(t), null, "soundcloud"));
    }
    const data = await sc.playlists.searchV2({ q: query, limit });
    const playlists = data.collection;
    return Promise.all(playlists.map(async p => {
      const playlist = new SoundCloudPlaylist(p);
      if (!playlist.songs?.length) return;
      playlist.songs = (await resolveTracks(playlist.songs)).map(s => new Song(new SoundCloudTrack(s), null, "soundcloud"));
      // eslint-disable-next-line consistent-return
      return new Playlist(playlist, null, { source: "soundcloud" });
    }));
  }
  /**
   * Search for tracks/playlists on SoundCloud
   * @param {string} query String query
   * @param {'track'|'playlist'} type type
   * @param {number} limit limit
   * @returns {Array<Song|Playlist>}
   */
  search(query, type = "track", limit = 10) {
    return SoundCloudPlugin.search(query, type, limit);
  }
  validate(url) {
    return /^https?:\/\/(?:(?:www|m)\.)?(soundcloud\.com|snd\.sc)\/(.*)$/.test(url);
  }
  /**
   * Execute if the url is validated
   * @param {string} url URL
   * @param {*} member Requested user
   * @returns {Promise<Song|Song[]|Playlist>}
   */
  async resolve(url, member) {
    const data = await sc.resolve.getV2(url, true).catch(() => undefined);
    if (!data || !["track", "playlist"].includes(data.kind)) {
      throw Error("[SoundCloudPlugin] This link is not supported. It must be a public track or playlist link.");
    }
    if (data.kind === "playlist") {
      const playlist = new SoundCloudPlaylist(data);
      if (!playlist.songs?.length) throw Error("[SoundCloudPlugin] The playlist is empty!");
      playlist.songs = (await resolveTracks(playlist.songs)).map(s => new Song(new SoundCloudTrack(s), member, "soundcloud"));
      return new Playlist(playlist, member, { source: "soundcloud" });
    } else {
      return new Song(new SoundCloudTrack(data), member, "soundcloud");
    }
  }

  async getRelatedSongs(url) {
    const related = await sc.tracks.relatedV2(url, 10);
    return related.filter(t => t.title)
      .map(t => new Song(new SoundCloudTrack(t), null, "soundcloud"));
  }

  getStreamURL(url) {
    return sc.util.streamLink(url);
  }
}

module.exports = SoundCloudPlugin;

class SoundCloudTrack {
  constructor(info) {
    this.id = info.id;
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

class SoundCloudPlaylist {
  constructor(info) {
    this.id = info.id;
    this.name = info.title;
    this.url = info.permalink_url;
    this.thumbnail = info.artwork_url;
    this.songs = info.tracks;
  }
}
