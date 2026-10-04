import { DataError } from '../data/repository';
import { HttpError } from '../data/retry';
import { SchemaError } from '../data/rows';
import { ScriptError } from '../data/scriptClient';
import { MoneyError } from '../domain/money';
import { strings } from './strings';

/**
 * Messaggio per l'utente. Solo i nostri errori hanno testi sicuri da mostrare (mai valori delle
 * celle); tutto il resto resta generico, così non finiscono dati finanziari nei messaggi.
 */
export function userMessage(error: unknown): string {
  if (
    error instanceof HttpError ||
    error instanceof SchemaError ||
    error instanceof ScriptError ||
    error instanceof DataError ||
    error instanceof MoneyError
  ) {
    return error.message;
  }
  if (error instanceof TypeError) return strings.errors.network;
  return strings.errors.unknown;
}
