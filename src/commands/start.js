export default {
  name: 'start',
  aliases: ['iniciar', 'star'],
  description: 'Conecta y comienza la radio en un canal de voz.',
  usage: 'start <#canal-de-voz | id-del-canal>',
  async execute({ message, args, player }) {
    const reference = args[0];
    const channelReference = reference?.match(/^(?:<#(\d+)>|(\d+))$/);
    if (!channelReference) {
      throw new Error('Uso: `!start <#canal-de-voz | id-del-canal>` (no se aceptan menciones de usuarios).');
    }
    const channelId = channelReference[1] ?? channelReference[2];
    await player.validateVoiceChannel(message.guildId, channelId);

    const savedChannelId = await player.sessionStore.get(message.guildId);
    if (savedChannelId && savedChannelId !== channelId) {
      const guild = await player.client.guilds.fetch(message.guildId);
      const isOwner = guild.ownerId === message.author.id;
      const member = isOwner ? null : await guild.members.fetch(message.author.id);
      if (!isOwner && !member.permissions.has('Administrator')) {
        throw new Error('Solo el administrador o propietario del servidor puede cambiar el canal de la radio.');
      }
    }

    await player.startOrSwitch(message.guildId, channelId);
    const wasChange = savedChannelId && savedChannelId !== channelId;
    await message.reply(wasChange
      ? 'Canal cambiado. Lofi está reproduciéndose en el nuevo canal de voz.'
      : 'Lofi está reproduciéndose en el canal de voz.');
  },
};
