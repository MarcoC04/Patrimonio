import { describe, expect, it } from 'vitest';
import backupGs from '../../apps-script/Backup.gs?raw';
import { FakeSpreadsheet } from './testing/fakeAppsScript';

/**
 * Esegue apps-script/Backup.gs così com'è con finti servizi Drive/Foglio/Lock/Trigger,
 * per provarne la logica (copia, conservazione delle ultime 8, log) senza toccare Google.
 */

interface FakeFile {
  id: string;
  name: string;
  created: number;
  trashed: boolean;
}

function createBackup(
  options: { failCopy?: boolean; lockAvailable?: boolean; existing?: FakeFile[] } = {},
) {
  const spreadsheet = new FakeSpreadsheet();
  const files: FakeFile[] = [...(options.existing ?? [])];
  const folders: string[] = [];
  const triggers: { handler: string; deleted: boolean }[] = [];
  let nextId = 1;
  let clock = 1_000_000;

  const iterator = <T>(items: T[]) => {
    let index = 0;
    return { hasNext: () => index < items.length, next: () => items[index++] as T };
  };
  const fileApi = (file: FakeFile) => ({
    getId: () => file.id,
    getName: () => file.name,
    getDateCreated: () => new Date(file.created),
    setTrashed: (value: boolean) => {
      file.trashed = value;
    },
    makeCopy: (name: string) => {
      if (options.failCopy) throw new Error('Drive non disponibile');
      const copy: FakeFile = { id: `copia-${nextId++}`, name, created: clock++, trashed: false };
      files.push(copy);
      return fileApi(copy);
    },
  });

  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getId: () => 'foglio-1',
        getSheetByName: (n: string) => spreadsheet.getSheetByName(n),
        insertSheet: (n: string) => spreadsheet.insertSheet(n),
      }),
    },
    DriveApp: {
      getFileById: (id: string) => {
        const file = files.find((f) => f.id === id) ?? {
          id,
          name: 'Originale',
          created: 0,
          trashed: false,
        };
        return fileApi(file);
      },
      getFoldersByName: (name: string) =>
        iterator(
          folders.includes(name)
            ? [{ getFiles: () => iterator(files.filter((f) => !f.trashed).map(fileApi)) }]
            : [],
        ),
      createFolder: (name: string) => {
        folders.push(name);
        return { getFiles: () => iterator(files.filter((f) => !f.trashed).map(fileApi)) };
      },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => options.lockAvailable !== false,
        releaseLock: () => {},
      }),
    },
    ScriptApp: {
      WeekDay: { SUNDAY: 'SUNDAY' },
      getProjectTriggers: () =>
        triggers.map((t) => ({ getHandlerFunction: () => t.handler, _t: t })),
      deleteTrigger: (trigger: { _t: { deleted: boolean } }) => {
        trigger._t.deleted = true;
      },
      newTrigger: (handler: string) => {
        const record = { handler, deleted: false };
        const builder = {
          timeBased: () => builder,
          onWeekDay: () => builder,
          atHour: () => builder,
          create: () => {
            triggers.push(record);
          },
        };
        return builder;
      },
    },
  };

  const load = new Function(
    ...Object.keys(sandbox),
    `${backupGs}\nreturn { backupNow: backupNow, setupWeeklyBackup: setupWeeklyBackup, select: selectBackupsToDelete_ };`,
  ) as (...services: unknown[]) => {
    backupNow: () => void;
    setupWeeklyBackup: () => void;
    select: (items: { id: string; name: string; created: number }[], keep: number) => string[];
  };
  const script = load(...Object.values(sandbox));
  const logRows = () => {
    const sheet = spreadsheet.getSheetByName('_backup_log');
    if (!sheet) return [];
    return sheet.getDataRange().getDisplayValues();
  };
  return { script, files, folders, triggers, logRows };
}

const backup = (id: string, created: number): FakeFile => ({
  id,
  name: `Patrimonio backup ${created}`,
  created,
  trashed: false,
});

