-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "course_id" UUID,
    "chapter_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "page_count" INTEGER,
    "can_view" BOOLEAN NOT NULL DEFAULT true,
    "can_download" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "books_course_id_position_idx" ON "books"("course_id", "position");

-- CreateIndex
CREATE INDEX "books_chapter_id_position_idx" ON "books"("chapter_id", "position");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE books ADD CONSTRAINT books_one_parent CHECK ((course_id IS NOT NULL)::int + (chapter_id IS NOT NULL)::int = 1);

INSERT INTO books (id, course_id, title, description, file_key, file_name, mime_type, size_bytes, can_view, can_download, status, position, updated_at)
SELECT gen_random_uuid(), c.id, 'N5 Vocabulary Handbook', 'Japanese N5 vocabulary with English glosses. Demo placeholder PDF.',
       'books/' || c.id || '/demo-n5-vocabulary.pdf', 'n5-vocabulary-handbook.pdf', 'application/pdf', 0, true, true, 'published', 1, CURRENT_TIMESTAMP
FROM courses c WHERE c.slug = 'demo-japanese-jlpt-n5-grammar'
AND NOT EXISTS (SELECT 1 FROM books b WHERE b.course_id = c.id AND b.file_name = 'n5-vocabulary-handbook.pdf');

INSERT INTO books (id, chapter_id, title, description, file_key, file_name, mime_type, size_bytes, can_view, can_download, status, position, updated_at)
SELECT gen_random_uuid(), ch.id, 'Hiragana Practice Sheets', 'Trace and read hiragana. Demo placeholder PDF.',
       'books/' || c.id || '/demo-hiragana-practice.pdf', 'hiragana-practice-sheets.pdf', 'application/pdf', 0, false, true, 'published', 1, CURRENT_TIMESTAMP
FROM chapters ch JOIN courses c ON c.id = ch.course_id
WHERE c.slug = 'demo-japanese-kana-starter' AND ch.title = 'Hiragana and first words'
AND NOT EXISTS (SELECT 1 FROM books b WHERE b.chapter_id = ch.id AND b.file_name = 'hiragana-practice-sheets.pdf');

INSERT INTO books (id, course_id, title, description, file_key, file_name, mime_type, size_bytes, can_view, can_download, status, position, updated_at)
SELECT gen_random_uuid(), c.id, 'Everyday Japanese Phrasebook', 'Useful greetings and polite requests. Demo placeholder PDF.',
       'books/' || c.id || '/demo-japanese-phrasebook.pdf', 'everyday-japanese-phrasebook.pdf', 'application/pdf', 0, true, false, 'published', 1, CURRENT_TIMESTAMP
FROM courses c WHERE c.slug = 'demo-japanese-daily-conversation'
AND NOT EXISTS (SELECT 1 FROM books b WHERE b.course_id = c.id AND b.file_name = 'everyday-japanese-phrasebook.pdf');
