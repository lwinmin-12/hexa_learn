BEGIN;

DO $demo$
DECLARE
  user_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 3));
  course_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 3));
  chapter_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 6));
  episode_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 12));
  flashcard_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 36));
  quiz_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 6));
  question_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 12));
  option_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 48));
  enrollment_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 4));
  channel_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 3));
  message_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 3));
  notification_ids uuid[] := ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 4));
BEGIN
INSERT INTO "users" ("id", "firebase_uid", "provider", "email", "display_name", "role") VALUES
  (user_ids[1], 'demo-japanese-teacher', 'google', 'japanese.teacher@example.com', 'Japanese Demo Teacher', 'page_admin'),
  (user_ids[2], 'demo-japanese-learner-a', 'google', 'japanese.learner.a@example.com', 'Alex Demo', 'learner'),
  (user_ids[3], 'demo-japanese-learner-b', 'google', 'japanese.learner.b@example.com', 'Sam Demo', 'learner');

INSERT INTO "courses" ("id", "owner_id", "title", "slug", "description", "is_premium", "status") VALUES
  (course_ids[1], user_ids[1], 'Japanese Kana Starter', 'demo-japanese-kana-starter', 'Read your first hiragana and katakana words with English glosses.', false, 'published'),
  (course_ids[2], user_ids[1], 'JLPT N5 Grammar Foundations', 'demo-japanese-jlpt-n5-grammar', 'Practice beginner sentence patterns, particles, and polite verbs.', false, 'published'),
  (course_ids[3], user_ids[1], 'Everyday Japanese Conversation', 'demo-japanese-daily-conversation', 'Practice greetings, introductions, shopping, and ordering politely.', false, 'published');

INSERT INTO "chapters" ("id", "course_id", "title", "position", "status") VALUES
  (chapter_ids[1], course_ids[1], 'Hiragana and first words', 1, 'published'),
  (chapter_ids[2], course_ids[1], 'Katakana for everyday words', 2, 'published'),
  (chapter_ids[3], course_ids[2], 'Introductions and basic particles', 1, 'published'),
  (chapter_ids[4], course_ids[2], 'Polite verbs and daily routines', 2, 'published'),
  (chapter_ids[5], course_ids[3], 'Greetings and introductions', 1, 'published'),
  (chapter_ids[6], course_ids[3], 'At a cafe and in town', 2, 'published');

INSERT INTO "episodes" ("id", "chapter_id", "title", "description", "position", "status", "video_upload_status") VALUES
  (episode_ids[1], chapter_ids[1], 'Hiragana vowels', 'あ・い・う・え・お represent a, i, u, e, o. Read あお as ao, meaning blue.', 1, 'published', 'pending'),
  (episode_ids[2], chapter_ids[1], 'Reading short words', 'Read ねこ as neko, cat, and いぬ as inu, dog. Each kana normally represents one mora.', 2, 'published', 'pending'),
  (episode_ids[3], chapter_ids[2], 'Katakana basics', 'Katakana often represents loanwords. カメラ is kamera, camera, and テレビ is terebi, television.', 1, 'published', 'pending'),
  (episode_ids[4], chapter_ids[2], 'Long vowels in katakana', 'The mark ー lengthens the preceding vowel. コーヒー is koohii, coffee; タクシー is takushii, taxi.', 2, 'published', 'pending'),
  (episode_ids[5], chapter_ids[3], 'The A は B です pattern', 'わたしは学生です。 means I am a student. The topic particle は is pronounced wa.', 1, 'published', 'pending'),
  (episode_ids[6], chapter_ids[3], 'Questions and possession', '学生ですか。 asks Are you a student? わたしの本 means my book. の connects a possessor to a noun.', 2, 'published', 'pending'),
  (episode_ids[7], chapter_ids[4], 'Polite present verbs', '毎日、日本語を勉強します。 means I study Japanese every day. を marks the direct object and is pronounced o.', 1, 'published', 'pending'),
  (episode_ids[8], chapter_ids[4], 'Places and destinations', '図書館で勉強します。 means I study at the library. 学校に行きます。 means I go to school. で marks the location of an action; に can mark a destination.', 2, 'published', 'pending'),
  (episode_ids[9], chapter_ids[5], 'Polite greetings', 'おはようございます is a polite good morning. こんにちは means hello or good afternoon. こんばんは means good evening.', 1, 'published', 'pending'),
  (episode_ids[10], chapter_ids[5], 'Introducing yourself', 'はじめまして。アレックスです。よろしくお願いします。 is a common introduction: Nice to meet you. I am Alex. I look forward to getting to know you.', 2, 'published', 'pending'),
  (episode_ids[11], chapter_ids[6], 'Ordering at a cafe', 'コーヒーを一つください。 means One coffee, please. お水をください。 means Water, please.', 1, 'published', 'pending'),
  (episode_ids[12], chapter_ids[6], 'Asking for help', 'すみません。駅はどこですか。 means Excuse me. Where is the station? いくらですか。 asks How much is it?', 2, 'published', 'pending');

