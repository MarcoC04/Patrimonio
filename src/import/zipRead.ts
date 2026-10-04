import { strings } from '../ui/strings';
import { ImportFileError } from './errors';

/**
 * Lettura minimale di un file ZIP (basta per i file .xlsx): cerca le voci nella directory
 * centrale e decomprime con `DecompressionStream` del browser. Niente ZIP64 né cifratura.
 */

const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

export interface ZipEntry {
  name: string;
  /** 0 = nessuna compressione, 8 = deflate. */
  method: number;
  compressedSize: number;
  size: number;
  /** Posizione dell'intestazione locale nel file. */
  offset: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Elenco delle voci dello ZIP. Lancia ImportFileError se il file non è uno ZIP valido. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  const data = view(bytes);
  const decoder = new TextDecoder();

  // La fine dell'archivio ha una firma fissa; sta negli ultimi 64 KB (può seguire un commento).
  let end = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (data.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ImportFileError(strings.errors.import.notXlsx);

  const count = data.getUint16(end + 10, true);
  let cursor = data.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || data.getUint32(cursor, true) !== 0x02014b50) {
      throw new ImportFileError(strings.errors.import.notXlsx);
    }
    const nameLength = data.getUint16(cursor + 28, true);
    const extraLength = data.getUint16(cursor + 30, true);
    const commentLength = data.getUint16(cursor + 32, true);
    entries.push({
      name: decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)),
      method: data.getUint16(cursor + 10, true),
      compressedSize: data.getUint32(cursor + 20, true),
      size: data.getUint32(cursor + 24, true),
      offset: data.getUint32(cursor + 42, true),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ImportFileError(strings.errors.import.noDecompression);
  }
  // Copia in un buffer proprio: Blob non accetta viste su buffer condivisi.
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Contenuto (decompresso) di una voce. */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.size > MAX_UNCOMPRESSED_BYTES) throw new ImportFileError(strings.errors.import.tooBig);
  const data = view(bytes);
  if (entry.offset + 30 > bytes.length || data.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new ImportFileError(strings.errors.import.notXlsx);
  }
  const nameLength = data.getUint16(entry.offset + 26, true);
  const extraLength = data.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    const result = await inflate(raw);
    if (result.length > MAX_UNCOMPRESSED_BYTES) {
      throw new ImportFileError(strings.errors.import.tooBig);
    }
    return result;
  }
  throw new ImportFileError(strings.errors.import.unsupportedCompression);
}
