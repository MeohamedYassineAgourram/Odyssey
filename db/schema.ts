import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const troyProfiles = sqliteTable('troy_profiles', {
  userId: text('user_id').primaryKey(), xp: integer('xp').notNull().default(0),
  best: integer('best').notNull().default(0), total: integer('total').notNull().default(0),
  runs: integer('runs').notNull().default(0), clears: integer('clears').notNull().default(0),
  stage: integer('stage').notNull().default(1), endings: text('endings').notNull().default('[]'),
  lastEnding: text('last_ending'), updatedAt: integer('updated_at').notNull().default(0),
});

export const troyRunReceipts = sqliteTable('troy_run_receipts', {
  runId: text('run_id').primaryKey(), userId: text('user_id').notNull(),
  stage: integer('stage').notNull(), xp: integer('xp').notNull(), xpBefore: integer('xp_before').notNull(),
  breakdown: text('breakdown').notNull(), score: integer('score').notNull(),
  ending: text('ending').notNull(), outcome: text('outcome').notNull(),
  applied: integer('applied').notNull().default(0), createdAt: integer('created_at').notNull(),
}, table => [index('idx_troy_run_receipts_user_id').on(table.userId)]);