INSERT INTO "flashcards" ("id", "chapter_id", "front_text", "back_text", "position") VALUES
  (flashcard_ids[1], chapter_ids[1], 'あ', 'a; hiragana vowel', 1),
  (flashcard_ids[2], chapter_ids[1], 'い', 'i; hiragana vowel', 2),
  (flashcard_ids[3], chapter_ids[1], 'う', 'u; hiragana vowel', 3),
  (flashcard_ids[4], chapter_ids[1], 'え', 'e; hiragana vowel', 4),
  (flashcard_ids[5], chapter_ids[1], 'お', 'o; hiragana vowel', 5),
  (flashcard_ids[6], chapter_ids[1], 'ねこ', 'neko; cat', 6),
  (flashcard_ids[7], chapter_ids[2], 'カメラ', 'kamera; camera', 1),
  (flashcard_ids[8], chapter_ids[2], 'テレビ', 'terebi; television', 2),
  (flashcard_ids[9], chapter_ids[2], 'コーヒー', 'koohii; coffee', 3),
  (flashcard_ids[10], chapter_ids[2], 'タクシー', 'takushii; taxi', 4),
  (flashcard_ids[11], chapter_ids[2], 'パン', 'pan; bread', 5),
  (flashcard_ids[12], chapter_ids[2], 'ホテル', 'hoteru; hotel', 6),
  (flashcard_ids[13], chapter_ids[3], 'わたし', 'watashi; I / me', 1),
  (flashcard_ids[14], chapter_ids[3], '学生（がくせい）', 'gakusei; student', 2),
  (flashcard_ids[15], chapter_ids[3], '先生（せんせい）', 'sensei; teacher', 3),
  (flashcard_ids[16], chapter_ids[3], '本（ほん）', 'hon; book', 4),
  (flashcard_ids[17], chapter_ids[3], 'わたしの本', 'watashi no hon; my book', 5),
  (flashcard_ids[18], chapter_ids[3], '学生ですか。', 'Gakusei desu ka.; Are you a student?', 6),
  (flashcard_ids[19], chapter_ids[4], '食べます（たべます）', 'tabemasu; eat, polite nonpast', 1),
  (flashcard_ids[20], chapter_ids[4], '飲みます（のみます）', 'nomimasu; drink, polite nonpast', 2),
  (flashcard_ids[21], chapter_ids[4], '行きます（いきます）', 'ikimasu; go, polite nonpast', 3),
  (flashcard_ids[22], chapter_ids[4], '勉強します（べんきょうします）', 'benkyou shimasu; study, polite nonpast', 4),
  (flashcard_ids[23], chapter_ids[4], '毎日（まいにち）', 'mainichi; every day', 5),
  (flashcard_ids[24], chapter_ids[4], '図書館（としょかん）', 'toshokan; library', 6),
  (flashcard_ids[25], chapter_ids[5], 'おはようございます', 'ohayou gozaimasu; good morning, polite', 1),
  (flashcard_ids[26], chapter_ids[5], 'こんにちは', 'konnichiwa; hello / good afternoon', 2),
  (flashcard_ids[27], chapter_ids[5], 'こんばんは', 'konbanwa; good evening', 3),
  (flashcard_ids[28], chapter_ids[5], 'はじめまして', 'hajimemashite; nice to meet you, at a first meeting', 4),
  (flashcard_ids[29], chapter_ids[5], 'ありがとうございます', 'arigatou gozaimasu; thank you, polite', 5),
  (flashcard_ids[30], chapter_ids[5], 'さようなら', 'sayounara; goodbye', 6),
  (flashcard_ids[31], chapter_ids[6], 'すみません', 'sumimasen; excuse me / I am sorry', 1),
  (flashcard_ids[32], chapter_ids[6], 'お水（おみず）', 'omizu; water, polite', 2),
  (flashcard_ids[33], chapter_ids[6], '一つ（ひとつ）', 'hitotsu; one item', 3),
  (flashcard_ids[34], chapter_ids[6], 'ください', 'kudasai; please give me', 4),
  (flashcard_ids[35], chapter_ids[6], '駅（えき）', 'eki; train station', 5),
  (flashcard_ids[36], chapter_ids[6], 'いくらですか。', 'Ikura desu ka.; How much is it?', 6);

