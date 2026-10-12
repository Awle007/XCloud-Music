<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */


function xcloudCosUpload(string $localPath, string $objectKey, string $contentType): void
{
    if (xcloudEnv('AVATAR_STORAGE', 'local') === 'local') {
        $destination = xcloudLocalAvatarPath($objectKey);
        $directory = dirname($destination);
        if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('无法创建头像目录');
        if (!copy($localPath, $destination)) throw new RuntimeException('头像保存失败');
        return;
    }
    if (!function_exists('curl_init')) throw new RuntimeException('服务器未启用 cURL 扩展');
    $secretId = xcloudEnv('COS_SECRET_ID');
    $secretKey = xcloudEnv('COS_SECRET_KEY');
    $region = xcloudEnv('COS_REGION');
    $bucket = xcloudEnv('COS_BUCKET');
    $file = @file_get_contents($localPath);
    if ($file === false) throw new RuntimeException('无法读取头像文件');

    $host = $bucket . '.cos.' . $region . '.myqcloud.com';
    $uri = '/' . implode('/', array_map('xcloudCosEncode', explode('/', trim($objectKey, '/'))));
    $signTime = time() . ';' . (time() + 900);
    $signKey = hash_hmac('sha1', $signTime, $secretKey);
    $headers = 'content-type=' . xcloudCosEncode(strtolower($contentType)) . '&host=' . xcloudCosEncode(strtolower($host));
    $httpString = "put\n" . $uri . "\n\n" . $headers . "\n";
    $stringToSign = "sha1\n" . $signTime . "\n" . sha1($httpString) . "\n";
    $signature = hash_hmac('sha1', $stringToSign, $signKey);
    $authorization = 'q-sign-algorithm=sha1&q-ak=' . $secretId . '&q-sign-time=' . $signTime
        . '&q-key-time=' . $signTime . '&q-header-list=content-type;host&q-url-param-list=&q-signature=' . $signature;

    $curl = curl_init('https://' . $host . $uri);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => 'PUT', CURLOPT_POSTFIELDS => $file, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: ' . $authorization, 'Content-Type: ' . $contentType, 'Host: ' . $host],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if ($response === false || $status < 200 || $status >= 300) {
        $detail = $error ?: trim(preg_replace('/\s+/', ' ', (string)$response));
        $detail = substr($detail, 0, 500);
        error_log('[XCloud COS] upload failed: HTTP ' . $status . ($detail !== '' ? ' ' . $detail : ''));
        throw new RuntimeException('COS 上传失败');
    }

}

function xcloudCosCanDeleteAvatar(string $objectKey): bool
{
    return preg_match('#^upload/avatars/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png)$#i', $objectKey) === 1;
}

function xcloudLocalAvatarPath(string $objectKey): string
{
    if (!xcloudCosCanDeleteAvatar($objectKey)) throw new RuntimeException('头像路径不合法');
    return dirname(__DIR__) . '/' . $objectKey;
}

function xcloudCosDelete(string $objectKey): void
{
    if (xcloudEnv('AVATAR_STORAGE', 'local') === 'local') {
        $path = xcloudLocalAvatarPath($objectKey);
        if (is_file($path) && !unlink($path)) throw new RuntimeException('旧头像删除失败');
        return;
    }
    if (!function_exists('curl_init')) throw new RuntimeException('服务器未启用 cURL 扩展');
    if (!xcloudCosCanDeleteAvatar($objectKey)) throw new RuntimeException('头像路径不允许删除');

    $secretId = xcloudEnv('COS_SECRET_ID');
    $secretKey = xcloudEnv('COS_SECRET_KEY');
    $region = xcloudEnv('COS_REGION');
    $bucket = xcloudEnv('COS_BUCKET');
    $host = $bucket . '.cos.' . $region . '.myqcloud.com';
    $uri = '/' . implode('/', array_map('xcloudCosEncode', explode('/', trim($objectKey, '/'))));
    $signTime = time() . ';' . (time() + 900);
    $signKey = hash_hmac('sha1', $signTime, $secretKey);
    $httpString = "delete\n" . $uri . "\n\n" . 'host=' . xcloudCosEncode(strtolower($host)) . "\n";
    $stringToSign = "sha1\n" . $signTime . "\n" . sha1($httpString) . "\n";
    $signature = hash_hmac('sha1', $stringToSign, $signKey);
    $authorization = 'q-sign-algorithm=sha1&q-ak=' . $secretId . '&q-sign-time=' . $signTime
        . '&q-key-time=' . $signTime . '&q-header-list=host&q-url-param-list=&q-signature=' . $signature;

    $curl = curl_init('https://' . $host . $uri);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => 'DELETE', CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: ' . $authorization, 'Host: ' . $host],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    if ($response === false || $status < 200 || $status >= 300) {
        $detail = $error ?: trim(preg_replace('/\s+/', ' ', (string)$response));
        error_log('[XCloud COS] delete failed: HTTP ' . $status . ($detail !== '' ? ' ' . substr($detail, 0, 500) : ''));
        throw new RuntimeException('COS 旧头像删除失败');
    }
}

function xcloudCosEncode(string $value): string
{
    return rawurlencode($value);
}

function xcloudAvatarCdnUrl(string $path): string
{
    if (xcloudEnv('AVATAR_STORAGE', 'local') === 'local') {
        return '/' . preg_replace('#^public/#', '', ltrim($path, '/'));
    }
    return rtrim(xcloudEnv('AVATAR_CDN_BASE_URL', 'https://assets.example.com'), '/') . '/' . ltrim($path, '/');
}
