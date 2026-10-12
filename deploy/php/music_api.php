<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** Example legacy types protocol entry. Providers are configured only in server .env. */
define('XCLOUD_COMPAT_LIST', true);
if (($_GET['types'] ?? '') === 'cover') define('XCLOUD_COMPAT_IMAGE', true);
require __DIR__ . '/music_source.php';
