<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** 统一音乐 API 调用示例入口；协议和扩展方法见 MUSIC_API.md。 */
require_once __DIR__ . '/_features.php';
require_once __DIR__ . '/music_source_adapters.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, ['GET', 'POST'], true)) {
        http_response_code(405);
        header('Allow: GET, POST');
        throw new InvalidArgumentException('仅支持 GET 或 POST');
    }
    $raw = file_get_contents('php://input');
    $json = is_string($raw) && trim($raw) !== '' ? json_decode($raw, true) : null;
    if (str_contains(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') && !is_array($json)) throw new InvalidArgumentException('请求 JSON 无效');
    $input = array_merge($_GET, $_POST, is_array($json) ? $json : []);
    foreach ($input as $value) if (!is_scalar($value) && $value !== null) throw new InvalidArgumentException('请求参数必须为标量');
    $source = defined('XCLOUD_COMPAT_SOURCE') ? XCLOUD_COMPAT_SOURCE : strtolower(trim((string)($input['source'] ?? 'netease')));
    if (!isset(xcloudMusicPlatforms()[$source])) throw new InvalidArgumentException('不支持的音乐平台');
    xcloudRequireSource($source);
    $action = strtolower((string)($input['action'] ?? $input['types'] ?? 'search'));
    $action = match ($action) { 'pic' => 'cover', 'play', 'quality' => 'url', 'lyrics' => 'lyric', 'simi', 'similar_songs' => 'similar', default => $action };
    if (!in_array($action, ['search', 'url', 'lyric', 'cover', 'health', 'similar'], true)) throw new InvalidArgumentException('不支持的操作');
    $keyword = trim((string)($input['keyword'] ?? $input['name'] ?? $input['all'] ?? ''));
    $id = trim((string)($input['id'] ?? $input['songid'] ?? ''));
    $pictureId = trim((string)($input['pic_id'] ?? ''));
    if ($pictureId !== '' && !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $pictureId)) throw new InvalidArgumentException('封面 ID 无效');
    $page = filter_var($input['page'] ?? $input['pn'] ?? $input['pages'] ?? 1, FILTER_VALIDATE_INT);
    $limit = filter_var($input['limit'] ?? $input['rn'] ?? $input['count'] ?? $input['n'] ?? 30, FILTER_VALIDATE_INT);
    if ($page === false || $page < 1 || $page > 1000 || $limit === false || $limit < 1 || $limit > 100) throw new InvalidArgumentException('分页参数无效');
    if ($action === 'search' && ($keyword === '' || mb_strlen($keyword) > 200)) throw new InvalidArgumentException('搜索关键词无效');
    if (in_array($action, ['url', 'lyric', 'cover', 'similar'], true) && !preg_match('/^[A-Za-z0-9_-]{1,128}$/', $id)) throw new InvalidArgumentException('歌曲 ID 无效');
    $quality = (string)($input['quality'] ?? $input['br'] ?? '320');
    if (isset($input['yz']) && !isset($input['quality']) && !isset($input['br'])) {
        $level = (int)$input['yz'];
        $quality = $source === 'kugou' ? 'kg_' . $level : match ($level) { 1 => '128', 2 => '320', default => '999' };
    }
    $result = xcloudMusicResolve($action, $source, ['keyword' => $keyword, 'page' => $page, 'limit' => $limit, 'id' => $id, 'pic_id' => $pictureId, 'quality' => $quality]);
    if (defined('XCLOUD_COMPAT_IMAGE') && XCLOUD_COMPAT_IMAGE) {
        if (empty($result['pic'])) throw new RuntimeException('封面不可用');
        header_remove('Content-Type');
        header('Location: ' . $result['pic'], true, 302);
        exit;
    }
    if (defined('XCLOUD_COMPAT_LIST') && XCLOUD_COMPAT_LIST && in_array($action, ['search', 'similar'], true)) $result = $result['data'];
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (InvalidArgumentException $error) {
    if (http_response_code() !== 405) http_response_code(400);
    echo json_encode(['success' => false, 'message' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode(['success' => false, 'message' => '音乐服务不可用，请检查服务器音源配置及响应协议'], JSON_UNESCAPED_UNICODE);
}
