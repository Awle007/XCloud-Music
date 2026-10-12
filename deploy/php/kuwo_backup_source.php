<?php
declare(strict_types=1);
/** API 调用示例：参数与响应字段仅演示当前适配协议；其他服务需自行兼容。官方接口保留原地址，线上可用性需在部署环境验证。 */

/** Example API compatibility entry. Upstream calls are centralized in music_source.php. */
define('XCLOUD_COMPAT_SOURCE', 'kuwo');
define('XCLOUD_COMPAT_LIST', true);
require __DIR__ . '/music_source.php';
