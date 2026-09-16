import {sql} from "drizzle-orm";
import {sqliteTable,text,integer,index,check} from "drizzle-orm/sqlite-core";
export const projects=sqliteTable("projects",{
  id:text("id").primaryKey(),userId:text("user_id").notNull(),name:text("name").notNull(),description:text("description").notNull().default(""),createdAt:text("created_at").notNull()
},t=>[index("idx_projects_user_created").on(t.userId,t.createdAt)]);
export const tasks=sqliteTable("tasks",{
  id:text("id").primaryKey(),projectId:text("project_id").notNull().references(()=>projects.id),title:text("title").notNull(),notes:text("notes").notNull().default(""),assignee:text("assignee").notNull().default(""),dueDate:text("due_date"),status:text("status").notNull().default("OPEN"),version:integer("version").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},t=>[index("idx_tasks_project_created").on(t.projectId,t.createdAt),check("task_status",sql`${t.status} IN ('OPEN','IN_PROGRESS','BLOCKED','DONE')`)]);
