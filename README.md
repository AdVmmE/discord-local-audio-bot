# Discord Audio Bot

A simple Discord bot that joins a voice channel and plays audio files. It supports playing, stopping, and listing available audio files.

## Features
- Joins a voice channel
- Plays audio files from a specified directory
- Supports looping playback
- Stops and leaves the channel on command
- Lists available audio files

## Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/AdVmmE/discord-local-audio-bot.git
   cd discord-local-audio-bot
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Create a `.env` file in the root directory and add your bot token and audio directory path:
   ```ini
   DISCORD_TOKEN=your_bot_token_here
   AUDIO_DIRECTORY=C:/Users/yourusername/Desktop/audio
   ```

4. Ensure `.env` is added to `.gitignore` to keep your credentials safe:
   ```
   .env
   ```

## Usage

1. Start the bot:
   ```sh
   node index.js
   ```

2. Commands:
   - `!join` - Bot joins your voice channel.
   - `!play <filename>` - Plays the specified audio file.
   - `!stop` - Stops the audio and makes the bot leave the channel.
   - `!list` - Lists available audio files in the directory.

## Dependencies
- `discord.js`
- `@discordjs/voice`
- `ffmpeg-static`
- `dotenv`

## License
This project is licensed under the MIT License.

