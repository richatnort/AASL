CREATE TABLE "saved_meal_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"saved_meal_id" integer NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD COLUMN "saved_meal_id" integer;
--> statement-breakpoint
ALTER TABLE "saved_meal_ingredients" ADD CONSTRAINT "saved_meal_ingredients_saved_meal_id_saved_meals_id_fk" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meal_plan_items" ADD CONSTRAINT "meal_plan_items_saved_meal_id_saved_meals_id_fk" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals"("id") ON DELETE set null ON UPDATE no action;
