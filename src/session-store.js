import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_PATH = fileURLToPath(new URL('../data/lofi-sessions.json', import.meta.url));

export class SessionStore {
  constructor(path = STORE_PATH) {
    this.path = path;
    this.sessions = new Map();
    this.loaded = false;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return;

    let contents;
    try {
      contents = await readFile(this.path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.loaded = true;
        return;
      }
      throw error;
    }

    const data = JSON.parse(contents);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`El archivo de sesiones ${this.path} debe contener un objeto JSON.`);
    }

    for (const [guildId, channelId] of Object.entries(data)) {
      if (!/^\d+$/.test(guildId) || typeof channelId !== 'string' || !/^\d+$/.test(channelId)) {
        throw new Error(`El archivo de sesiones ${this.path} contiene IDs inválidos.`);
      }
      this.sessions.set(guildId, channelId);
    }
    this.loaded = true;
  }

  async getAll() {
    await this.load();
    return [...this.sessions.entries()];
  }

  async get(guildId) {
    await this.load();
    return this.sessions.get(guildId) ?? null;
  }

  async set(guildId, channelId) {
    await this.load();
    return this.enqueueWrite((sessions) => {
      sessions.set(guildId, channelId);
      return true;
    });
  }

  async delete(guildId) {
    await this.load();
    return this.enqueueWrite((sessions) => (sessions.delete(guildId) ? true : null));
  }

  enqueueWrite(update) {
    const operation = this.writeQueue.then(async () => {
      const nextSessions = new Map(this.sessions);
      const result = update(nextSessions);
      if (result === null) return false;
      await this.write(nextSessions);
      this.sessions = nextSessions;
      return result;
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async write(sessions) {
    const temporaryPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.path), { recursive: true });
    try {
      await writeFile(temporaryPath, `${JSON.stringify(Object.fromEntries(sessions), null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.path);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          throw new AggregateError(
            [error, cleanupError],
            `No se pudo guardar ni limpiar la configuración en ${this.path}.`,
          );
        }
      }
      throw new Error(`No se pudo guardar la configuración de reproducción en ${this.path}.`, { cause: error });
    }
  }
}