INSERT INTO "quizzes" ("id", "title", "pass_score", "chapter_id") VALUES
  (quiz_ids[1], 'Hiragana and first words review', 2, chapter_ids[1]),
  (quiz_ids[2], 'Katakana for everyday words review', 2, chapter_ids[2]),
  (quiz_ids[3], 'Introductions and basic particles review', 2, chapter_ids[3]),
  (quiz_ids[4], 'Polite verbs and daily routines review', 2, chapter_ids[4]),
  (quiz_ids[5], 'Greetings and introductions review', 2, chapter_ids[5]),
  (quiz_ids[6], 'At a cafe and in town review', 2, chapter_ids[6]);

INSERT INTO "quiz_questions" ("id", "quiz_id", "question_text", "position", "points", "explanation") VALUES
  (question_ids[1], quiz_ids[1], 'Which sound does あ represent?', 1, 1, 'あ represents a.'),
  (question_ids[2], quiz_ids[1], 'What does ねこ mean?', 2, 1, 'ねこ, neko, means cat.'),
  (question_ids[3], quiz_ids[2], 'Which word means coffee?', 1, 1, 'コーヒー means coffee. Each ー marks a long vowel.'),
  (question_ids[4], quiz_ids[2], 'What does テレビ mean?', 2, 1, 'テレビ is terebi, television.'),
  (question_ids[5], quiz_ids[3], 'How is the topic particle は pronounced?', 1, 1, 'As a topic particle, は is pronounced wa.'),
  (question_ids[6], quiz_ids[3], 'Which phrase means my book?', 2, 1, 'の connects わたし, I, to 本, book, to express possession.'),
  (question_ids[7], quiz_ids[4], 'Choose the particle: 日本語＿勉強します。', 1, 1, 'を marks 日本語 as the direct object of 勉強します.'),
  (question_ids[8], quiz_ids[4], 'Which sentence means I study at the library?', 2, 1, 'で marks where the action of studying takes place.'),
  (question_ids[9], quiz_ids[5], 'Which is a polite morning greeting?', 1, 1, 'おはようございます means good morning in polite speech.'),
  (question_ids[10], quiz_ids[5], 'When do you normally say はじめまして?', 2, 1, 'はじめまして is used when introducing yourself at a first meeting.'),
  (question_ids[11], quiz_ids[6], 'Which sentence asks where the station is?', 1, 1, 'どこ asks where. 駅はどこですか asks where the station is.'),
  (question_ids[12], quiz_ids[6], 'What does コーヒーを一つください。 mean?', 2, 1, '一つ means one item and ください makes a request.');

