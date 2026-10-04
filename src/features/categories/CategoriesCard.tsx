import { useState } from 'react';
import { useData, useReadyData } from '../../app/DataProvider';
import { softDelete } from '../../data/repository';
import { CATEGORY_KINDS, type Category } from '../../data/schema';
import {
  createCategory,
  updateCategory,
  type CategoryInput,
  type CategoryIssue,
} from '../../domain/categories';
import { categoryUsage } from '../../domain/integrity';
import { Card } from '../../ui/Card';
import { userMessage } from '../../ui/errors';
import { Field } from '../../ui/Field';
import { FormIssues } from '../../ui/FormIssues';
import {
  alertClass,
  buttonClass,
  dangerButtonClass,
  inputClass,
  secondaryButtonClass,
} from '../../ui/styles';
import { strings } from '../../ui/strings';

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'it');

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const { save } = useData();
  const { categories } = useReadyData();
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<Category['kind']>(category?.kind ?? 'expense');
  const [parentId, setParentId] = useState<string>(category?.parent_id ?? '');
  const [issues, setIssues] = useState<CategoryIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hasChildren = category !== null && categories.some((c) => c.parent_id === category.id);
  // Madri possibili: categorie di primo livello dello stesso tipo, diverse da questa.
  const parents = categories
    .filter((c) => c.parent_id === null && c.kind === kind && c.id !== category?.id)
    .sort(byName);

  const submit = async () => {
    const input: CategoryInput = { name, kind, parentId: parentId === '' ? null : parentId };
    const result = category
      ? updateCategory(category, input, categories)
      : createCategory(input, categories);
    if (!result.ok) {
      setIssues(result.issues);
      setError(null);
      return;
    }
    setIssues([]);
    setBusy(true);
    try {
      await save({
        categories: category ? { update: [result.value] } : { insert: [result.value] },
      });
      onDone();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mb-4 rounded-lg border border-slate-300 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 className="mb-3 font-semibold">
        {category ? strings.categories.formEdit : strings.categories.formAdd}
      </h3>
      <FormIssues messages={issues.map((issue) => strings.categories.issues[issue])} />
      {error && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {error}
        </p>
      )}
      <Field label={strings.categories.name} htmlFor="category-name">
        <input
          id="category-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          autoComplete="off"
        />
      </Field>
      <Field label={strings.categories.kind} htmlFor="category-kind">
        <select
          id="category-kind"
          value={kind}
          // Il tipo non cambia dopo la creazione: i movimenti già collegati diventerebbero incoerenti.
          disabled={category !== null}
          onChange={(e) => {
            setKind(e.target.value as Category['kind']);
            setParentId('');
          }}
          className={inputClass}
        >
          {CATEGORY_KINDS.map((value) => (
            <option key={value} value={value}>
              {strings.categories.kindsSingular[value]}
            </option>
          ))}
        </select>
      </Field>
      {!hasChildren && (
        <Field label={strings.categories.parent} htmlFor="category-parent">
          <select
            id="category-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={inputClass}
          >
            <option value="">{strings.common.noneOption}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass}>
          {busy ? strings.common.saving : strings.common.save}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className={secondaryButtonClass}>
          {strings.common.cancel}
        </button>
      </div>
    </form>
  );
}

export function CategoriesCard() {
  const { save } = useData();
  const { categories, transactions } = useReadyData();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const remove = async (category: Category) => {
    setNotice(null);
    const usage = categoryUsage(category.id, transactions, categories);
    if (usage.transactions > 0 || usage.children > 0) {
      setNotice(strings.categories.cannotDelete(usage.transactions, usage.children));
      return;
    }
    if (!window.confirm(strings.categories.confirmDelete(category.name))) return;
    try {
      await save({ categories: { update: [softDelete(category)] } });
    } catch (error) {
      setNotice(userMessage(error));
    }
  };

  const row = (category: Category, isChild: boolean) => (
    <li
      key={category.id}
      className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-2 last:border-b-0 ${isChild ? 'pl-6' : ''}`}
    >
      <span className="min-w-0 truncate">
        {isChild && <span aria-hidden="true">↳ </span>}
        {category.name}
      </span>
      <span className="flex gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => setEditing(category)}>
          {strings.common.edit}
        </button>
        <button type="button" className={dangerButtonClass} onClick={() => void remove(category)}>
          {strings.common.delete}
        </button>
      </span>
    </li>
  );

  return (
    <Card title={strings.categories.title} className="mb-4">
      {notice && (
        <p role="alert" className={`${alertClass} mb-3`}>
          {notice}
        </p>
      )}

      {editing !== null && (
        <CategoryForm
          key={editing === 'new' ? 'new' : editing.id}
          category={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {CATEGORY_KINDS.map((kind) => {
        const ofKind = categories.filter((c) => c.kind === kind);
        const topLevel = ofKind.filter((c) => c.parent_id === null).sort(byName);
        if (topLevel.length === 0) return null;
        return (
          <section key={kind} aria-label={strings.categories.kinds[kind]} className="mb-3">
            <h3 className="mt-2 text-sm font-semibold text-slate-700">
              {strings.categories.kinds[kind]}
            </h3>
            <ul>
              {topLevel.flatMap((parent) => [
                row(parent, false),
                ...ofKind
                  .filter((c) => c.parent_id === parent.id)
                  .sort(byName)
                  .map((child) => row(child, true)),
              ])}
            </ul>
          </section>
        );
      })}

      {editing === null && (
        <button type="button" className={`${buttonClass} mt-2`} onClick={() => setEditing('new')}>
          {strings.categories.add}
        </button>
      )}
    </Card>
  );
}
