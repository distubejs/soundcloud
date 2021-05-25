export = SoundCloudPlugin;
declare class SoundCloudPlugin extends ExtractorPlugin {
    /**
     * Search for tracks/playlists on SoundCloud
     * @param {string} query
     * @param {'track'|'playlist'} type
     * @param {number} limit
     * @returns
     */
    static search(query: string, type?: 'track' | 'playlist', limit?: number): Promise<Song[] | Playlist[]>;
    /**
     * Search for tracks/playlists on SoundCloud
     * @param {string} query
     * @param {'track'|'playlist'} type
     * @param {number} limit
     * @returns
     */
    search(query: string, type?: 'track' | 'playlist', limit?: number): Promise<Song[] | Playlist[]>;
}
import { ExtractorPlugin } from "distube";
import { Song } from "distube";
import { Playlist } from "distube";
