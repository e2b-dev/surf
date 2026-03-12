import pino from "pino";

// No transport/worker threads — they crash in Next.js server runtime.
// Plain pino writes JSON to stdout synchronously, which works everywhere.
const logger = pino({
  level: process.env.LOG_LEVEL || "debug",
});

export { logger };

export const logError = (msg: string, ...args: unknown[]) => {
  if (args.length === 1) {
    logger.error(
      args[0] instanceof Error ? { err: args[0] } : { data: args[0] },
      msg
    );
  } else if (args.length > 1) {
    logger.error({ data: args }, msg);
  } else {
    logger.error(msg);
  }
};

export const logDebug = (msg: string, ...args: unknown[]) => {
  if (args.length === 1) {
    logger.debug({ data: args[0] }, msg);
  } else if (args.length > 1) {
    logger.debug({ data: args }, msg);
  } else {
    logger.debug(msg);
  }
};

export const logSuccess = (msg: string, ...args: unknown[]) => {
  if (args.length === 1) {
    logger.info({ data: args[0] }, msg);
  } else if (args.length > 1) {
    logger.info({ data: args }, msg);
  } else {
    logger.info(msg);
  }
};

export const logWarning = (msg: string, ...args: unknown[]) => {
  if (args.length === 1) {
    logger.warn({ data: args[0] }, msg);
  } else if (args.length > 1) {
    logger.warn({ data: args }, msg);
  } else {
    logger.warn(msg);
  }
};
