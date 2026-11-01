export default {
  name: 'pause',
  aliases: ['pausar'],
  description: 'Pausa la radio.',
  usage: 'pause',
  async execute({ message, player }) {
    player.pause(message.guildId);
    await message.reply('Lofi pausado. Usa `!play` para continuar.');
  },
};
