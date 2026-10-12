<?php
// 包含认证文件
require_once 'includes/auth.php';

// 如果已经登录，重定向到管理后台首页
if (isAdminLoggedIn()) {
    header('Location: index.php');
    exit;
}

$error = '';

// 处理登录请求
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    
    if (empty($username) || empty($password)) {
        $error = '请输入用户名和密码';
    } else {
        $result = adminLogin($username, $password);
        
        if ($result['success']) {
            // 登录成功，重定向到首页
            header('Location: index.php');
            exit;
        } else {
            $error = $result['message'];
        }
    }
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理员登录 - XCloud音乐管理系统</title>
    <link rel="icon" href="/gw.png" type="image/png">
    <link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
    <style>
        body {
            background-color: #f5f5f5;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 0;
        }
        .login-container {
            max-width: 400px;
            width: 100%;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            margin: 0 auto;
        }
        .login-header {
            background: #3498db;
            color: white;
            padding: 20px;
            border-radius: 10px 10px 0 0;
            text-align: center;
        }
        .login-header img {
            width: 60px;
            height: 60px;
            margin-bottom: 10px;
        }
        .login-form {
            padding: 30px;
        }
        .form-control:focus {
            box-shadow: none;
            border-color: #3498db;
        }
        .btn-login {
            background-color: #3498db;
            border: none;
            width: 100%;
            padding: 12px;
            font-size: 16px;
            font-weight: 500;
        }
        .btn-login:hover {
            background-color: #2980b9;
        }
        .form-floating label {
            color: #6c757d;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="login-container">
            <div class="login-header">
                <img src="/gw.png" alt="Logo">
                <h2>XCloud音乐管理系统</h2>
                <p class="mb-0">管理员登录</p>
            </div>
            <div class="login-form">
                <?php if ($error): ?>
                <div class="alert alert-danger"><?php echo $error; ?></div>
                <?php endif; ?>
                <form method="POST" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">
                    <div class="form-floating mb-3">
                        <input type="text" class="form-control" id="username" name="username" placeholder="用户名" required>
                        <label for="username">用户名</label>
                    </div>
                    <div class="form-floating mb-4">
                        <input type="password" class="form-control" id="password" name="password" placeholder="密码" required>
                        <label for="password">密码</label>
                    </div>
                    <button type="submit" class="btn btn-login btn-primary">登录</button>
                </form>
            </div>
        </div>
    </div>

    <script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>
</body>
</html> 