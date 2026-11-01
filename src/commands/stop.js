export default {
  name: 'stop',
  aliases: ['detener', 'parar'],
  description: 'Detiene la radio y desactiva la reconexión automática.',
  usage: 'stop',
  async execute({ message, player }) {
    await player.stop(message.guildId);
    await message.reply('Lofi detenido y bot desconectado. No se reconectará al reiniciar; usa `!start` para activarlo de nuevo.');
  },
};
