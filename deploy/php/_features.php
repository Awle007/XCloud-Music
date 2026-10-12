<?php
declare(strict_types=1);
require_once __DIR__ . '/_env.php';

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath((string)$_SERVER['SCRIPT_FILENAME']) === __FILE__) { http_response_code(404); exit; }

/** 服务器模块配置只接受 0/1；公开配置仅包含布尔值。 */
function xcloudFeatureFlag(string $name, string $default = '1'): bool
{
    $value = xcloudEnv($name, $default);
    if ($value !== '0' && $value !== '1') throw new RuntimeException('Invalid feature configuration: ' . $name);
    return $value === '1';
}

function xcloudFeatures(): array
{
    $login = xcloudFeatureFlag('XCLOUD_LOGIN_ENABLED');
    // 即使依赖关闭也验证原始值，避免无效配置被隐藏。
    $register = xcloudFeatureFlag('XCLOUD_REGISTER_ENABLED');
    $heart = xcloudFeatureFlag('XCLOUD_HEART_MODE_ENABLED', '0');
    $sources = [];
    foreach (['netease', 'kuwo', 'qq', 'kugou'] as $source) {
        $sources[$source] = xcloudFeatureFlag('XCLOUD_SOURCE_' . strtoupper($source) . '_ENABLED');
    }
    return ['login' => $login, 'register' => $login && $register, 'heartMode' => $login && $heart,
        'hotToplist' => xcloudFeatureFlag('XCLOUD_HOT_TOPLIST_ENABLED'),
        'feedback' => xcloudFeatureFlag('XCLOUD_FEEDBACK_ENABLED'), 'sources' => $sources];
}

function xcloudFeatureResponse(string $code, string $message, int $cliStatus = 0): void
{
    if (PHP_SAPI === 'cli') {
        fwrite($cliStatus === 0 ? STDOUT : STDERR, $code . ': ' . $message . PHP_EOL);
        exit($cliStatus);
    }
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    echo json_encode(['success' => false, 'error_code' => $code, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function xcloudConfiguredFeatures(): array
{
    try { return xcloudFeatures(); }
    catch (Throwable $error) { xcloudFeatureResponse('CONFIG_INVALID', '功能配置无效，请联系管理员', 1); }
    return [];
}

function xcloudRequireFeature(string $key): void
{
    $features = xcloudConfiguredFeatures();
    if (($features[$key] ?? false) !== true) xcloudFeatureResponse('FEATURE_DISABLED', '该功能已关闭');
}

function xcloudRequireSource(string $source): void
{
    $features = xcloudConfiguredFeatures();
    if (($features['sources'][$source] ?? false) !== true) xcloudFeatureResponse('FEATURE_DISABLED', '该音源已关闭');
}
