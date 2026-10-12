<?php
declare(strict_types=1);

require_once __DIR__ . '/_features.php';
xcloudRequireFeature('login');


header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/_phase3_guard.php';
xcloudPhase3RequireUserToken();
require_once __DIR__ . '/config.php';

$userId = (int)($_POST['user_id'] ?? $_GET['user_id'] ?? 0);
if ($userId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => '用户参数无效'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $conn = getDBConnection();
    $stmt = $conn->prepare('SELECT song_id AS id, source, song_title AS name, song_artist AS artist, song_album AS album, song_cover AS pic_id, added_at FROM favorites WHERE user_id = ? ORDER BY added_at DESC, favorites.id DESC');
    $stmt->execute([$userId]);
    echo json_encode([
        'success' => true,
        'favorites' => $stmt->fetchAll(PDO::FETCH_ASSOC),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $error) {
    error_log('Favorite loading failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => '收藏读取失败'], JSON_UNESCAPED_UNICODE);
}