INSERT INTO "quiz_options" ("id", "question_id", "option_text", "is_correct", "position") VALUES
  (option_ids[1], question_ids[1], 'a', true, 1),
  (option_ids[2], question_ids[1], 'i', false, 2),
  (option_ids[3], question_ids[1], 'u', false, 3),
  (option_ids[4], question_ids[1], 'e', false, 4),
  (option_ids[5], question_ids[2], 'Dog', false, 1),
  (option_ids[6], question_ids[2], 'Cat', true, 2),
  (option_ids[7], question_ids[2], 'Book', false, 3),
  (option_ids[8], question_ids[2], 'Water', false, 4),
  (option_ids[9], question_ids[3], 'カメラ', false, 1),
  (option_ids[10], question_ids[3], 'ホテル', false, 2),
  (option_ids[11], question_ids[3], 'コーヒー', true, 3),
  (option_ids[12], question_ids[3], 'パン', false, 4),
  (option_ids[13], question_ids[4], 'Taxi', false, 1),
  (option_ids[14], question_ids[4], 'Bread', false, 2),
  (option_ids[15], question_ids[4], 'Camera', false, 3),
  (option_ids[16], question_ids[4], 'Television', true, 4),
  (option_ids[17], question_ids[5], 'wa', true, 1),
  (option_ids[18], question_ids[5], 'ha', false, 2),
  (option_ids[19], question_ids[5], 'o', false, 3),
  (option_ids[20], question_ids[5], 'ka', false, 4),
  (option_ids[21], question_ids[6], 'わたしは本', false, 1),
  (option_ids[22], question_ids[6], 'わたしの本', true, 2),
  (option_ids[23], question_ids[6], '本ですか', false, 3),
  (option_ids[24], question_ids[6], '学生の先生', false, 4),
  (option_ids[25], question_ids[7], 'に', false, 1),
  (option_ids[26], question_ids[7], 'の', false, 2),
  (option_ids[27], question_ids[7], 'を', true, 3),
  (option_ids[28], question_ids[7], 'か', false, 4),
  (option_ids[29], question_ids[8], '図書館に行きます。', false, 1),
  (option_ids[30], question_ids[8], '水を飲みます。', false, 2),
  (option_ids[31], question_ids[8], '本を読みます。', false, 3),
  (option_ids[32], question_ids[8], '図書館で勉強します。', true, 4),
  (option_ids[33], question_ids[9], 'おはようございます', true, 1),
  (option_ids[34], question_ids[9], 'こんばんは', false, 2),
  (option_ids[35], question_ids[9], 'さようなら', false, 3),
  (option_ids[36], question_ids[9], 'すみません', false, 4),
  (option_ids[37], question_ids[10], 'When ordering water', false, 1),
  (option_ids[38], question_ids[10], 'When meeting someone for the first time', true, 2),
  (option_ids[39], question_ids[10], 'When asking a price', false, 3),
  (option_ids[40], question_ids[10], 'When saying good night', false, 4),
  (option_ids[41], question_ids[11], '駅はいくらですか。', false, 1),
  (option_ids[42], question_ids[11], '駅は本です。', false, 2),
  (option_ids[43], question_ids[11], '駅はどこですか。', true, 3),
  (option_ids[44], question_ids[11], '駅をください。', false, 4),
  (option_ids[45], question_ids[12], 'Where is the coffee?', false, 1),
  (option_ids[46], question_ids[12], 'I do not drink coffee.', false, 2),
  (option_ids[47], question_ids[12], 'How much is coffee?', false, 3),
  (option_ids[48], question_ids[12], 'One coffee, please.', true, 4);

INSERT INTO "enrollments" ("id", "user_id", "course_id", "access_type", "status", "progress_pct") VALUES
  (enrollment_ids[1], user_ids[2], course_ids[1], 'free', 'active', 0),
  (enrollment_ids[2], user_ids[2], course_ids[2], 'free', 'active', 0),
  (enrollment_ids[3], user_ids[3], course_ids[1], 'free', 'active', 0),
  (enrollment_ids[4], user_ids[3], course_ids[3], 'free', 'active', 0);

INSERT INTO "channels" ("id", "course_id", "name") VALUES
  (channel_ids[1], course_ids[1], 'Japanese Kana Starter study group'),
  (channel_ids[2], course_ids[2], 'JLPT N5 Grammar Foundations study group'),
  (channel_ids[3], course_ids[3], 'Everyday Japanese Conversation study group');

INSERT INTO "channel_members" ("channel_id", "user_id") VALUES
  (channel_ids[1], user_ids[1]),
  (channel_ids[2], user_ids[1]),
  (channel_ids[3], user_ids[1]),
  (channel_ids[1], user_ids[2]),
  (channel_ids[2], user_ids[2]),
  (channel_ids[1], user_ids[3]),
  (channel_ids[3], user_ids[3]);

INSERT INTO "channel_messages" ("id", "channel_id", "sender_id", "title", "body") VALUES
  (message_ids[1], channel_ids[1], user_ids[1], 'Welcome to kana practice', 'Read the lesson notes, review the flashcards, and try each chapter quiz. This demo has no video or audio files.'),
  (message_ids[2], channel_ids[2], user_ids[1], 'Practice the particles', 'Write one sentence with は and one with を. Review each quiz explanation after submitting.'),
  (message_ids[3], channel_ids[3], user_ids[1], 'Try a polite request', 'Practice saying コーヒーを一つください。 Then try asking 駅はどこですか。');

INSERT INTO "notifications" ("id", "user_id", "message_id") VALUES
  (notification_ids[1], user_ids[2], message_ids[1]),
  (notification_ids[2], user_ids[2], message_ids[2]),
  (notification_ids[3], user_ids[3], message_ids[1]),
  (notification_ids[4], user_ids[3], message_ids[3]);
END;
$demo$;

COMMIT;
