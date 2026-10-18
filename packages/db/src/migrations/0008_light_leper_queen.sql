CREATE TABLE "trip_share_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_share_link" ADD CONSTRAINT "trip_share_link_booking_id_seat_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."seat_booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_share_link_token_hash_idx" ON "trip_share_link" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "trip_share_link_booking_id_idx" ON "trip_share_link" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_share_link_active_booking_idx" ON "trip_share_link" USING btree ("booking_id") WHERE "trip_share_link"."revoked_at" IS NULL;