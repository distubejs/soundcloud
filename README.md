# @distube/soundcloud
 SoundCloud extractor plugin for [DisTube.js.org](https://distube.js.org).
 Required DisTube version >= 3.0.0.

# Feature
 - Using SoundCloud API
 - Support tracks, playlist
 - Search tracks/playlists
 - Faster than `youtube-dl` extractor

# Installation
```sh
npm install @distube/soundcloud
```

# Usage
```js
const Discord = require('discord.js')
const DisTube = require('distube')
const SoundCloudPlugin = require("@distube/soundcloud")
const client = new Discord.Client()
const distube = new DisTube(client, {
    searchSongs: 10,
    emitNewSongOnly: true,
    plugins: [new SoundCloudPlugin()]
})

// Now distube.play can play spotify url.

client.on('message', message => {
	if (message.author.bot) return
	if (!message.content.startsWith(config.prefix)) return
	const args = message.content.slice(config.prefix.length).trim().split(/ +/g)
	const command = args.shift()
	if (command === 'play') distube.play(message, args.join(' '))
})
```

# Documentation

### new SoundCloudPlugin()

Create a DisTube's `ExtractorPlugin`

### SoundCloudPlugin.search(query, [type], [limit]) *(Both `static` and `class` method)*

Searches for the given query on SoundCloud.

* Parameters
	- `query` [string] Search query.
	- `type` [string]: Type of results (`track` or `playlist`). Default is `track`.
	- `limit` [integer]: Limit the results. Default is `10`.

* Returns a `Promise<Song[]|Playlist[]>`
	- Returns a `Promise<Song[]>` if `type` parameter is `track`
	- Returns a `Promise<Playlist[]>` if `type` parameter is `playlist`
