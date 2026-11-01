export default {
  name: 'help',
  aliases: ['ayuda', 'commands', 'comandos'],
  description: 'Muestra la lista de comandos.',
  usage: 'help',
  async execute({ message, commands }) {
    const uniqueCommands = [...new Set(commands.values())];
    const commandList = uniqueCommands
      .map(({ usage, description, aliases }) => {
        const aliasText = aliases.length ? ` (alias: ${aliases.join(', ')})` : '';
        return `\`!${usage}\` — ${description}${aliasText}`;
      })
      .join('\n');

    await message.reply(
      `**Comandos de Lofi**\n${commandList}\n\nTambién puedes mencionar al bot antes del comando, por ejemplo: \`@bot start <id-del-canal>\`.`,
    );
  },
};
