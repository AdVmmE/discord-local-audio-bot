require('dotenv').config(); // Load environment variables from .env file

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');

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
let currentFilePath = null;
let isLooping = true;

client.once('ready', () => {
  console.log('Bot is online!');
});

const playAudio = async (filePath, message) => {
  try {
    console.log('Creating audio player...');
    player = createAudioPlayer();

    console.log('Creating audio resource from:', filePath);
    const resource = createAudioResource(filePath);
    console.log('Audio resource created:', resource.playbackDuration);

    console.log('Playing resource...');
    player.play(resource);

    console.log('Subscribing player to connection...');
    const subscription = connection.subscribe(player);
    if (subscription) {
      console.log('Subscription successful');
    } else {
      console.log('Subscription failed');
    }

    player.on('stateChange', (oldState, newState) => {
      console.log(`Player state: ${oldState.status} -> ${newState.status}`);
    });

    player.on(AudioPlayerStatus.Playing, () => {
      console.log('Audio is playing!');
      if (message) message.reply(`Now playing: ${path.basename(filePath)}`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('Audio finished playing');
      if (isLooping && currentFilePath) {
        console.log('Looping audio...');
        playAudio(currentFilePath); // Loop the same file
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

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'dm') {
    const user = message.mentions.users.first();
    const dmMessage = args.slice(1).join(' ');

    if (!user) return message.reply('Please mention a user to DM!');
    if (!dmMessage) return message.reply('Please provide a message to send!');

    try {
      await user.send(`📩 **Message from ${message.author.username}:** ${dmMessage}`);
      message.reply('✅ Message sent successfully!');
    } catch (error) {
      console.error('DM Error:', error);
      message.reply("❌ I couldn't send the DM! The user may have DMs disabled.");
    }
  }

  if (command === 'chat') {
    const chatMessage = args.join(' ');

    if (!chatMessage) return message.author.send('💬 Please enter a message to chat!').catch(() => message.reply("I couldn't DM you!"));
    message.author.send(`🤖 **Bot Reply:** I received your message: "${chatMessage}"`)
      .catch(() => message.reply("I couldn't DM you! Please check your settings."));
  }

  if (command === 'join') {
    if (!message.member.voice.channel) {
      return message.reply('You need to join a voice channel first!');
    }

    if (connection) {
      return message.reply('I’m already in a voice channel!');
    }

    try {
      console.log('Joining voice channel...');
      connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      await new Promise((resolve, reject) => {
        connection.on(VoiceConnectionStatus.Ready, () => {
          console.log('Connection is ready!');
          message.reply('Joined the voice channel!');
          resolve();
        });
        connection.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });
      });

    } catch (error) {
      console.error('Join error:', error);
      message.reply('Failed to join the voice channel.');
      if (connection) {
        connection.destroy();
        connection = null;
      }
    }
  }

  if (command === 'play') {
    if (!args.length) return message.reply('Please provide a filename! (e.g., !play song.mp3)');
    const filename = args[0];

    if (!message.member.voice.channel) {
      return message.reply('You need to join a voice channel first!');
    }

    const filePath = path.join(process.env.AUDIO_DIRECTORY, filename);
    if (!fs.existsSync(filePath)) {
      return message.reply(`File "${filename}" not found in the audio directory!`);
    }

    try {
      if (!connection) {
        console.log('Joining voice channel...');
        connection = joinVoiceChannel({
          channelId: message.member.voice.channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        await new Promise((resolve, reject) => {
          connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Connection is ready!');
            resolve();
          });
          connection.on('error', (error) => {
            console.error('Connection error:', error);
            reject(error);
          });
        });
      }

      if (player) {
        player.stop();
      }

      currentFilePath = filePath;
      await playAudio(filePath, message);

    } catch (error) {
      console.error('Setup error:', error);
      message.reply('Failed to join voice channel or start playback.');
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
});

const audioDirectory = process.env.AUDIO_DIRECTORY;
client.login(process.env.DISCORD_TOKEN);