describe('selectBackupsToDelete_', () => {
  const item = (id: string, created: number, name = `Patrimonio backup ${id}`) => ({
    id,
    name,
    created,
  });

  it('tiene le più recenti e restituisce le altre, dalla più vecchia', () => {
    const { script } = createBackup();
    const items = [item('b', 20), item('d', 40), item('a', 10), item('c', 30)];
    expect(script.select(items, 2).sort()).toEqual(['a', 'b']); // restano d (40) e c (30)
  });

  it('con meno copie del limite non cancella nulla', () => {
    const { script } = createBackup();
    expect(script.select([item('a', 1), item('b', 2)], 8)).toEqual([]);
  });

  it('non tocca i file senza il nostro prefisso nella stessa cartella', () => {
    const { script } = createBackup();
    const items = [item('a', 1), item('b', 2), item('altro', 0, 'Una foto.jpg'), item('c', 3)];
    expect(script.select(items, 1).sort()).toEqual(['a', 'b']);
    expect(script.select(items, 1)).not.toContain('altro');
  });
});

describe('backupNow', () => {
  it('crea la cartella, copia il foglio e scrive una riga "ok" nel log (con intestazioni)', () => {
    const { script, files, folders, logRows } = createBackup();
    script.backupNow();

    expect(folders).toEqual(['Backup Patrimonio']);
    expect(files).toHaveLength(1);
    expect(files[0]?.name.startsWith('Patrimonio backup ')).toBe(true);
    const rows = logRows();
    expect(rows[0]).toEqual(['started_at', 'file_id', 'status', 'error']);
    expect(rows[1]?.[1]).toBe(files[0]?.id);
    expect(rows[1]?.[2]).toBe('ok');
    expect(rows[1]?.[3]).toBe('');
  });

  it('dopo molte esecuzioni restano le ultime 8 copie; le altre vanno nel cestino', () => {
    const existing = Array.from({ length: 8 }, (_, i) => backup(`vecchia-${i}`, i + 1)); // 1..8
    const { script, files } = createBackup({ existing });
    script.backupNow(); // la copia nuova ha created = 1.000.000: la più recente
    const alive = files.filter((f) => !f.trashed);
    expect(alive).toHaveLength(8);
    expect(files.find((f) => f.id === 'vecchia-0')?.trashed).toBe(true); // la più vecchia è nel cestino
    expect(files.find((f) => f.id === 'vecchia-7')?.trashed).toBe(false);
  });

  it('non cancella file estranei che stanno nella cartella', () => {
    const existing: FakeFile[] = [
      ...Array.from({ length: 8 }, (_, i) => backup(`b${i}`, i + 1)),
      { id: 'estraneo', name: 'Appunti.txt', created: 0, trashed: false },
    ];
    const { script, files } = createBackup({ existing });
    script.backupNow();
    expect(files.find((f) => f.id === 'estraneo')?.trashed).toBe(false);
  });

  it('se la copia fallisce scrive una riga "error", senza cancellare nulla', () => {
    const existing = Array.from({ length: 8 }, (_, i) => backup(`b${i}`, i + 1));
    const { script, files, logRows } = createBackup({ failCopy: true, existing });
    script.backupNow();
    expect(files.every((f) => !f.trashed)).toBe(true);
    const row = logRows()[1];
    expect(row?.[2]).toBe('error');
    expect(row?.[1]).toBe('');
    expect(row?.[3]).toContain('Drive non disponibile');
  });

  it('se il foglio è occupato (lock) non copia e lo registra', () => {
    const { script, files, logRows } = createBackup({ lockAvailable: false });
    script.backupNow();
    expect(files).toHaveLength(0);
    expect(logRows()[1]?.slice(2)).toEqual(['error', 'busy']);
  });

  it('le esecuzioni successive aggiungono righe al log', () => {
    const { script, logRows } = createBackup();
    script.backupNow();
    script.backupNow();
    expect(logRows()).toHaveLength(3); // intestazione + 2 esiti
  });
});

describe('setupWeeklyBackup', () => {
  it('crea un solo trigger per backupNow, anche se eseguita più volte', () => {
    const { script, triggers } = createBackup();
    script.setupWeeklyBackup();
    script.setupWeeklyBackup();
    const live = triggers.filter((t) => !t.deleted && t.handler === 'backupNow');
    expect(live).toHaveLength(1);
  });
});
