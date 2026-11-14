/**
 * Room codes: 4 characters a person can read off a laptop screen and type on a phone.
 * We leave out letters/numbers that are easy to confuse (0/O, 1/I/L, 5/S, 2/Z, 8/B).
 */
export const ROOM_CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercases, strips spaces, and checks the code only uses allowed characters. */
export function normaliseRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}
