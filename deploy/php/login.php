<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


require_once __DIR__ . '/config.php';
require_once __DIR__ . '/_security.php';
xcloudSecurityRequirePost();

$username = trim((string)($_POST['username'] ?? ''));
$password = (string)($_POST['password'] ?? '');
$remember = (string)($_POST['remember'] ?? '0');
if ($username === '' || $password === '') xcloudSecurityError('用户名、邮箱和密码不能为空');

$ip = xcloudSecurityClientIp();
xcloudSecurityRateLimit('login-ip', $ip, 30, 900);
xcloudSecurityRateLimit('login-account', $username . '|' . $ip, 10, 900);

try {
    $conn = getDBConnection();
    $stmt = $conn->prepare('SELECT id, username, email, password, avatar, email_verified_status FROM users WHERE username = ? OR email = ? LIMIT 1');
    $stmt->execute([$username, $username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || !password_verify($password, (string)$user['password'])) {
        xcloudSecurityError('用户名、邮箱或密码错误', 401);
    }

    if ((int)$user['email_verified_status'] === 1) {
        xcloudSecurityJson([
            'success' => true,
            'need_email_verification' => true,
            'message' => '请先完成邮箱验证',
            'user_id' => (int)$user['id'],
            'email' => (string)$user['email'],
        ]);
    }

    $conn->prepare('UPDATE users SET last_login = NOW() WHERE id = ?')->execute([$user['id']]);
    $conn->prepare('INSERT INTO login_logs (user_id, login_time, ip_address, user_agent) VALUES (?, NOW(), ?, ?)')
        ->execute([$user['id'], $ip, substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 1000)]);

    $token = '';
    if ($remember === '1') {
        $token = bin2hex(random_bytes(32));
        $expires = date('Y-m-d H:i:s', time() + 30 * 86400);
        $stmt = $conn->prepare('INSERT INTO user_tokens (user_id, token, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)');
        $stmt->execute([$user['id'], $token, $expires]);
    }

    $userData = xcloudLoginUserData($conn, (int)$user['id']);
    xcloudSecurityJson([
        'success' => true,
        'message' => '登录成功',
        'token' => $token,
        'user' => [
            'id' => (int)$user['id'],
            'username' => (string)$user['username'],
            'email' => (string)($user['email'] ?? ''),
            'avatar' => (string)($user['avatar'] ?? ''),
            'playlists' => $userData['playlists'],
            'favorites' => $userData['favorites'],
            'email_verified' => (int)$user['email_verified_status'] === 2,
        ],
    ]);
} catch (Throwable $error) {
    xcloudSecurityLog($error, 'login');
    xcloudSecurityError('登录服务暂时不可用', 503);
}

function xcloudLoginUserData(PDO $conn, int $userId): array
{
    $result = ['playlists' => [], 'favorites' => []];
    $stmt = $conn->prepare('SELECT id, name FROM playlists WHERE user_id = ?');
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $playlist) {
        $songsStmt = $conn->prepare('SELECT song_id, source, song_title, song_artist, song_cover, song_album FROM playlist_songs WHERE playlist_id = ?');
        $songsStmt->execute([$playlist['id']]);
        $result['playlists'][$playlist['name']] = array_map('xcloudLoginFormatSong', $songsStmt->fetchAll(PDO::FETCH_ASSOC));
    }
    $stmt = $conn->prepare('SELECT song_id, source, song_title, song_artist, song_cover, song_album FROM favorites WHERE user_id = ?');
    $stmt->execute([$userId]);
    $result['favorites'] = array_map('xcloudLoginFormatSong', $stmt->fetchAll(PDO::FETCH_ASSOC));
    return $result;
}

function xcloudLoginFormatSong(array $song): array
{
    return [
        'id' => (string)$song['song_id'],
        'source' => (string)($song['source'] ?: 'netease'),
        'name' => (string)($song['song_title'] ?: '未知歌曲'),
        'artist' => (string)($song['song_artist'] ?: '未知艺术家'),
        'album' => (string)($song['song_album'] ?: '未知专辑'),
        'pic_id' => (string)($song['song_cover'] ?: ''),
    ];
}
