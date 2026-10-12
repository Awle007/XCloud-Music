<?php

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once 'config.php';

$token = $_POST['token'] ?? '';
$userId = $_POST['user_id'] ?? '';

if (empty($token) || empty($userId)) {
    echo json_encode(['success' => false, 'message' => '参数不完整']);
    exit;
}

try {
    $conn = getDBConnection();
    
    // 验证token
    $stmt = $conn->prepare("SELECT ut.*, u.username, u.email, u.avatar, u.last_login, u.email_verified_status 
                           FROM user_tokens ut 
                           JOIN users u ON ut.user_id = u.id 
                           WHERE ut.token = ? AND ut.user_id = ? AND ut.expires_at > NOW()");
    $stmt->execute([$token, $userId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$result) {
        // token无效或已过期
        echo json_encode(['success' => false, 'message' => '登录已过期，请重新登录']);
        exit;
    }
    
    // 检查是否需要验证邮箱
    if ($result['email_verified_status'] == 1) {
        // 只返回需要验证邮箱的状态，不自动发送验证码
        echo json_encode([
            'success' => true,
            'need_email_verification' => true,
            'message' => '系统检测到您注册时的邮箱可能有误，请验证您的邮箱',
            'user_id' => $userId,
            'email' => $result['email']
        ]);
        exit;
    }
    
    // 记录登录（仅当距离上次登录超过30分钟时）
    $shouldLogLogin = true;
    
    if ($result['last_login']) {
        $lastLogin = strtotime($result['last_login']);
        $currentTime = time();
        if ($currentTime - $lastLogin < 60) { // 此处可以设置登录记录时间间隔
            $shouldLogLogin = false;
        }
    }
    
    // 记录登录信息
    if ($shouldLogLogin) {
        // 更新用户的最后登录时间
        $stmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
        $stmt->execute([$userId]);
        
        // 记录登录日志 - 这条记录将会显示在管理后台的最近登录用户列表中
        // 并且会被计入每日登录统计
        $ipAddress = $_SERVER['REMOTE_ADDR'] ?? '';
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        
        $stmt = $conn->prepare("INSERT INTO login_logs (user_id, login_time, ip_address, user_agent) VALUES (?, NOW(), ?, ?)");
        $stmt->execute([$userId, $ipAddress, $userAgent]);
    }
    
    // 获取用户数据（收藏和歌单）
    $userData = getUserData($conn, $userId);
    
    // 更新token的过期时间（续期）- 每次验证成功后都延长到30天
    $expires = date('Y-m-d H:i:s', strtotime('+30 days'));
    $stmt = $conn->prepare("UPDATE user_tokens SET expires_at = ? WHERE token = ?");
    $stmt->execute([$expires, $token]);
    
    echo json_encode([
        'success' => true,
        'message' => '登录有效',
        'user' => [
            'id' => $userId,
            'username' => $result['username'],
            'email' => $result['email'] ?? '',
            'avatar' => $result['avatar'] ?? '',
            'playlists' => $userData['playlists'],
            'favorites' => $userData['favorites'],
            'email_verified' => ($result['email_verified_status'] == 2)
        ]
    ]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => '服务暂时不可用']);
}

// 获取用户的收藏和歌单数据
function getUserData($conn, $userId) {
    $result = ['playlists' => [], 'favorites' => []];
    
    // 获取用户的歌单列表
    $stmt = $conn->prepare("SELECT id, name FROM playlists WHERE user_id = ?");
    $stmt->execute([$userId]);
    $playlists = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($playlists as $playlist) {
        $stmt = $conn->prepare("
            SELECT song_id, source, song_title, song_artist, song_cover, song_album
            FROM playlist_songs 
            WHERE playlist_id = ?
        ");
        $stmt->execute([$playlist['id']]);
        $songs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // 格式化歌曲数据
        $formattedSongs = [];
        foreach ($songs as $song) {
            // 确保所有字段都有合法值，防止undefined
            $formattedSongs[] = [
                'id' => $song['song_id'],
                'source' => $song['source'] ?: 'netease',
                'name' => $song['song_title'] ?: '未知歌曲',
                'artist' => $song['song_artist'] ?: '未知艺术家',
                'album' => $song['song_album'] ?: '未知专辑',
                'pic_id' => $song['song_cover'] ?: ''
            ];
        }
        
        $result['playlists'][$playlist['name']] = $formattedSongs;
    }
    
    // 获取用户的收藏
    $stmt = $conn->prepare("SELECT song_id, source, song_title, song_artist, song_album, song_cover FROM favorites WHERE user_id = ?");
    $stmt->execute([$userId]);
    $favorites = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formattedFavorites = [];
    foreach ($favorites as $song) {
        // 确保所有字段都有合法值，防止undefined
        $formattedFavorites[] = [
            'id' => $song['song_id'],
            'source' => $song['source'] ?: 'netease',
            'name' => $song['song_title'] ?: '未知歌曲',
            'artist' => $song['song_artist'] ?: '未知艺术家',
            'album' => $song['song_album'] ?: '未知专辑',
            'pic_id' => $song['song_cover'] ?: ''
        ];
    }
    $result['favorites'] = $formattedFavorites;
    
    return $result;
} 