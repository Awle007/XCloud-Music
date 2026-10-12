<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$currentVersion = '1.9.56';//当前版本号

$response = [
    'version' => $currentVersion,
    'resources' => [
        'js/main.js' => [
            'version' => $currentVersion,
            'lastModified' => date('Y-m-d H:i:s')
        ],
        'js/util.js' => [
            'version' => $currentVersion,
            'lastModified' => date('Y-m-d H:i:s')
        ],
        'js/email_verification.js' => [
            'version' => $currentVersion,
            'lastModified' => date('Y-m-d H:i:s')
        ],
        'css/style.css' => [
            'version' => $currentVersion,
            'lastModified' => date('Y-m-d H:i:s')
        ],
        'index.php' => [
            'version' => $currentVersion,
            'lastModified' => date('Y-m-d H:i:s')
        ]
    ]
];

echo json_encode($response);
?>
