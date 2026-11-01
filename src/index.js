import { Client, Events } from '@fluxerjs/core';
import { getVoiceManager } from '@fluxerjs/voice';
import { LofiPlayer } from './lofi-player.js';
import { CommandHandler } from './command-handler.js';

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  throw new Error('Configura FLUXER_BOT_TOKEN en el archivo .env.');
}

const client = new Client();
const voiceManager = getVoiceManager(client);
const player = new LofiPlayer(client, voiceManager);
const commandHandler = new CommandHandler(player);

client.on(Events.Ready, () => {
  console.log('Bot Lofi conectado a Fluxer.');
  void player.restoreSavedSessions().catch((error) => {
    console.error('No se pudieron cargar las sesiones guardadas de Lofi:', error);
  });
});

client.on(Events.MessageCreate, (message) => {
  void commandHandler.handle(message).catch((error) => {
    console.error('Error no controlado procesando un comando:', error);
  });
});

client.on(Events.Error, (error) => {
  console.error('Error del cliente Fluxer:', error);
});

try {
  await client.login(token);
} catch (error) {
  console.error('No se pudo iniciar sesión en Fluxer:', error);
  process.exitCode = 1;
}