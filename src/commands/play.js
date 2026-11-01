export default {
  name: 'play',
  aliases: ['resume', 'reanudar'],
  description: 'Reanuda la radio pausada.',
  usage: 'play',
  async execute({ message, player }) {
    player.resume(message.guildId);
    await message.reply('Lofi reanudado.');
  },
};
