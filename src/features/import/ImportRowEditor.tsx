import { useState } from 'react';
import type { Category } from '../../data/schema';
import { formatPlain, parseMoney } from '../../domain/money';
import { suggestPattern } from '../../domain/rules';
import type { PlannedRow } from '../../import/plan';
import { signedMoney } from '../../ui/format';
import { inputClass } from '../../ui/styles';
import { strings } from '../../ui/strings';
import { categoryPath, sortedCategories } from '../categories/labels';

interface Props {
  row: PlannedRow;
  categories: readonly Category[];
  /** Messaggi di errore trovati al tentativo di salvataggio. */
  problems: readonly string[];
  onChange: (patch: Partial<PlannedRow>) => void;
}

const t = strings.importStatement;

/** Una riga dell'anteprima: tutto ciò che l'utente può correggere prima di confermare. */
export function ImportRowEditor({ row, categories, problems, onChange }: Props) {
  const idBase = `import-row-${row.key}`;
  const [amountText, setAmountText] = useState(() => formatPlain(row.amountMinor));
  const amountValid = parseMoney(amountText) !== null && parseMoney(amountText) !== 0;
  const kind = row.amountMinor < 0 ? 'expense' : 'income';
  const badges = [
    ...(row.duplicate ? [t.badges.duplicate] : []),
    ...row.warnings.map((warning) => t.badges[warning]),
  ];
  const canLearn = !row.trade && !row.transfer && row.categoryId !== null && row.ruleId === null;
  const suggestion = suggestPattern(row.description);

  return (
    <li
      className={`border-b border-line-soft py-3 last:border-b-0 ${row.include ? '' : 'opacity-70'}`}
    >
      <div className="mb-2 flex items-start gap-3">
        <input
          id={`${idBase}-include`}
          type="checkbox"
          checked={row.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          className="mt-1 size-6 shrink-0 accent-[var(--color-accent)]"
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`${idBase}-include`} className="block font-medium">
            {row.description || t.line(row.line)}
          </label>
          <p className="text-xs text-muted">
            {t.line(row.line)} · {signedMoney(row.amountMinor)}
          </p>
          {row.transfer && <p className="text-xs text-muted">{t.transferNote}</p>}
          {row.trade && (
            <p className="text-xs text-muted">
              {t.investment(row.trade.type, row.trade.quantity)} — {t.investmentNote}
            </p>
          )}
          {badges.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1">
              {badges.map((badge) => (
                <li
                  key={badge}
                  className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted"
                >
                  {badge}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="mb-2 text-sm font-semibold text-expense">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
        <div>
          <label htmlFor={`${idBase}-date`} className="mb-1 block text-xs font-medium">
            {strings.transactions.date}
          </label>
          <input
            id={`${idBase}-date`}
            type="date"
            value={row.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-amount`} className="mb-1 block text-xs font-medium">
            {t.amount}
          </label>
          <input
            id={`${idBase}-amount`}
            inputMode="decimal"
            value={amountText}
            aria-invalid={!amountValid}
            onChange={(e) => {
              const text = e.target.value;
              setAmountText(text);
              const minor = parseMoney(text);
              if (minor === null || minor === 0) return;
              const changedKind = minor < 0 !== row.amountMinor < 0;
              onChange({
                amountMinor: minor,
                // Passando da spesa a entrata (o viceversa) la categoria scelta non è più adatta.
                ...(changedKind && !row.trade
                  ? { categoryId: null, ruleId: null, learnPattern: null }
                  : {}),
              });
            }}
            className={`${inputClass} ${amountValid ? '' : 'border-expense'}`}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mt-2">
        <label htmlFor={`${idBase}-description`} className="mb-1 block text-xs font-medium">
          {strings.transactions.description}
        </label>
        <input
          id={`${idBase}-description`}
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={inputClass}
          autoComplete="off"
        />
      </div>

      {!row.trade && !row.transfer && (
        <div className="mt-2">
          <label htmlFor={`${idBase}-category`} className="mb-1 block text-xs font-medium">
            {t.category}
          </label>
          <select
            id={`${idBase}-category`}
            value={row.categoryId ?? ''}
            onChange={(e) =>
              onChange({
                categoryId: e.target.value === '' ? null : e.target.value,
                // La categoria scelta a mano sostituisce quella proposta dalla regola.
                ruleId: null,
                // "Ricorda" parte attivo: la regola proposta si può modificare o togliere.
                learnPattern: e.target.value === '' ? null : suggestion,
              })
            }
            className={inputClass}
          >
            <option value="">{strings.transactions.toCategorize}</option>
            {sortedCategories(categories, kind).map((category) => (
              <option key={category.id} value={category.id}>
                {categoryPath(category, categories)}
              </option>
            ))}
          </select>
        </div>
      )}

      {canLearn && (suggestion !== null || row.learnPattern !== null) && (
        <div className="mt-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.learnPattern !== null}
              onChange={(e) =>
                onChange({ learnPattern: e.target.checked ? (suggestion ?? '') : null })
              }
              className="size-5 accent-[var(--color-accent)]"
            />
            {t.learn}
          </label>
          {row.learnPattern !== null && (
            <div className="ml-7">
              <label htmlFor={`${idBase}-pattern`} className="mb-1 block text-xs font-medium">
                {t.learnPattern}
              </label>
              <input
                id={`${idBase}-pattern`}
                value={row.learnPattern}
                onChange={(e) => onChange({ learnPattern: e.target.value })}
                className={inputClass}
                autoComplete="off"
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
