import type { Category } from '../data/schema';
import { fail, type Result } from './result';
import { uuidv7 } from './uuid7';

export type CategoryIssue = 'name' | 'name_taken' | 'parent';

export interface CategoryInput {
  name: string;
  kind: Category['kind'];
  /** Categoria madre (un solo livello di gerarchia), o null. */
  parentId: string | null;
}

function resolve(
  input: CategoryInput,
  all: readonly Category[],
  self: Category | null,
): Result<Pick<Category, 'name' | 'kind' | 'parent_id'>, CategoryIssue> {
  const issues: CategoryIssue[] = [];
  const name = input.name.trim();
  if (name === '') issues.push('name');
  else if (
    all.some(
      (c) =>
        c.id !== self?.id &&
        c.kind === input.kind &&
        c.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    issues.push('name_taken');
  }

  if (input.parentId !== null) {
    const parent = all.find((c) => c.id === input.parentId);
    const hasChildren = self !== null && all.some((c) => c.parent_id === self.id);
    const valid =
      parent !== undefined &&
      parent.id !== self?.id &&
      parent.parent_id === null && // la madre deve essere di primo livello
      parent.kind === input.kind &&
      !hasChildren; // una categoria con figlie non può diventare figlia
    if (!valid) issues.push('parent');
  }

  if (issues.length > 0) return fail(issues);
  return { ok: true, value: { name, kind: input.kind, parent_id: input.parentId } };
}

/** `all`: categorie attive, per controllare nomi duplicati (nello stesso tipo) e madre valida. */
export function createCategory(
  input: CategoryInput,
  all: readonly Category[],
  now: Date = new Date(),
  newId: () => string = () => uuidv7(now.getTime()),
): Result<Category, CategoryIssue> {
  const fields = resolve(input, all, null);
  if (!fields.ok) return fields;
  const timestamp = now.toISOString();
  return {
    ok: true,
    value: {
      id: newId(),
      created_at: timestamp,
      updated_at: timestamp,
      deleted: false,
      color: '',
      icon: '',
      ...fields.value,
    },
  };
}

export function updateCategory(
  category: Category,
  input: CategoryInput,
  all: readonly Category[],
  now: Date = new Date(),
): Result<Category, CategoryIssue> {
  const fields = resolve(input, all, category);
  if (!fields.ok) return fields;
  return { ok: true, value: { ...category, ...fields.value, updated_at: now.toISOString() } };
}
