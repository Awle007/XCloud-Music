<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// 启动会话
session_start();

// 包含配置文件
require_once (is_file(__DIR__ . '/../php/config.php') ? __DIR__ . '/../php/config.php' : __DIR__ . '/../deploy/php/config.php');

// 检查是否已经执行过修复
$fixed = isset($_GET['fixed']) && $_GET['fixed'] == 1;

// 定义要检查的表和字段
$requiredTables = [
    'users' => [
        'id' => 'INT AUTO_INCREMENT PRIMARY KEY',
        'username' => 'VARCHAR(50) NOT NULL UNIQUE',
        'email' => 'VARCHAR(100) NULL UNIQUE',
        'password' => 'VARCHAR(255) NOT NULL',
        'avatar' => 'VARCHAR(255) DEFAULT NULL',
        'last_login' => 'DATETIME DEFAULT NULL',
        'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ],
    'admins' => [
        'id' => 'INT AUTO_INCREMENT PRIMARY KEY',
        'username' => 'VARCHAR(50) NOT NULL UNIQUE',
        'password' => 'VARCHAR(255) NOT NULL',
        'last_login' => 'DATETIME DEFAULT NULL', 
        'created_at' => 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ],
    'login_logs' => [
        'id' => 'INT AUTO_INCREMENT PRIMARY KEY',
        'user_id' => 'INT NOT NULL',
        'ip_address' => 'VARCHAR(45) DEFAULT NULL',
        'login_time' => 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'user_agent' => 'TEXT DEFAULT NULL',
        'login_result' => 'TINYINT(1) NOT NULL DEFAULT 1'
    ]
];

// 存储检查结果
$results = [];
$needFixes = false;
$fixSQL = [];

try {
    $conn = getDBConnection();
    
    // 获取所有表
    $tables = [];
    $stmt = $conn->query("SHOW TABLES");
    while ($row = $stmt->fetch(PDO::FETCH_NUM)) {
        $tables[] = $row[0];
    }
    
    // 检查所有必需的表
    foreach ($requiredTables as $tableName => $fields) {
        if (!in_array($tableName, $tables)) {
            $results[$tableName] = [
                'status' => 'missing',
                'message' => "表 '{$tableName}' 不存在"
            ];
            $needFixes = true;
            
            // 为缺失的表生成创建SQL
            $createSQL = "CREATE TABLE `{$tableName}` (\n";
            foreach ($fields as $fieldName => $fieldDef) {
                $createSQL .= "  `{$fieldName}` {$fieldDef},\n";
            }
            
            // 添加外键约束
            if ($tableName == 'login_logs') {
                $createSQL .= "  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n";
            }
            
            $createSQL = rtrim($createSQL, ",\n") . "\n);";
            $fixSQL[] = $createSQL;
        } else {
            // 表存在，检查字段
            $tableFields = [];
            $stmt = $conn->query("DESCRIBE `{$tableName}`");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $tableFields[$row['Field']] = $row;
            }
            
            $missingFields = [];
            foreach ($fields as $fieldName => $fieldDef) {
                if (!isset($tableFields[$fieldName])) {
                    $missingFields[$fieldName] = $fieldDef;
                }
            }
            
            if (!empty($missingFields)) {
                $results[$tableName] = [
                    'status' => 'incomplete',
                    'message' => "表 '{$tableName}' 缺少以下字段: " . implode(', ', array_keys($missingFields))
                ];
                $needFixes = true;
                
                // 为缺失的字段生成添加SQL
                foreach ($missingFields as $fieldName => $fieldDef) {
                    $fixSQL[] = "ALTER TABLE `{$tableName}` ADD COLUMN `{$fieldName}` {$fieldDef};";
                }
            } else {
                $results[$tableName] = [
                    'status' => 'ok',
                    'message' => "表 '{$tableName}' 结构完整"
                ];
            }
        }
    }
    
    // 如果指示修复，执行SQL
    if ($needFixes && $fixed) {
        foreach ($fixSQL as $sql) {
            $conn->exec($sql);
        }
        
        // 检查是否需要添加默认管理员
        $stmt = $conn->prepare("SELECT COUNT(*) FROM admins");
        $stmt->execute();
        $adminCount = $stmt->fetchColumn();
        
        if ($adminCount == 0) {
            // 添加默认管理员账户
            $username = xcloudEnv('ADMIN_USERNAME');
            $configuredPassword = xcloudEnv('ADMIN_PASSWORD');
            if (strlen($configuredPassword) < 12 || in_array($configuredPassword, ['change-me-before-install', 'your_admin_password'], true)) throw new RuntimeException('请配置独立管理员密码');
            $password = password_hash($configuredPassword, PASSWORD_DEFAULT);
            
            $stmt = $conn->prepare("INSERT INTO admins (username, password) VALUES (:username, :password)");
            $stmt->bindParam(':username', $username);
            $stmt->bindParam(':password', $password);
            $stmt->execute();
            
            $results['admin_account'] = [
                'status' => 'created',
                'message' => "已创建配置中的管理员账户"
            ];
        }
        
        // 刷新页面显示修复后的结果
        header("Location: check_db.php");
        exit;
    }
} catch (PDOException $e) {
    $results['database_error'] = [
        'status' => 'error',
        'message' => "数据库错误: " . $e->getMessage()
    ];
}

