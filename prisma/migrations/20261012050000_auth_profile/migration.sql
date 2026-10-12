ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3),
                    ADD COLUMN "firebase_deleted_at" TIMESTAMP(3);

CREATE TABLE "phone_verifications" (
    "user_id" UUID NOT NULL,
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "session_info" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "phone_verifications_id_key" ON "phone_verifications"("id");
