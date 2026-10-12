<?php
declare(strict_types=1);

require_once __DIR__ . '/../deploy/php/cos.php';

if (!xcloudCosCanDeleteAvatar('upload/avatars/old.png')) {
    throw new RuntimeException('user avatar key should be deletable');
}
if (xcloudCosCanDeleteAvatar('public/avatars/default1.png')) {
    throw new RuntimeException('default avatar must not be deletable');
}
if (xcloudCosCanDeleteAvatar('https://cdn.example.com/upload/avatars/old.png')) {
    throw new RuntimeException('absolute URL must not be deletable');
}

echo "COS avatar cleanup tests passed\n";