// 获取表的行数
$counts = [];
try {
    if (in_array('users', $tables)) {
        $stmt = $conn->query("SELECT COUNT(*) FROM users");
        $counts['users'] = $stmt->fetchColumn();
    }
    
    if (in_array('admins', $tables)) {
        $stmt = $conn->query("SELECT COUNT(*) FROM admins");
        $counts['admins'] = $stmt->fetchColumn();
    }
    
    if (in_array('login_logs', $tables)) {
        $stmt = $conn->query("SELECT COUNT(*) FROM login_logs");
        $counts['login_logs'] = $stmt->fetchColumn();
    }
} catch (PDOException $e) {
    // 忽略计数错误
}

// 输出HTML页面
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>数据库表结构检查</title>
    <link href="/vendor/bootstrap/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            padding: 20px;
            background-color: #f5f5f5;
        }
        .status-ok {
            color: #198754;
        }
        .status-missing, .status-error {
            color: #dc3545;
        }
        .status-incomplete {
            color: #fd7e14;
        }
        .status-created {
            color: #0d6efd;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="mb-4">数据库表结构检查工具</h1>
        
        <div class="card mb-4">
            <div class="card-header">检查结果</div>
            <div class="card-body">
                <?php foreach ($results as $table => $result): ?>
                    <div class="mb-3">
                        <h5 class="status-<?php echo $result['status']; ?>">
                            <?php echo $table; ?>
                            <?php if ($result['status'] == 'ok'): ?>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check-circle" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
                                </svg>
                            <?php elseif ($result['status'] == 'missing' || $result['status'] == 'error'): ?>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-x-circle" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                                </svg>
                            <?php else: ?>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-exclamation-circle" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                                </svg>
                            <?php endif; ?>
                        </h5>
                        <p><?php echo $result['message']; ?></p>
                        <?php if (isset($counts[$table])): ?>
                            <p><small>表中有 <?php echo $counts[$table]; ?> 条记录</small></p>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
                
                <?php if ($needFixes): ?>
                    <div class="alert alert-warning">
                        <p>检测到数据库表结构需要修复。您可以点击下方按钮进行自动修复。</p>
                        <a href="check_db.php?fixed=1" class="btn btn-warning">修复数据库结构</a>
                    </div>
                    
                    <h5 class="mt-4">将执行的SQL语句：</h5>
                    <pre class="p-3 bg-dark text-light"><code><?php echo implode("\n\n", $fixSQL); ?></code></pre>
                <?php else: ?>
                    <div class="alert alert-success">
                        <p>数据库表结构检查完毕，未发现问题。</p>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <div class="mt-4">
            <a href="index.php" class="btn btn-primary">返回管理面板</a>
        </div>
    </div>
</body>
</html> 
