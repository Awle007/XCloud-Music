<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>系统初始化 - XCloud音乐管理系统</title>
    <link rel="icon" href="/gw.png" type="image/png">
    <link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
    <style>
        body {
            background-color: #f5f5f5;
            padding: 50px 0;
        }
        .setup-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            padding: 30px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header i {
            font-size: 48px;
            color: #3498db;
            margin-bottom: 10px;
        }
        .result {
            margin-top: 20px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 5px;
            border-left: 4px solid #6c757d;
        }
        .result.success {
            border-left-color: #2ecc71;
        }
        .result.error {
            border-left-color: #e74c3c;
        }
    </style>
</head>
<body>
    <div class="container setup-container">
        <div class="header">
            <img src="/gw.png" alt="Logo" style="width: 60px; height: 60px; margin-bottom: 10px;">
            <h1>XCloud音乐管理系统初始化</h1>
            <p class="text-muted">此页面用于初始化管理系统所需的数据库结构</p>
        </div>
        
        <div class="alert alert-warning">
            <i class="bi bi-exclamation-triangle-fill me-2"></i>
            警告：此操作将修改数据库结构。建议在执行前备份您的数据库。
        </div>
        
        <div class="card mb-4">
            <div class="card-header">
                <h5>操作步骤</h5>
            </div>
            <div class="card-body">
                <ol>
                    <li>确保您已正确配置数据库连接（config.php）</li>
                    <li>点击下方"初始化数据库"按钮</li>
                    <li>检查输出结果确认操作是否成功</li>
                    <li>成功后，点击"进入管理后台"链接</li>
                    <li>在后端配置中设置 ADMIN_USERNAME 与 ADMIN_PASSWORD</li>
                    <li>通过 CLI 执行 php scripts/init-database.php 初始化</li>
                </ol>
            </div>
        </div>
        
        <form method="post" class="text-center">
            <button type="submit" name="setup" class="btn btn-primary btn-lg">
                <i class="bi bi-database-gear me-2"></i> 初始化数据库
            </button>
        </form>
        
        <?php
        if (isset($_POST['setup'])) {
            echo '<div class="result">';
            echo '<h4>执行结果：</h4>';
            echo '<div class="output">';
            
            // 包含数据库初始化脚本
            ob_start();
            include('includes/db_init.php');
            $output = ob_get_clean();
            
            echo $output;
            
            echo '</div>';
            echo '<div class="mt-4">';
            echo '<a href="index.php" class="btn btn-success">进入管理后台</a>';
            echo '</div>';
            echo '</div>';
        }
        ?>
    </div>
</body>
</html> 
