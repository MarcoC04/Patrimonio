import type { ParserId, StatementParser } from '../types';
import { finecoParser } from './fineco';
import { revolutParser } from './revolut';
import { tradeRepublicParser } from './tradeRepublic';

/** Tutti i formati supportati, un file per ciascuno (CLAUDE.md: interfaccia comune, un parser per formato). */
export const PARSERS: readonly StatementParser[] = [
  revolutParser,
  finecoParser,
  tradeRepublicParser,
];

export function getParser(id: string): StatementParser | undefined {
  return PARSERS.find((parser) => parser.id === id);
}

export function isParserId(value: string): value is ParserId {
  return PARSERS.some((parser) => parser.id === value);
}
