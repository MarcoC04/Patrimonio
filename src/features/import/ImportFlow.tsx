import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '../../app/DataProvider';
import type { Dataset } from '../../data/repository';
import { normalizeDescription } from '../../domain/dedupe';
import { formatDateIt } from '../../domain/dates';
import { formatMoney, formatPlain, parseMoney } from '../../domain/money';
import { suggestPattern } from '../../domain/rules';
import {
  buildImport,
  buildPlan,
  previewBalance,
  type PlannedRow,
  type RowIssue,
} from '../../import/plan';
import { getParser, isParserId, PARSERS } from '../../import/parsers';
import { readStatement } from '../../import/readStatement';
import type { ParserId } from '../../import/types';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { alertClass, buttonClass, inputClass, secondaryButtonClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { ImportHistory } from './ImportHistory';
import { ImportRowEditor } from './ImportRowEditor';

const t = strings.importStatement;

interface Props {
  data: Dataset;
  onDone: (message?: string) => void;
}

interface Loaded {
  parserId: ParserId;
  filename: string;
  fileHash: string;
  rows: PlannedRow[];
  fileAlreadyImported: boolean;
  skipped: number;
  /** Saldo a fine estratto: letto dal file (Revolut) o scritto dall'utente. */
  declaredText: string;
  /** Il file riporta il saldo (il campo è già compilato). */
  balanceFromFile: boolean;
  anchorDate: string | null;
}

/**
 * Importazione guidata: 1) per quale conto (e quindi con quale formato leggere il file);
 * 2) scelta del file; 3) anteprima modificabile; 4) conferma con un solo salvataggio atomico.
 * Il file resta in memoria solo il tempo della lettura e non viene mai salvato.
 */
export function ImportFlow({ data, onDone }: Props) {
  const { save } = useData();
  const accounts = data.accounts.filter((a) => !a.is_archived);
  const fileInput = useRef<HTMLInputElement>(null);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const remembered = data.meta[`import_format:${accountId}`] ?? '';
  // Il formato scelto a mano vale per il conto in cui è stato scelto; altrimenti quello ricordato.
  const [picked, setPicked] = useState<{ accountId: string; value: string } | null>(null);
  const formatValue = picked?.accountId === accountId ? picked.value : remembered;
  const parserId = isParserId(formatValue) ? formatValue : null;
  const parser = parserId ? getParser(parserId) : undefined;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problems, setProblems] = useState<Map<number, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);

  const categories = data.categories;

  const readFile = async (file: File) => {
    if (!parserId) return;
    setError(null);
    setBusy('reading');
    try {
      const parsed = await readStatement(file, parserId);
      const planned = await buildPlan({
        accountId,
        rows: parsed.rows,
        fileHash: parsed.fileHash,
        dataset: data,
      });
      if (!planned.ok) {
        setError(t.planIssues[planned.issue]);
        return;
      }
      if (planned.plan.rows.length === 0) {
        setError(strings.errors.import.noRows);
        return;
      }
      setProblems(new Map());
      setLoaded({
        parserId,
        filename: file.name,
        fileHash: parsed.fileHash,
        rows: planned.plan.rows,
        fileAlreadyImported: planned.plan.fileAlreadyImported,
        skipped: parsed.skipped.length,
        declaredText:
          planned.plan.endBalanceMinor === null ? '' : formatPlain(planned.plan.endBalanceMinor),
        balanceFromFile: planned.plan.endBalanceMinor !== null,
        anchorDate: planned.plan.anchorDate,
      });
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(null);
      // Permette di scegliere di nuovo lo stesso file dopo una correzione.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const updateRow = (key: number, patch: Partial<PlannedRow>) => {
    setLoaded((current) => {
      if (!current) return current;
      const source = current.rows.find((r) => r.key === key);
      // Scegliendo una categoria la si propone anche alle altre righe simili ancora senza categoria.
      const similarText =
        source && !source.trade && typeof patch.categoryId === 'string'
          ? suggestPattern(source.description)
          : null;
      const wanted = similarText === null ? '' : normalizeDescription(similarText);
      const sameKind = (r: PlannedRow) => r.amountMinor < 0 === (source?.amountMinor ?? 0) < 0;
      return {
        ...current,
        rows: current.rows.map((r) => {
          if (r.key === key) return { ...r, ...patch };
          const similar =
            wanted !== '' &&
            !r.trade &&
            r.categoryId === null &&
            sameKind(r) &&
            normalizeDescription(r.description).includes(wanted);
          return similar ? { ...r, categoryId: patch.categoryId ?? null } : r;
        }),
      };
    });
    setProblems((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  };

  const selected = useMemo(() => loaded?.rows.filter((r) => r.include) ?? [], [loaded]);
  const netMinor = selected.reduce((sum, r) => sum + r.amountMinor, 0);
  const duplicates = loaded?.rows.filter((r) => r.duplicate).length ?? 0;
  const toCheck = loaded?.rows.filter((r) => !r.duplicate && r.warnings.length > 0).length ?? 0;

  const declaredText = loaded?.declaredText.trim() ?? '';
  const declaredMinor = declaredText === '' ? null : parseMoney(declaredText);
  const declaredInvalid = declaredText !== '' && declaredMinor === null;
  const balance = loaded
    ? previewBalance({
        dataset: data,
        accountId,
        rows: loaded.rows,
        declaredMinor,
        anchorDate: loaded.anchorDate,
      })
    : null;
  // Saldo del conto dopo l'importazione: saldo iniziale + tutti i movimenti (vecchi e nuovi).
  const balanceAfter =
    balance === null
      ? null
      : balance.openingBalanceMinor +
        data.transactions
          .filter((tx) => tx.account_id === accountId)
          .reduce((n, tx) => n + tx.amount_minor, 0) +
        netMinor;

  const confirm = async () => {
    if (!loaded) return;
    setError(null);
    if (declaredInvalid) {
      setError(t.balance.invalid);
      return;
    }
    if (selected.length === 0) {
      setError(t.nothingSelected);
      return;
    }
    const built = buildImport({
      accountId,
      parserId: loaded.parserId,
      filename: loaded.filename,
      fileHash: loaded.fileHash,
      rows: loaded.rows,
      dataset: data,
      declaredMinor,
      anchorDate: loaded.anchorDate,
    });
    if (!built.ok) {
      const byRow = new Map<number, string[]>();
      for (const { key, issue } of built.rowIssues) {
        byRow.set(key, [...(byRow.get(key) ?? []), t.rowIssues[issue satisfies RowIssue]]);
      }
      setProblems(byRow);
      setError(t.fixRows(byRow.size));
      return;
    }
    setBusy('saving');
    try {
      await save(built.changes);
      onDone(t.done(built.summary.transactions, built.summary.trades));
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-line p-3">
        <p className="mb-3 text-sm">{t.noAccounts}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/impostazioni" className={`${buttonClass} no-underline`}>
            {strings.common.goToSettings}
          </Link>
          <button type="button" className={secondaryButtonClass} onClick={() => onDone()}>
            {t.close}
          </button>
        </div>
      </div>
    );
  }

  if (loaded) {
    const accountName = accounts.find((a) => a.id === accountId)?.name ?? '';
    return (
      <section aria-label={t.previewTitle} className="mb-4 rounded-lg border border-line p-3">
        <h3 className="mb-1 font-semibold">{t.previewTitle}</h3>
        <p className="mb-1 text-sm text-muted">
          {accountName} · {getParser(loaded.parserId)?.label}
        </p>
        <p className="mb-3 text-sm text-muted">{t.previewHint}</p>

        {loaded.fileAlreadyImported && (
          <p role="alert" className={`${alertClass} mb-3`}>
            {t.fileAlready}
          </p>
        )}
        {loaded.skipped > 0 && (
          <p className="mb-3 text-sm text-muted">{t.skipped(loaded.skipped)}</p>
        )}

        <p className="font-medium">{t.summary(selected.length, loaded.rows.length)}</p>
        <p className="mb-3 text-sm text-muted">
          {[
            duplicates > 0 ? t.duplicates(duplicates) : null,
            toCheck > 0 ? t.toCheck(toCheck) : null,
            `${t.netTotal}: ${formatMoney(netMinor)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {error && (
          <p role="alert" className={`${alertClass} mb-3`}>
            {error}
          </p>
        )}

        <fieldset className="mb-4 rounded-lg border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t.balance.title}</legend>
          <Field
            label={t.balance.label}
            htmlFor="import-end-balance"
            hint={loaded.balanceFromFile ? t.balance.hintFromFile : t.balance.hintManual}
          >
            <input
              id="import-end-balance"
              inputMode="decimal"
              value={loaded.declaredText}
              aria-invalid={declaredInvalid}
              onChange={(e) =>
                setLoaded((current) =>
                  current ? { ...current, declaredText: e.target.value } : current,
                )
              }
              className={`${inputClass} ${declaredInvalid ? 'border-expense' : ''}`}
              autoComplete="off"
            />
          </Field>
          {declaredInvalid && (
            <p className="text-sm font-semibold text-expense">{t.balance.invalid}</p>
          )}
          {balance && !declaredInvalid && (
            <ul className="space-y-1 text-sm">
              {balance.backdated && (
                <li>{t.balance.backdated(formatDateIt(balance.openingDate))}</li>
              )}
              {balance.anchored && balanceAfter !== null && (
                <li className="font-medium">{t.balance.after(formatMoney(balanceAfter))}</li>
              )}
              {balance.differenceMeaningful && balance.differenceMinor === 0 && (
                <li>{t.balance.matches}</li>
              )}
              {balance.differenceMeaningful && balance.differenceMinor !== 0 && (
                <li role="alert" className="font-semibold text-expense">
                  {t.balance.mismatch(formatMoney(balance.differenceMinor ?? 0))}
                </li>
              )}
              {balance.anchored && !balance.differenceMeaningful && (
                <li className="text-muted">
                  {t.balance.openingDerived(formatMoney(balance.openingBalanceMinor))}
                </li>
              )}
              {!balance.anchored && <li className="text-muted">{t.balance.notAnchored}</li>}
            </ul>
          )}
        </fieldset>

        <ul>
          {loaded.rows.map((row) => (
            <ImportRowEditor
              key={row.key}
              row={row}
              categories={categories}
              problems={problems.get(row.key) ?? []}
              onChange={(patch) => updateRow(row.key, patch)}
            />
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={busy !== null}
            onClick={() => void confirm()}
          >
            {busy === 'saving' ? strings.common.saving : t.confirm(selected.length)}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={busy !== null}
            onClick={() => {
              setLoaded(null);
              setError(null);
            }}
          >
            {t.back}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={busy !== null}
            onClick={() => onDone()}
          >
            {strings.common.cancel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t.title} className="mb-4 rounded-lg border border-line p-3">
      <h3 className="mb-3 font-semibold">{t.step1}</h3>
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}

      <Field label={t.account} htmlFor="import-account">
        <select
          id="import-account"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setError(null);
          }}
          className={inputClass}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t.format} htmlFor="import-format" hint={t.formatHint}>
        <select
          id="import-format"
          value={parserId ?? ''}
          onChange={(e) => setPicked({ accountId, value: e.target.value })}
          className={inputClass}
        >
          <option value="">{t.chooseFormat}</option>
          {PARSERS.map((p) => (
            <option key={p.id} value={p.id}>
              {t.formatName(p.label, p.fileKind)}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t.file}
        htmlFor="import-file"
        hint={parser ? t.fileHint(parser.fileKind) : t.needAccountAndFormat}
      >
        <input
          ref={fileInput}
          id="import-file"
          type="file"
          accept={parser?.accept}
          disabled={!parser || busy !== null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
          }}
          className={inputClass}
        />
      </Field>

      {busy === 'reading' && <p className="mb-3 text-sm text-muted">{t.reading}</p>}

      <button type="button" className={secondaryButtonClass} onClick={() => onDone()}>
        {strings.common.cancel}
      </button>

      <ImportHistory data={data} onUndone={(message) => onDone(message)} />
    </section>
  );
}
