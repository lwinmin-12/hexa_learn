# Books API

Books attach to exactly one course or chapter. Existing course creation needs no
books. Admin requests use the existing super_admin/page_admin bearer auth.
Page admins receive 404 for another admin's course, chapter, or book.
Learners need a verified phone and enrollment for premium courses.

## Configure storage and apply the migration

Add these values to `.env`:

```dotenv
S3_BUCKET_BOOKS=hexa-books
BOOK_MAX_MB=50
```

`BOOK_MAX_MB` is the PDF file limit in MiB. The default is 50. Set it to a positive
number. Restart the API after changes.

Run `npm run storage:init` and `npm run db:migrate`. The generated SQL is in
[20261024000000_books/migration.sql](../prisma/migrations/20261024000000_books/migration.sql).
It creates `books`, both parent/position indexes, cascading foreign keys, and:

```sql
ALTER TABLE books ADD CONSTRAINT books_one_parent
CHECK ((course_id IS NOT NULL)::int + (chapter_id IS NOT NULL)::int = 1);
```

The migration also adds Japanese demo rows using the existing demo course slugs.
They cover view-only, download-only, and both permissions. These rows have
placeholder file keys and size zero. Replace each placeholder PDF with a real
upload before using its preview. There is no separate Prisma seed script in this
repository; the existing Japanese seed uses migrations.

The Books bucket is private. Provisioning adds no public ACL or public policy
and rejects existing public ACLs or wildcard Allow policies. Keep anonymous
`s3:GetObject` disabled. Application credentials need object put/get/delete;
provisioning credentials also need bucket create/head, ACL/policy inspection,
and CORS configuration. With MinIO, leave anonymous access set to `none`.
For AWS S3, keep all Block Public Access settings enabled and use Bucket owner
enforced object ownership. No public policy is needed for presigned GETs.

## Upload or replace a PDF

Uploads are a single multipart request. There is no upload-URL or confirmation
endpoint. These shell variables stand for your API, admin token, and resource IDs:

```bash
API=http://localhost:3000/api/v1
TOKEN=your_admin_bearer_token
COURSE_ID=your_course_uuid
CHAPTER_ID=your_chapter_uuid
BOOK_ID=your_book_uuid
```

Create a course book:

```bash
curl --fail-with-body "$API/admin/courses/$COURSE_ID/books" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'title=N5 Vocabulary Handbook' \
  -F 'description=Vocabulary with English glosses' \
  -F 'canView=true' -F 'canDownload=false' -F 'status=published' \
  -F 'file=@./n5-vocabulary.pdf;type=application/pdf'
```

Create a chapter book:

```bash
curl --fail-with-body "$API/admin/chapters/$CHAPTER_ID/books" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'title=Hiragana Practice Sheets' \
  -F 'canView=false' -F 'canDownload=true' -F 'status=published' \
  -F 'file=@./hiragana.pdf;type=application/pdf'
```

Replace a file without changing its metadata or permissions:

```bash
curl --fail-with-body -X PUT "$API/admin/books/$BOOK_ID/file" \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@./revised-hiragana.pdf;type=application/pdf'
```

Text fields and ownership are validated before S3. Multipart data is staged to a
random temporary disk file, bounded by Multer, then streamed to S3. Files must
have a `.pdf` extension, `application/pdf` MIME type, and `%PDF-` signature.
Filename paths/control characters are stripped and names are capped at 150
characters. Temporary files are deleted after success or failure, including DTO
validation failures. `pageCount` is null because no inexpensive PDF parser is
installed. No whole-file buffer or new parser dependency is used.

`canView` and `canDownload` accept multipart strings `true` and `false` explicitly.
Defaults are true and false. Status defaults to draft. A published book needs
at least one enabled mode or the API returns 400 `BOOK_NO_ACCESS_MODE`.
Invalid files return 400 `BOOK_INVALID_FILE`; oversized uploads return 413
`BOOK_TOO_LARGE`. Invalid text uses the existing `VALIDATION_ERROR` response.

