import commands from './commands/index.js';

export class CommandHandler {
  constructor(player) {
    this.player = player;
    this.commands = new Map();

    for (const command of commands) {
      for (const name of [command.name, ...command.aliases]) {
        this.commands.set(name, command);
      }
    }
  }

  async handle(message) {
    if (message.author.bot || !message.guildId || !message.content) return;

    const parsed = this.parseMessage(message.content);
    if (!parsed) return;

    let [name, ...args] = parsed;
    if (name.toLowerCase() === 'lofi') {
      [name, ...args] = args;
    }

    const command = this.commands.get(name?.toLowerCase());
    if (!command) {
      await this.reply(message, 'Comando desconocido. Usa `!help` para ver los comandos disponibles.');
      return;
    }

    try {
      await command.execute({
        message,
        args,
        player: this.player,
        commands: this.commands,
      });
    } catch (error) {
      console.error(`Error en el comando "${name}":`, error instanceof Error ? error.message : error);
      await this.reply(
        message,
        error instanceof Error ? error.message : 'Ocurrió un error al ejecutar el comando.',
      );
    }
  }

  parseMessage(content) {
    const text = content.trim();
    if (text.startsWith('!')) {
      return text.slice(1).trim().split(/\s+/).filter(Boolean);
    }

    const botId = this.player.client.user?.id;
    if (!botId) return null;

    const mention = new RegExp(`^<@!?${botId}>\\s*`);
    if (!mention.test(text)) return null;
    return text.replace(mention, '').trim().split(/\s+/).filter(Boolean);
  }

  async reply(message, content) {
    try {
      await message.reply(content);
    } catch (error) {
      console.error('No se pudo responder al comando:', error);
    }
  }
}
