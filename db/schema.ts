import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const worlds = sqliteTable('worlds', {owner:text('owner').primaryKey(),state:text('state').notNull(),version:integer('version').notNull().default(0),lockedUntil:integer('locked_until').notNull().default(0)});
