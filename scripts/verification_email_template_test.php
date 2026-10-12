<?php
declare(strict_types=1);

function fail(string $message): never { fwrite(STDERR, "FAIL: {$message}\n"); exit(1); }
function assertTrueValue(bool $value, string $message): void { if (!$value) fail($message); }

require_once __DIR__ . '/../deploy/php/email_templates.php';

$register = xcloudVerificationEmailContent('123456', '<新用户>', 'register');
assertTrueValue($register['subject'] === 'XCloud音乐 - 注册验证码', 'register subject is incorrect');
assertTrueValue(str_contains($register['html'], '123456'), 'register code is missing from HTML');
assertTrueValue(str_contains($register['html'], '&lt;新用户&gt;'), 'username must be HTML escaped');
assertTrueValue(str_contains($register['text'], '5 分钟'), 'plain-text expiry note is missing');

$reset = xcloudVerificationEmailContent('654321', '用户', 'reset');
assertTrueValue($reset['subject'] === 'XCloud音乐 - 找回密码验证码', 'reset subject is incorrect');
assertTrueValue(str_contains($reset['html'], '重置 XCloud音乐账户密码'), 'reset purpose is missing from HTML');
echo "PASS: verification email template\n";
