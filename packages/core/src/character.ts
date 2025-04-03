import type { Character } from "./types";

/**
 * Defines a character and ensures safe defaults.
 */
export const defineCharacter = (char: Character): Character => {
  return {
    ...char,
    plugins: char.plugins ?? [],
    settings: char.settings ?? {},
  };
};
