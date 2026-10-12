<?php
declare(strict_types=1);

function xcloudVerificationEmailContent(string $code, string $username, string $type): array
{
    $details = match ($type) {
        'register' => ['注册验证码', '完成 XCloud音乐账户注册'],
        'reset' => ['找回密码验证码', '重置 XCloud音乐账户密码'],
        default => ['邮箱验证码', '完成 XCloud音乐邮箱验证'],
    };
    [$title, $purpose] = $details;
    $safeUsername = htmlspecialchars($username, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $text = "你好，{$username}：\n\n你正在{$purpose}，验证码是：{$code}\n\n验证码 5 分钟内有效。若非本人操作，请忽略此邮件。";
    $html = '<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,sans-serif">'
        . '<main style="max-width:520px;margin:0 auto;padding:30px;background:#fff;border-radius:16px">'
        . '<div style="color:#49a958;font-size:14px;font-weight:700;letter-spacing:.08em">XCLOUD 音乐</div>'
        . '<h1 style="margin:10px 0 8px;color:#20282c;font-size:22px">' . $title . '</h1>'
        . '<p style="margin:0;color:#708087;font-size:14px;line-height:1.7">你好，' . $safeUsername . '。你正在' . $purpose . '。</p>'
        . '<div style="margin:24px 0;padding:18px;border-radius:12px;background:#f0faf2;text-align:center">'
        . '<div style="margin-bottom:7px;color:#6b7e73;font-size:12px">验证码</div>'
        . '<div style="color:#238a42;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:30px;font-weight:750;letter-spacing:.22em">' . $safeCode . '</div>'
        . '</div><p style="margin:0;color:#708087;font-size:13px;line-height:1.7">验证码 5 分钟内有效。若非本人操作，请忽略此邮件。</p>'
        . '<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eef2f3;color:#98a4a8;font-size:12px">此邮件由 XCloud音乐自动发送，请勿直接回复。</p>'
        . '</main></body></html>';
    return ['subject' => 'XCloud音乐 - ' . $title, 'html' => $html, 'text' => $text];
}