## Admin endpoints and responses

| Method | Path | Result |
| --- | --- | --- |
| POST | `/admin/courses/:id/books` | Create course book, 201 |
| POST | `/admin/chapters/:id/books` | Create chapter book, 201 |
| GET | `/admin/courses/:id/books` | Paginated direct and chapter books |
| GET | `/admin/books/:id` | Metadata and one-hour inline `previewUrl` |
| PATCH | `/admin/books/:id` | Update any subset of editable fields |
| PUT | `/admin/books/:id/file` | Replace PDF and queue old object cleanup |
| DELETE | `/admin/books/:id` | Delete row and queue object cleanup |
| PUT | `/admin/courses/:id/books/reorder` | Reorder direct course books |
| PUT | `/admin/chapters/:id/books/reorder` | Reorder chapter books |

Lists accept `page`, `limit`, `scope=course|chapter`, `chapterId`, and `search`.
Search matches the title case-insensitively. Default pagination follows `PageDto`.
Combining `scope=course` with a chapterId yields an empty list. A foreign chapterId
returns 404. Reorder bodies are `{ "ids": ["uuid", "uuid"] }` containing exactly
the existing siblings; invalid sibling sets return `INVALID_REORDER`.

Create, PATCH, and replacement share this metadata shape. This example abbreviates IDs:

```json
{
  "id": "book-uuid",
  "title": "N5 Vocabulary Handbook",
  "description": "Vocabulary with English glosses",
  "fileName": "n5-vocabulary.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": "123456",
  "pageCount": null,
  "canView": true,
  "canDownload": false,
  "status": "published",
  "position": 1,
  "scope": "course",
  "attachedTo": { "type": "course", "id": "course-uuid", "title": "Japanese N5" },
  "createdAt": "2026-10-24T06:44:00.000Z"
}
```

`sizeBytes` is a decimal string so PostgreSQL BigInt values are JSON-safe.
Chapter books use `scope: "chapter"` and the chapter in `attachedTo`.
Admin detail adds `"previewUrl": "https://storage.example/...signed-query..."`.
List responses use `{ "data": [metadata], "meta": { "page": 1, "limit": 20,
"total": 1 } }`. Delete returns `{ "deleted": true }`; reorder returns
`{ "ids": ["book-uuid"] }`. No metadata response includes `fileKey`.

PATCH accepts `title`, `description`, `canView`, `canDownload`, or `status`
independently. Omitted fields are preserved. `description: null` clears it.
Permissions/status are checked against their final values within the transaction.
Title and permission/status fields cannot be null.

Course and chapter deletion collect associated book keys before database cascade
and queue their deletion. Cleanup jobs use the existing retry/backoff policy.
If Redis enqueueing fails after a committed mutation, the new row/file stays
valid but an obsolete object can remain. An outbox is outside this change.
Failed database saves after uploads delete the new object best effort and log
cleanup failures. Failed S3 uploads create no row.

## Learner endpoints and responses

| Method | Path | Result |
| --- | --- | --- |
| GET | `/courses/:id/books` | Published course-level book metadata |
| GET | `/chapters/:id/books` | Published chapter book metadata |
| GET | `/books/:id/view` | Five-minute signed inline PDF URL |
| GET | `/books/:id/download` | Five-minute signed attachment URL |

List responses are arrays without URLs:

```json
[
  {
    "id": "book-uuid",
    "title": "N5 Vocabulary Handbook",
    "description": "Vocabulary with English glosses",
    "sizeBytes": "123456",
    "pageCount": null,
    "canView": true,
    "canDownload": false
  }
]
```

View and download responses have the same envelope:

```json
{
  "url": "https://storage.example/...signed-query...",
  "expiresAt": "2026-10-24T06:49:00.000Z"
}
```

