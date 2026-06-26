import { pgTable, serial, timestamp, varchar, jsonb, numeric, boolean, date, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户持仓快照（JSONB存储完整的holdings数组）
export const portfolio = pgTable("portfolio", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	holdings: jsonb("holdings").notNull().default('[]'),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("portfolio_user_id_idx").on(table.userId),
]);

// 交易记录
export const transactions = pgTable("transactions", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	fundCode: varchar("fund_code", { length: 10 }).notNull(),
	fundName: varchar("fund_name", { length: 200 }).notNull(),
	direction: varchar("direction", { length: 10 }).notNull(), // buy / sell
	amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
	shares: numeric("shares", { precision: 14, scale: 4 }),
	nav: numeric("nav", { precision: 10, scale: 4 }),
	fee: numeric("fee", { precision: 10, scale: 2 }),
	feeRate: numeric("fee_rate", { precision: 6, scale: 4 }),
	platform: varchar("platform", { length: 50 }),
	before15: boolean("before15"),
	transactionDate: varchar("transaction_date", { length: 10 }).notNull(), // YYYY-MM-DD
	confirmDate: varchar("confirm_date", { length: 10 }), // T+1 ~ T+2
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("transactions_user_id_idx").on(table.userId),
	index("transactions_fund_code_idx").on(table.fundCode),
	index("transactions_date_idx").on(table.transactionDate),
]);

// 每日收益快照
export const dailySnapshots = pgTable("daily_snapshots", {
	id: serial("id").primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	snapshotDate: date("snapshot_date").notNull(),
	totalAssets: numeric("total_assets", { precision: 14, scale: 2 }),
	totalReturn: numeric("total_return", { precision: 14, scale: 2 }),
	dailyReturn: numeric("daily_return", { precision: 14, scale: 2 }),
	holdingsJson: jsonb("holdings_json"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
	index("snapshots_user_id_idx").on(table.userId),
	index("snapshots_date_idx").on(table.snapshotDate),
	index("snapshots_user_date_idx").on(table.userId, table.snapshotDate),
]);