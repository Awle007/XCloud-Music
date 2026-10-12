<?php
declare(strict_types=1);

require_once __DIR__ . '/../deploy/php/netease_payload.php';

function assertNeteasePayload(mixed $actual, mixed $expected, string $message): void
{
    if ($actual !== $expected) {
        throw new RuntimeException($message . '\nexpected: ' . var_export($expected, true) . '\nactual: ' . var_export($actual, true));
    }
}

$normal = '{"result":{"songs":[{"id":1,"name":"正常歌曲"}]}}';
assertNeteasePayload(xcloudNeteaseDecodePayload($normal)['result']['songs'][0]['name'] ?? null, '正常歌曲', 'normal JSON must remain unchanged');

$malformed = '{"result":{"songs":[{"id":506196018,"name":"英雄联盟"无限火力"模式主题曲"}]}}';
assertNeteasePayload(xcloudNeteaseDecodePayload(rawurlencode($malformed))['result']['songs'][0]['name'] ?? null, '英雄联盟"无限火力"模式主题曲', 'unescaped quotes inside upstream string values must be preserved');

$bracketedMalformed = '{"result":{"songs":[{"id":1,"album":"OST [Season 2 "Our Skyy 2"]"}]}}';
assertNeteasePayload(xcloudNeteaseDecodePayload(rawurlencode($bracketedMalformed))['result']['songs'][0]['album'] ?? null, 'OST [Season 2 "Our Skyy 2"]', 'quotes before brackets inside upstream string values must not close the JSON string');

echo "netease payload decode test passed\n";