The signed request sets `ResponseContentType=application/pdf` and
`ResponseContentDisposition=inline` or `attachment`, including a sanitized
filename with UTF-8 encoding. Fetch a fresh URL after expiry. Published books
under draft courses/chapters are invisible. Disabled modes return 403
`BOOK_VIEW_DISABLED` or `BOOK_DOWNLOAD_DISABLED`. Premium access returns 403
`ENROLLMENT_REQUIRED`. Viewing allows the browser to receive PDF bytes, so
`canDownload=false` gates the download endpoint and cannot prevent saving viewed
content. Previously issued signed URLs remain usable until their expiry.

Learner course `bookCount` totals published direct books plus published books
in published chapters. Chapter `bookCount` counts that chapter's published books.
Admin course content counts all direct and chapter books, including drafts, and
includes each chapter's own count. Counts do not include storage keys or URLs.

## Proxy limits and timeouts

Keep the existing Express JSON/urlencoded limits. They do not parse multipart
requests and therefore do not constrain these uploads. Do not log multipart
bodies at the proxy or application. This app has no request-body logger; the
installed Observe integration records method traces without serializing request
arguments or multipart file contents.

The Node HTTP server defaults to a 300-second request-body timeout. S3 disk
streaming uses a 300-second timeout. Allow 600 seconds at the client and proxy
for upload plus storage processing. Reserve disk space for the maximum file
size times simultaneous uploads, and mount the OS temp directory with appropriate
access controls. Keep the proxy limit above the file cap to allow multipart
overhead. For the default 50 MiB cap, use 55 MiB:

```nginx
location /api/ {
    client_max_body_size 55m;
    client_body_timeout 300s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    proxy_pass http://127.0.0.1:3000;
}
```

For Caddy 2, add a request-body cap around the API reverse proxy:

```caddyfile
handle /api/* {
    request_body {
        max_size 55MiB
    }
    reverse_proxy 127.0.0.1:3000 {
        transport http {
            response_header_timeout 600s
        }
    }
}
```

Adjust these values with `BOOK_MAX_MB`. Proxy-generated 413 errors occur before
the API and may use the proxy's error body. The API's Multer limit returns the
structured `BOOK_TOO_LARGE` code.

Directive references are the official [nginx body-size limit](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size),
[nginx proxy timeout](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_read_timeout),
[Caddy request body](https://caddyserver.com/docs/caddyfile/directives/request_body),
and [Caddy HTTP transport](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#the-http-transport) documentation.

## Verify

Use Node 24 as required by the installed dependencies. Generate/build first.

```bash
npm run build
npm run test:platform
RUN_DATABASE_TESTS=1 npm run test:platform
RUN_STORAGE_TESTS=1 npm run test:platform
```

Database tests create and drop isolated schemas. Storage tests create temporary
objects and delete them afterward. Books storage tests verify unsigned GET is
403 and signed PDF responses include the requested disposition and five-minute
expiry. The native Book parent CHECK is tested with both missing and both set.

The schema follows the requested model. `ContentStatus` still contains scheduled
for other content; Book DTOs accept only draft/published. Page counts stay
nullable, and existing timestamp column types are unchanged. No new dependency
or optional dashboard UI is included.

## Changed files

- `.env.example`
- `README.md`
- `docs/books.md`
- `prisma/migrations/20261024000000_books/migration.sql`
- `prisma/schema.prisma`
- `scripts/setup-storage.mjs`
- `src/admin-content/admin-content.service.ts`
- `src/books/book-upload.interceptor.ts`
- `src/books/books.controller.ts`
- `src/books/books.dto.ts`
- `src/books/books.module.ts`
- `src/books/books.service.ts`
- `src/courses/courses.service.ts`
- `src/platform/ownership.service.ts`
- `src/platform/platform.module.ts`
- `src/platform/storage.service.ts`
- `src/progress/progress.service.ts`
- `test/platform/admin-episodes.test.mjs`
- `test/platform/books-database.test.mjs`
- `test/platform/books.test.mjs`
- `test/platform/routes.json`
- `test/platform/storage-books.test.mjs`
- `test/platform/storage-live.test.mjs`
- `test/platform/storage-setup.test.mjs`
