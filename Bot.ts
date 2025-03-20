//======Advxm TS test++++++++++
import { Client, ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField, TextChannel, GatewayIntentBits } from "discord.js";
import { AudioPlayer, AudioPlayerStatus, createAudioPlayer, joinVoiceChannel, VoiceConnection, DiscordGatewayAdapterCreator } from "@discordjs/voice";
import ytdl from "ytdl-core";
import yts from "yt-search"; 

// Song class
class Song {
  public title: string;
  public url: string;

  constructor(title: string, url: string) {
    this.title = title;
    this.url = url;
  }

  static async from(input: string): Promise<Song> {
    try {
      // Check if the input is a valid YouTube URL
      if (ytdl.validateURL(input)) {
        const info = await ytdl.getInfo(input);
        return new Song(info.videoDetails.title, input);
      } else {
        const searchResults = await yts(input);
        const video = searchResults.videos[0]; // Get the first video result
        if (!video) throw new Error("No video found for the search term");
        return new Song(video.title, video.url);
      }
    } catch (error) {
      console.error("Song.from error:", error);
      throw new Error("Invalid URL or unable to fetch song info");
    }
  }
}

// Music queue class
class MusicQueue {
  public songs: Song[] = [];
  public player: AudioPlayer;
  public connection: VoiceConnection | null = null;
  public textChannel: TextChannel;
  public playing: boolean = false;

  constructor(textChannel: TextChannel) {
    this.textChannel = textChannel;
    this.player = createAudioPlayer();
    
    this.player.on(AudioPlayerStatus.Idle, () => this.playNext());
    this.player.on("error", (error) => {
      console.error("Player error:", error);
      this.textChannel.send("Error playing song!");
    });
  }

  async joinChannel(channel: any) {
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator
    });
    this.connection.subscribe(this.player);
    return this.connection;
  }

  async playSong(song: Song) {
    try {
      const stream = ytdl(song.url, { filter: "audioonly", quality: "highestaudio" });
      this.player.play(stream as any);
      this.playing = true;
      await this.textChannel.send(`Now playing: ${song.title}`);
    } catch (error) {
      console.error("Playback error:", error);
      throw error;
    }
  }

  enqueue(song: Song) {
    this.songs.push(song);
    if (!this.playing) this.playNext();
  }

  private async playNext() {
    if (this.songs.length === 0) {
      this.playing = false;
      return;
    }

    const song = this.songs.shift()!;
    await this.playSong(song);
  }

  disconnect() {
    this.songs = [];
    this.player.stop();
    this.connection?.destroy();
    this.playing = false;
  }
}

// Bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ]
});

const queues = new Map<string, MusicQueue>();

// Play command
const playCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Joins channel and plays a song")
    .addStringOption(option => 
      option.setName("song")
        .setDescription("YouTube URL or search term (e.g., 'runaway')")
        .setRequired(true)
    ),
  permissions: [
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
  ],

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const songInput = interaction.options.getString("song");
    if (!songInput) {
      return interaction.editReply("Please provide a YouTube URL or search term!");
    }

    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const voiceChannel = guildMember?.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply("You need to be in a voice channel!");
    }

    try {
      const song = await Song.from(songInput);
      let queue = queues.get(interaction.guild!.id);

      if (!queue) {
        queue = new MusicQueue(interaction.channel as TextChannel);
        await queue.joinChannel(voiceChannel);
        queues.set(interaction.guild!.id, queue);
        await interaction.editReply("Joined your voice channel!");
      } else if (queue.connection?.joinConfig.channelId !== voiceChannel.id) {
        queue.disconnect();
        await queue.joinChannel(voiceChannel);
        await interaction.editReply("Moved to your voice channel!");
      }

      queue.enqueue(song);
      if (!queue.playing) {
        await interaction.editReply(`Starting: ${song.title}`);
      } else {
        await interaction.editReply(`Queued: ${song.title}`);
      }

    } catch (error) {
      console.error(error);
      await interaction.editReply("Error: Could not play the song!");
    }
  }
};

// Join command
const joinCommand = {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Joins your voice channel"),
  permissions: [
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
  ],
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    
    const guildMember = interaction.guild!.members.cache.get(interaction.user.id);
    const voiceChannel = guildMember?.voice.channel;

    if (!voiceChannel) {
      return interaction.editReply("You need to be in a voice channel!");
    }

    let queue = queues.get(interaction.guild!.id);
    if (!queue) {
      queue = new MusicQueue(interaction.channel as TextChannel);
      queues.set(interaction.guild!.id, queue);
    }

    await queue.joinChannel(voiceChannel);
    await interaction.editReply("Joined your voice channel!");
  }
};

// Bot initialization
client.once("ready", () => {
  console.log("Bot is ready!");
  client.application?.commands.create(playCommand.data);
  client.application?.commands.create(joinCommand.data);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  switch (interaction.commandName) {
    case "play":
      await playCommand.execute(interaction);
      break;
    case "join":
      await joinCommand.execute(interaction);
      break;
  }
});

client.login("Token");

process.on("SIGINT", () => {
  queues.forEach(queue => queue.disconnect());
  client.destroy();
  process.exit(0);
});
