import type { CategoryKey, Todo } from "../types";

type SqlTodo = {
  id: string; title: string; notes: string; due_date: string | null; start_time: string | null;
  category: CategoryKey; completed: number; created_at: string; updated_at: string;
};

const FALLBACK_KEY = "rihe.todos.v2";
const isTauri = () => "__TAURI_INTERNALS__" in window;
const fromSql = (row: SqlTodo): Todo => ({ id: row.id, title: row.title, notes: row.notes, date: row.due_date, time: row.start_time || "", category: row.category, done: Boolean(row.completed), createdAt: row.created_at, updatedAt: row.updated_at });

async function database() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load("sqlite:rihe.db");
}

export const todoRepository = {
  async list(): Promise<Todo[]> {
    if (!isTauri()) {
      try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]"); } catch { return []; }
    }
    const db = await database();
    const rows = await db.select<SqlTodo[]>("SELECT id, title, notes, due_date, start_time, category, completed, created_at, updated_at FROM todos WHERE deleted_at IS NULL ORDER BY due_date IS NULL, due_date, start_time");
    return rows.map(fromSql);
  },
  async save(todo: Todo): Promise<void> {
    if (!isTauri()) {
      const todos = await this.list();
      const index = todos.findIndex((item) => item.id === todo.id);
      if (index >= 0) todos[index] = todo; else todos.push(todo);
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(todos));
      return;
    }
    const db = await database();
    await db.execute(`INSERT INTO todos (id,title,notes,due_date,start_time,category,completed,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(id) DO UPDATE SET title=$2,notes=$3,due_date=$4,start_time=$5,category=$6,completed=$7,updated_at=$9,deleted_at=NULL`,
      [todo.id, todo.title, todo.notes, todo.date, todo.time || null, todo.category, todo.done ? 1 : 0, todo.createdAt, todo.updatedAt]);
  },
  async remove(id: string): Promise<void> {
    if (!isTauri()) {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify((await this.list()).filter((item) => item.id !== id)));
      return;
    }
    const db = await database();
    await db.execute("UPDATE todos SET deleted_at=$1, updated_at=$1 WHERE id=$2", [new Date().toISOString(), id]);
  },
  async replaceAll(todos: Todo[]): Promise<void> {
    if (!isTauri()) {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(todos));
      return;
    }
    const db = await database();
    await db.execute("BEGIN IMMEDIATE");
    try {
      await db.execute("DELETE FROM todos");
      for (const todo of todos) {
        await db.execute(`INSERT INTO todos (id,title,notes,due_date,start_time,category,completed,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [todo.id, todo.title, todo.notes, todo.date, todo.time || null, todo.category, todo.done ? 1 : 0, todo.createdAt, todo.updatedAt]);
      }
      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  },
  async mergeAll(imported: Todo[]): Promise<void> {
    const local = await this.list();
    const merged = new Map(local.map((todo) => [todo.id, todo]));
    for (const todo of imported) {
      const existing = merged.get(todo.id);
      if (!existing || todo.updatedAt > existing.updatedAt) merged.set(todo.id, todo);
    }
    if (!isTauri()) {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify([...merged.values()]));
      return;
    }
    for (const todo of merged.values()) await this.save(todo);
  },
};
