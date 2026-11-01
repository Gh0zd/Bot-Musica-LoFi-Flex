import { spawn } from 'node:child_process';
import { VoiceChannel } from '@fluxerjs/core';
import { SessionStore } from './session-store.js';

const DEFAULT_STREAM_URL = 'https://live.proradiosonline.com/listen/lofi_radio/aac';

export class LofiPlayer {
  constructor(client, voiceManager, sessionStore = new SessionStore()) {
    this.client = client;
    this.voiceManager = voiceManager;
    this.sessionStore = sessionStore;
    this.sessions = new Map();
  }

  async start(guildId, voiceChannelId, { preserveSavedOnFailure = false } = {}) {
    if (this.sessions.has(guildId)) {
      throw new Error('Ya hay una sesión de Lofi en este servidor.');
    }

    const session = { connection: null, ffmpeg: null, state: 'starting' };
    this.sessions.set(guildId, session);

    try {
      await this.sessionStore.set(guildId, voiceChannelId);
      const channel = await this.validateVoiceChannel(guildId, voiceChannelId);
      this.ensureStartingSession(guildId, session);

      const connection = await this.voiceManager.join(channel);
      session.connection = connection;
      this.ensureStartingSession(guildId, session);
      const ffmpeg = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-nostdin',
        '-hide_banner',
        '-loglevel', 'warning',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '10',
        '-i', process.env.LOFI_STREAM_URL || DEFAULT_STREAM_URL,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-f', 'webm',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      session.ffmpeg = ffmpeg;
      session.state = 'playing';

      ffmpeg.stderr.on('data', (chunk) => {
        console.error(`[ffmpeg:${guildId}] ${chunk.toString().trim()}`);
      });

      ffmpeg.once('error', (error) => {
        console.error(`No se pudo iniciar FFmpeg: ${error.message}`);
        void this.stop(guildId, { forget: false }).catch((stopError) => {
          console.error(`No se pudo limpiar la sesión de Lofi en ${guildId}:`, stopError);
        });
      });

      connection.on('error', (error) => {
        console.error(`Error de voz en ${guildId}: ${error.message}`);
        void this.stop(guildId, { forget: false }).catch((stopError) => {
          console.error(`No se pudo limpiar la sesión de Lofi en ${guildId}:`, stopError);
        });
      });

      ffmpeg.once('close', (code) => {
        if (this.sessions.get(guildId) !== session) return;
        this.sessions.delete(guildId);
        try {
          connection.stop();
        } catch (error) {
          console.error(`No se pudo detener la conexión de voz en ${guildId}:`, error);
        }
        void this.voiceManager.leave(guildId).catch((error) => {
          console.error(`No se pudo desconectar del canal de voz en ${guildId}:`, error);
        });
        if (code !== 0 && code !== null) {
          console.error(`FFmpeg terminó con código ${code} en ${guildId}.`);
        }
      });

      connection.play(ffmpeg.stdout).catch((error) => {
        console.error(`Error reproduciendo Lofi en ${guildId}: ${error.message}`);
        void this.stop(guildId, { forget: false }).catch((stopError) => {
          console.error(`No se pudo limpiar la sesión de Lofi en ${guildId}:`, stopError);
        });
      });

      return session;
    } catch (error) {
      if (this.sessions.get(guildId) === session) {
        this.sessions.delete(guildId);
      }
      const cleanupErrors = [];
      if (session.ffmpeg) {
        try {
          session.ffmpeg.kill('SIGTERM');
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (session.connection) {
        try {
          session.connection.stop();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
        try {
          await this.voiceManager.leave(guildId);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (!preserveSavedOnFailure) {
        try {
          await this.sessionStore.delete(guildId);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `No se pudo iniciar ni limpiar la sesión de Lofi en ${guildId}.`,
        );
      }
      throw error;
    }
  }

  async validateVoiceChannel(guildId, voiceChannelId) {
    let channel;
    try {
      channel = await this.client.channels.fetch(voiceChannelId);
    } catch (error) {
      if (error?.code === 'CHANNEL_NOT_FOUND' || error?.code === 'UNKNOWN_CHANNEL') {
        throw new Error(
          'No encontré ese canal. Comprueba que el ID sea de un canal de voz de este servidor y que el bot tenga acceso.',
          { cause: error },
        );
      }
      throw error;
    }
    if (!(channel instanceof VoiceChannel)) {
      throw new Error('El ID indicado no corresponde a un canal de voz.');
    }
    if (channel.guildId !== guildId) {
      throw new Error('Ese canal no pertenece a este servidor.');
    }
    return channel;
  }

  async startOrSwitch(guildId, voiceChannelId) {
    await this.validateVoiceChannel(guildId, voiceChannelId);
    const currentChannelId = await this.sessionStore.get(guildId);
    const activeSession = this.sessions.get(guildId);
    if (activeSession && currentChannelId === voiceChannelId) {
      throw new Error(activeSession.state === 'starting'
        ? 'La radio ya se está conectando a ese canal.'
        : 'La radio ya está reproduciéndose en ese canal.');
    }

    if (activeSession) {
      await this.stop(guildId, { forget: false });
    }
    return this.start(guildId, voiceChannelId, { preserveSavedOnFailure: true });
  }

  ensureStartingSession(guildId, session) {
    if (this.sessions.get(guildId) !== session) {
      throw new Error('El inicio de la radio fue cancelado.');
    }
  }

  async restoreSavedSessions() {
    const savedSessions = await this.sessionStore.getAll();
    for (const [guildId, channelId] of savedSessions) {
      try {
        await this.start(guildId, channelId, { preserveSavedOnFailure: true });
        console.log(`Se restauró la radio Lofi del servidor ${guildId}.`);
      } catch (error) {
        console.error(`No se pudo restaurar la radio Lofi del servidor ${guildId}:`, error);
      }
    }
  }

  pause(guildId) {
    const session = this.getSession(guildId);
    if (session.state === 'paused') throw new Error('La radio ya está pausada.');
    if (!session.ffmpeg.kill('SIGSTOP')) throw new Error('No se pudo pausar FFmpeg.');
    session.state = 'paused';
  }

  resume(guildId) {
    const session = this.getSession(guildId);
    if (session.state === 'playing') throw new Error('La radio ya está reproduciéndose.');
    if (!session.ffmpeg.kill('SIGCONT')) throw new Error('No se pudo reanudar FFmpeg.');
    session.state = 'playing';
  }

  async stop(guildId, { forget = true } = {}) {
    const savedConfigurationRemoved = forget
      ? await this.sessionStore.delete(guildId)
      : false;
    const session = this.sessions.get(guildId);
    if (!session) {
      if (savedConfigurationRemoved) return;
      throw new Error('No hay una sesión activa de Lofi en este servidor.');
    }
    this.sessions.delete(guildId);

    const errors = [];
    if (session.connection) {
      try {
        session.connection.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    if (session.ffmpeg) {
      try {
        session.ffmpeg.kill('SIGTERM');
      } catch (error) {
        errors.push(error);
      }
    }
    if (session.connection) {
      try {
        await this.voiceManager.leave(guildId);
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length) {
      throw new AggregateError(errors, 'No se pudo limpiar completamente la sesión de Lofi.');
    }
  }

  getSession(guildId) {
    const session = this.sessions.get(guildId);
    if (!session) {
      throw new Error('No hay una sesión de Lofi en este servidor. Usa `!start <id-del-canal-de-voz>` primero.');
    }
    if (session.state === 'starting') {
      throw new Error('La radio todavía se está conectando. Espera un momento y vuelve a intentarlo.');
    }
    return session;
  }
}