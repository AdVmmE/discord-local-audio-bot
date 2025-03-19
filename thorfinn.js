require('dotenv').config(); // Load environment variables from .env file

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const readline = require('readline'); // For terminal input
const gTTS = require('gtts'); // For text-to-speech
const axios = require('axios'); // For HTTP streaming

const ffmpegPath = require('ffmpeg-static');
createAudioResource.ffmpeg = ffmpegPath;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const prefix = '!';
let connection = null;
let player = null;
let currentStream = null; // To store the current stream URL for looping
let isLooping = true;

// Set up terminal input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Simulated message object for terminal commands
const createTerminalMessage = (content) => ({
  content,
  author: { bot: false, send: console.log },
  reply: console.log,
  member: { voice: { channel: null } },
  guild: client.guilds.cache.first(),
});

const playAudio = async (source, message, isUrl = false) => {
  try {
    console.log('Creating audio player...');
    player = createAudioPlayer();

    let resource;
    if (isUrl) {
      // Stream from a URL using axios
      console.log('Streaming audio from URL:', source);
      const response = await axios({
        method: 'get',
        url: source,
        responseType: 'stream',
      });
      resource = createAudioResource(response.data, {
        inlineVolume: true, // Enable volume control (optional)
      });
    } else {
      // If source is a local file path
      if (!fs.existsSync(source)) {
        console.error(`File not found: ${source}`);
        if (message) message.reply(`File not found: ${path.basename(source)}`);
        return;
      }
      console.log('Creating audio resource from:', source);
      resource = createAudioResource(source);
    }
    console.log('Audio resource created:', resource.playbackDuration);

    console.log('Playing resource...');
    player.play(resource);

    console.log('Subscribing player to connection...');
    const subscription = connection.subscribe(player);
    if (subscription) {
      console.log('Subscription successful');
    } else {
      console.log('Subscription failed');
      return;
    }

    player.on('stateChange', (oldState, newState) => {
      console.log(`Player state: ${oldState.status} -> ${newState.status}`);
    });

    player.on(AudioPlayerStatus.Playing, () => {
      console.log('Audio is playing!');
      if (message) {
        if (isUrl) {
          message.reply(`Now streaming from URL: ${source}`);
        } else {
          message.reply(`Now playing: ${path.basename(source)}`);
        }
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('Audio finished playing');
      if (isLooping && currentStream) {
        console.log('Looping audio...');
        playAudio(currentStream, null, true); // Loop the stream
      }
    });

    player.on('error', (error) => {
      console.error('Player error:', error);
      if (message) message.reply('An error occurred while playing the audio.');
    });

  } catch (error) {
    console.error('Playback error:', error);
    if (message) message.reply('Failed to start playback.');
  }
};

client.once('ready', () => {
  console.log(`
 █████╗ ██████╗ ██╗   ██╗██╗  ██╗███╗   ███╗
██╔══██╗██╔══██╗██║   ██║╚██╗██╔╝████╗ ████║
███████║██║  ██║██║   ██║ ╚███╔╝ ██╔████╔██║
██╔══██║██║  ██║╚██╗ ██╔╝ ██╔██╗ ██║╚██╔╝██║
██║  ██║██████╔╝ ╚████╔╝ ██╔╝ ██╗██║ ╚═╝ ██║
╚═╝  ╚═╝╚═════╝   ╚═══╝  ╚═╝  ╚═╝╚═╝     ╚═╝
                                            
Bot is s online!
U can now type commands in the terminal (e.g., !dm <user_id> <message>, !play <filename>)
  `);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  await handleCommand(command, args, message);
});

// Handle commands
const handleCommand = async (command, args, message) => {
  if (command === 'dm') {
    const userId = args[0];
    const dmMessage = args.slice(1).join(' ');

    if (!userId) return message.reply('Please provide a user ID to DM!');
    if (!dmMessage) return message.reply('Please provide a message to send!');

    try {
      const user = await client.users.fetch(userId);
      await user.send(dmMessage);
      message.reply('Message sent successfully!');
    } catch (error) {
      console.error('DM Error:', error);
      message.reply("I couldn't send the DM! Check the user ID or their DM settings.");
    }
  }

  if (command === 'chat') {
    const chatMessage = args.join(' ');

    if (!chatMessage) return message.author.send('Please enter a message to chat!').catch(() => message.reply("I couldn't DM you!"));
    message.author.send(chatMessage)
      .catch(() => message.reply("I couldn't DM you! Please check your settings."));
  }

  if (command === 'join') {
    let channelId;

    if (args.length > 0) {
      channelId = args[0];
    } else if (message.member.voice.channel) {
      channelId = message.member.voice.channel.id;
    } else {
      return message.reply('Please provide a channel ID (e.g., !join 994814288441126912) or join a voice channel in Discord first!');
    }

    if (connection) {
      return message.reply('I’m already in a voice channel!');
    }

    try {
      console.log('Joining voice channel...');
      const guild = client.guilds.cache.first();
      if (!guild) {
        return message.reply('Bot is not in any guild! Please provide a guild ID or invite the bot to a server.');
      }

      connection = joinVoiceChannel({
        channelId: channelId,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
      });

      await new Promise((resolve, reject) => {
        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log('Connection is ready!');
          message.reply(`Joined voice channel with ID: ${channelId}!`);
          resolve();
        });
        connection.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Join error:', error);
      message.reply('Failed to join the voice channel. Check the channel ID or bot permissions.');
      if (connection) {
        connection.destroy();
        connection = null;
      }
    }
  }

  if (command === 'play') {
    if (!args.length) return message.reply('Please provide a filename! (e.g., !play song.mp3)');
    const filename = args[0];

    const filePath = path.join(process.env.AUDIO_DIRECTORY, filename);
    if (!fs.existsSync(filePath)) {
      return message.reply(`File "${filename}" not found in the audio directory!`);
    }

    try {
      if (!connection) {
        return message.reply('Please use !join first or join a voice channel in Discord!');
      }

      if (player) {
        player.stop();
      }

      currentFilePath = filePath;
      await playAudio(filePath, message);

    } catch (error) {
      console.error('Setup error:', error);
      message.reply('Failed to start playback.');
      if (connection) {
        connection.destroy();
        connection = null;
      }
    }
  }

  if (command === 'stop') {
    if (!connection) return message.reply('I’m not in a voice channel!');
    if (player) {
      player.stop();
      isLooping = false;
    }
    connection.destroy();
    connection = null;
    currentFilePath = null;
    currentStream = null;
    message.reply('Stopped the audio and left the channel.');
  }

  if (command === 'list') {
    const files = fs.readdirSync(process.env.AUDIO_DIRECTORY)
      .filter(file => file.endsWith('.mp3') || file.endsWith('.wav'));
    if (files.length === 0) {
      return message.reply('No audio files found in the directory!');
    }
    message.reply(`Available audio files:\n${files.join('\n')}`);
  }
};

// Terminal command listener
rl.on('line', async (input) => {
  if (!input.startsWith(prefix)) return;

  const args = input.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const simulatedMessage = createTerminalMessage(input);

  if (command === 'speak') {
    const textToSpeak = args.join(' ');
    if (!textToSpeak) {
      console.log('Please provide something to say! (e.g., !speak Hello everyone)');
      return;
    }

    if (!connection) {
      console.log('Please use !join first or join a voice channel in Discord!');
      return;
    }

    try {
      // Generate a unique temporary file path for the TTS audio
      const tempFilePath = path.join(process.env.AUDIO_DIRECTORY, `tts_${Date.now()}.mp3`);

      // Convert text to speech using gTTS
      await new Promise((resolve, reject) => {
        const tts = new gTTS(textToSpeak, 'ar'); // Arabic voice
        tts.save(tempFilePath, (err) => {
          if (err) {
            console.error('TTS generation error:', err);
            reject(err);
          } else {
            console.log(`TTS audio saved to ${tempFilePath}`);
            resolve();
          }
        });
      });

      // Temporarily disable looping for TTS audio
      const originalIsLooping = isLooping;
      isLooping = false;

      // Play the generated audio
      currentFilePath = tempFilePath;
      await playAudio(tempFilePath, simulatedMessage);

      // Clean up
      player.on(AudioPlayerStatus.Idle, () => {
        console.log('Cleaning up temporary TTS file...');
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`Deleted ${tempFilePath}`);
        }
        // Restore the original looping state
        isLooping = originalIsLooping;
      });

    } catch (error) {
      console.error('Speak command error:', error);
      console.log('Failed to generate or play the speech.');
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath); // Clean up in case of error
      }
    }
  } else if (command === 'music') {
    const musicUrl = args.join(' '); // Join args to handle spaces in URLs
    if (!musicUrl) {
      console.log('Please provide a direct MP3 URL! (e.g., !music https://www.kozco.com/tech/piano2.mp3)');
      return;
    }

    if (!musicUrl.startsWith('http://') && !musicUrl.startsWith('https://')) {
      console.log('Please provide a valid URL starting with http:// or https://');
      return;
    }

    if (!connection) {
      console.log('Please use !join first or join a voice channel in Discord!');
      return;
    }

    try {
      // Stop any currently playing audio
      if (player) {
        player.stop();
      }

      // Play the stream
      currentStream = musicUrl;
      await playAudio(musicUrl, simulatedMessage, true);

    } catch (error) {
      console.error('Music command error:', error);
      console.log('Failed to stream the music. Make sure the URL is a direct link to an MP3 file and is accessible.');
    }
  } else {
    // Handle other terminal commands (e.g., !dm, !join, etc.)
    await handleCommand(command, args, simulatedMessage);
  }
});

const audioDirectory = process.env.AUDIO_DIRECTORY;
client.login(process.env.DISCORD_TOKEN);
