import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  index,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const taskSchema = pgTable(
  'tasks',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    userId: varchar('user_id', { length: 100 })
      .notNull()
      .references(() => userSchema.id),
    link: varchar('link', { length: 200 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      taskUserIdIdx: index('task_user_id_idx').on(table.userId),
    };
  },
);

export const userSchema = pgTable(
  'users',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    point: bigint('point', { mode: 'number' }).default(0).notNull(),
    twitterProfileLink: varchar('twitter_profile_link', {
      length: 200,
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('user_id_idx').on(table.id),
    };
  },
);

export type Task = InferSelectModel<typeof taskSchema>;
export type NewTask = InferInsertModel<typeof taskSchema>;

export type User = InferSelectModel<typeof userSchema>;
export type NewUser = InferInsertModel<typeof userSchema>;
