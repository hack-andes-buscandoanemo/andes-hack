import { and, desc, eq } from "drizzle-orm";

import { db } from "./index";
import { task } from "./schema/task";

export type Task = typeof task.$inferSelect;

export function listTasks(userId: string) {
  return db.select().from(task).where(eq(task.userId, userId)).orderBy(desc(task.createdAt));
}

export async function createTask(userId: string, title: string): Promise<Task> {
  const [created] = await db.insert(task).values({ title, userId }).returning();
  if (!created) throw new Error("Could not create the task");
  return created;
}

export async function setTaskCompleted(userId: string, id: number, completed: boolean) {
  await db
    .update(task)
    .set({ completed })
    .where(and(eq(task.id, id), eq(task.userId, userId)));
}

export async function deleteTask(userId: string, id: number) {
  await db.delete(task).where(and(eq(task.id, id), eq(task.userId, userId)));
}
