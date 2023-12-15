import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const groupSchema = pgTable('groups', {
  id: varchar('id', { length: 100 }).primaryKey(),
  groupName: varchar('group_name', { length: 200 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const resultSchema = pgTable(
  'results',
  {
    userId: varchar('user_id', { length: 100 })
      .notNull()
      .references(() => userSchema.id),
    groupId: varchar('group_id', { length: 100 })
      .notNull()
      .references(() => groupSchema.id),
    point: bigint('point', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.userId, table.groupId] }),
    };
  },
);

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

export const twitterCookieSchema = pgTable('twitter_cookies', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: varchar('username', { length: 50 }).unique(),
  password: varchar('password', { length: 50 }).notNull(),
  cookies: varchar('cookies', { length: 500 }).default('').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userSchema = pgTable(
  'users',
  {
    id: varchar('id', { length: 100 }).primaryKey(),
    username: varchar('user_name', { length: 100 }).default('').notNull(),
    fullName: varchar('full_name', { length: 200 }).notNull(),
    twitterProfileLink: varchar('twitter_profile_link', {
      length: 200,
    })
      .default('')
      .notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    isGroupAdmin: boolean('is_group_admin').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      userIdIdx: index('user_id_idx').on(table.id),
    };
  },
);

export type Group = InferSelectModel<typeof groupSchema>;
export type NewGroup = InferInsertModel<typeof groupSchema>;

export type Result = InferSelectModel<typeof resultSchema>;
export type NewResult = InferInsertModel<typeof resultSchema>;

export type Task = InferSelectModel<typeof taskSchema>;
export type NewTask = InferInsertModel<typeof taskSchema>;

export type TwitterCookie = InferSelectModel<typeof twitterCookieSchema>;
export type NewTwitterCookie = InferInsertModel<typeof twitterCookieSchema>;

export type User = InferSelectModel<typeof userSchema>;
export type NewUser = InferInsertModel<typeof userSchema>;
