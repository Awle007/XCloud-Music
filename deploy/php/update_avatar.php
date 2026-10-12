<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
require_once __DIR__ . '/cos.php';
xcloudSecurityRequirePost();

$userId = (int)($_POST['user_id'] ?? 0);
if ($userId <= 0) xcloudSecurityError('用户信息无效', 401);
xcloudSecurityRateLimit('avatar-user', (string)$userId, 10, 3600);

try {
    $avatarPath = '';
    $conn = getDBConnection();
    $oldStmt = $conn->prepare('SELECT avatar FROM users WHERE id = ? LIMIT 1');
    $oldStmt->execute([$userId]);
    $oldAvatarPath = (string)($oldStmt->fetchColumn() ?: '');
    $defaultAvatar = trim((string)($_POST['default_avatar'] ?? ''));
    if ($defaultAvatar !== '') {
        if (!preg_match('#^public/avatars/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png)$#i', $defaultAvatar)) {
            xcloudSecurityError('默认头像路径不合法');
        }
        $avatarPath = $defaultAvatar;
        if (!is_string($avatarPath) || !preg_match('#^public/avatars/default[0-9]+\.(?:jpg|jpeg|png)$#i', $avatarPath)) {
            xcloudSecurityError('默认头像路径不合法');
        }
    } else {
        $file = $_FILES['avatar'] ?? null;
        if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) xcloudSecurityError('没有收到有效的头像文件');
        $size = (int)($file['size'] ?? 0);
        $temporaryPath = (string)($file['tmp_name'] ?? '');
        if ($size <= 0 || $size > 2 * 1024 * 1024 || !is_uploaded_file($temporaryPath)) xcloudSecurityError('头像文件无效或超过 2MB');

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string)finfo_file($finfo, $temporaryPath);
        $extensions = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
        ];
        if (!isset($extensions[$mime])) xcloudSecurityError('只允许上传 JPG 或 PNG 图片');

        $dimensions = @getimagesize($temporaryPath);
        if (!is_array($dimensions) || (int)$dimensions[0] <= 0 || (int)$dimensions[1] <= 0) xcloudSecurityError('图片内容无法识别');
        if ((int)$dimensions[0] > 4096 || (int)$dimensions[1] > 4096 || (int)$dimensions[0] * (int)$dimensions[1] > 16000000) {
            xcloudSecurityError('图片尺寸过大');
        }
        if (!function_exists('imagecreatefromjpeg') || !function_exists('imagecreatefrompng')) {
            xcloudSecurityError('服务器未启用 GD 图片扩展', 503);
        }

        $image = $mime === 'image/jpeg' ? @imagecreatefromjpeg($temporaryPath) : @imagecreatefrompng($temporaryPath);
        if ($image === false) xcloudSecurityError('图片内容无效');

        $extension = $extensions[$mime];
        $filename = 'avatar_' . $userId . '_' . bin2hex(random_bytes(12)) . '.' . $extension;
        $destination = tempnam(sys_get_temp_dir(), 'xcloud-avatar-');
        if ($destination === false) { imagedestroy($image); xcloudSecurityError('头像临时文件创建失败', 503); }
        if ($mime === 'image/png') {
            imagealphablending($image, false);
            imagesavealpha($image, true);
            $saved = imagepng($image, $destination, 8);
        } else {
            $saved = imagejpeg($image, $destination, 90);
        }
        imagedestroy($image);
        if (!$saved) {
            @unlink($destination);
            xcloudSecurityError('头像保存失败', 503);
        }
        $avatarPath = 'upload/avatars/' . $filename;
        xcloudCosUpload($destination, $avatarPath, $mime);
        @unlink($destination);
    }

    if ($oldAvatarPath !== $avatarPath && xcloudCosCanDeleteAvatar($oldAvatarPath)) {
        xcloudCosDelete($oldAvatarPath);
    }
    $stmt = $conn->prepare('UPDATE users SET avatar = ? WHERE id = ?');
    $stmt->execute([$avatarPath, $userId]);
    xcloudSecurityJson(['success' => true, 'message' => '头像更新成功', 'avatar' => $avatarPath, 'avatar_url' => xcloudAvatarCdnUrl($avatarPath)]);
} catch (Throwable $error) {
    xcloudSecurityLog($error, 'update avatar');
    xcloudSecurityError('头像更新服务暂时不可用', 503);
}
