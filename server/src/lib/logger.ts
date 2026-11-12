import { config } from '../config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = config.isProd ? 'info' : 'debug';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (order[level] < order[minLevel]) return;
  const time = new Date().toISOString();
  if (config.isProd) {
    const line = JSON.stringify({ time, level, message, ...meta });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const text = `${time} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/password|secret|token|authorization|cookie|card|cvv|pin/i.test(key)) return [key, '[redacted]'];
        return [key, redact(item)];
      }),
    );
  }
  return value;
}
