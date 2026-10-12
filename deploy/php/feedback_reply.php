<?php
declare(strict_types=1);

final class XCloudFeedbackReplyStateException extends RuntimeException
{
}

function xcloudFeedbackReplyContent(string $reply): array
{
    $reply = trim($reply);
    if ($reply === '' || mb_strlen($reply, 'UTF-8') > 4000) throw new InvalidArgumentException('回复内容不正确');

    $safeReply = nl2br(htmlspecialchars($reply, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
    $text = "您好：\n感谢您为XCloud音乐提供问题反馈或建议，\n{$reply}\n\nXCloud音乐";
    $html = '<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f4f7f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,sans-serif">'
        . '<main style="max-width:560px;margin:0 auto;padding:30px;background:#fff;border-radius:16px">'
        . '<div style="color:#49a958;font-size:14px;font-weight:700">XCLOUD 音乐</div>'
        . '<h1 style="margin:10px 0 20px;color:#20282c;font-size:22px">XCloud音乐反馈回复</h1>'
        . '<p style="margin:0 0 10px;color:#3f4d52;font-size:15px;line-height:1.8">您好：</p>'
        . '<p style="margin:0 0 18px;color:#3f4d52;font-size:15px;line-height:1.8">感谢您为XCloud音乐提供问题反馈或建议，</p>'
        . '<div style="padding:18px;background:#f5f8f7;border-left:4px solid #49a958;color:#20282c;font-size:15px;line-height:1.8;word-break:break-word">' . $safeReply . '</div>'
        . '<p style="margin:24px 0 0;color:#3f4d52;font-size:15px">XCloud音乐</p>'
        . '</main></body></html>';

    return ['subject' => 'XCloud音乐反馈回复', 'html' => $html, 'text' => $text];
}

function xcloudSendFeedbackReply(string $to, string $reply, ?callable $transport = null): void
{
    require_once __DIR__ . '/_features.php';
    xcloudRequireFeature('feedback');
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('反馈未提供有效邮箱');
    $content = xcloudFeedbackReplyContent($reply);
    if ($transport !== null) {
        $transport($to, $content);
        return;
    }

    require_once __DIR__ . '/vendor/autoload.php';
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = xcloudEnv('SMTP_HOST');
    $mail->SMTPAuth = true;
    $mail->Username = xcloudEnv('SMTP_USERNAME');
    $mail->Password = xcloudEnv('SMTP_PASSWORD');
    $mail->SMTPSecure = 'ssl';
    $mail->Port = (int)xcloudEnv('SMTP_PORT', '465');
    $mail->setFrom(xcloudEnv('SMTP_FROM_ADDRESS', xcloudEnv('SMTP_USERNAME')), xcloudEnv('SMTP_FROM_NAME', 'XCloud音乐'));
    $mail->addAddress($to);
    $mail->CharSet = 'UTF-8';
    $mail->isHTML(true);
    $mail->Subject = $content['subject'];
    $mail->Body = $content['html'];
    $mail->AltBody = $content['text'];
    $mail->send();
}

function xcloudProcessFeedbackReply(
    string $directory,
    string $feedbackId,
    string $reply,
    ?callable $transport = null,
    ?DateTimeImmutable $now = null
): array {
    require_once __DIR__ . '/_features.php';
    xcloudRequireFeature('feedback');
    $feedback = xcloudFeedbackFind($directory, $feedbackId);
    if ($feedback === null) throw new InvalidArgumentException('反馈不存在');
    $email = trim((string)$feedback['email']);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new InvalidArgumentException('反馈未提供有效邮箱');

    xcloudSendFeedbackReply($email, $reply, $transport);
    try {
        $repliedAt = xcloudFeedbackRecordReply($directory, $feedbackId, $now);
    } catch (Throwable $error) {
        throw new XCloudFeedbackReplyStateException('邮件已发送，但状态保存失败', 0, $error);
    }
    return ['feedback_id' => $feedbackId, 'replied_at' => $repliedAt];
}
