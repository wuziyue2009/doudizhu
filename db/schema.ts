import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{code:text('code').primaryKey(),owner:text('owner').notNull(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),created:integer('created').notNull(),updated:integer('updated').notNull()},t=>[index('idx_rooms_owner_created').on(t.owner,t.created)]);
