import ansis from "ansis";
import { serializeError } from "serialize-error";

export const logger = console;

const stringifyArg = (arg: unknown) => {
  if (arg && typeof arg === "object") {
    // Handle errors and class instances with serialize-error
    // Otherwise, fallback to JSON.stringify if possible
    try {
      // If it's a plain object, JSON.stringify will work
      // But serializeError handles more edge cases (class instances, etc)
      if (arg instanceof Error) {
        return JSON.stringify(serializeError(arg), null, 2);
      }
      // Detect class instance by .constructor && .constructor.name !== 'Object'
      if (
        arg.constructor &&
        typeof arg.constructor === "function" &&
        arg.constructor.name !== "Object"
      ) {
        return JSON.stringify(serializeError(arg), null, 2);
      }
      return JSON.stringify(arg, null, 2);
    } catch {
      // fallback in case of cycles or serialization errors
      try {
        return String(arg);
      } catch {
        return "[Unstringifiable Object]";
      }
    }
  }
  return String(arg);
};

export const logError = (...args: Parameters<typeof console.error>) => {
  console.error(
    ansis.bgRedBright.white(" ERROR "),
    ansis.redBright(args.map(stringifyArg).join(" "))
  );
};

export const logDebug = (...args: Parameters<typeof console.debug>) => {
  console.debug(
    ansis.bgBlueBright.white(" DEBUG "),
    ansis.blueBright(args.map(stringifyArg).join(" "))
  );
};

export const logSuccess = (...args: Parameters<typeof console.log>) => {
  console.log(
    ansis.bgGreenBright.white(" SUCCESS "),
    ansis.greenBright(args.map(stringifyArg).join(" "))
  );
};

export const logWarning = (...args: Parameters<typeof console.warn>) => {
  console.warn(
    ansis.bgYellowBright.white(" WARNING "),
    ansis.yellowBright(args.map(stringifyArg).join(" "))
  );
};
