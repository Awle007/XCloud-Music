<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertContainsText(string $needle, string $haystack, string $message): void { if (!str_contains($haystack, $needle)) fail($message . ': missing ' . $needle); }

$root = dirname(__DIR__);
$html = file_get_contents($root . '/admin/index.php') ?: '';
$js = file_get_contents($root . '/admin/assets/js/admin.js') ?: '';
$css = file_get_contents($root . '/admin/assets/css/style.css') ?: '';

foreach (['feedback-link', 'feedback-content', 'feedback-table-body', 'feedback-pagination', 'feedbackDetailModal', 'feedbackReplyModal', 'feedback-reply-form', 'admin-csrf-token'] as $id) {
    assertContainsText('id="' . $id . '"', $html, 'admin feedback UI is incomplete');
}
assertContainsText("#feedback", $js, 'feedback hash route is missing');
assertContainsText("api/get_feedback.php?page=", $js, 'feedback list API is missing');
assertContainsText("api/reply_feedback.php", $js, 'feedback reply API is missing');
assertContainsText("textContent", $js, 'feedback content must use safe text rendering');
assertContainsText("feedbackReplyDraft", $js, 'reply draft retention is missing');
assertContainsText("showFeedbackManagement", $js, 'feedback navigation function is missing');
assertContainsText(".feedback-message", $css, 'feedback message overflow style is missing');
assertContainsText(".feedback-actions", $css, 'feedback responsive actions style is missing');

echo "PASS: feedback admin UI contract\n";
