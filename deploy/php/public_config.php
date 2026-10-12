<?php
declare(strict_types=1);
require_once __DIR__ . '/_features.php';

// GET /php/public_config.php：只公开功能开关，绝不返回服务 URL、密钥或数据库参数。
$features = xcloudConfiguredFeatures();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('X-Content-Type-Options: nosniff');
echo json_encode(['features' => $features], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
