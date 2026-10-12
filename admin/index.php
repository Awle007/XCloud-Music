<?php
// 启用错误报告
error_reporting(E_ALL);
ini_set('display_errors', 1);

// 包含认证和用户函数文件
require_once 'includes/auth.php';
require_once 'includes/user_functions.php';

// 确保管理员已登录
requireAdminLogin();

// 获取统计数据
$totalUsers = getTotalUsers();
$todayRegistrations = getTodayRegistrations();
$todayLogins = getTodayLogins();
$loginStats = getLoginStatsForLastWeek();
$recentLogins = getRecentLogins(5);
$allUsers = getAllUsers();
$playbackSourceStats = getPlaybackSourceStats();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta id="admin-csrf-token" name="admin-csrf-token" content="<?php echo htmlspecialchars(adminCsrfToken(), ENT_QUOTES, 'UTF-8'); ?>">
    <title>管理控制台 - XCloud音乐管理系统</title>
    <link rel="icon" href="/gw.png" type="image/png">
    <link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
    <link rel="stylesheet" href="/vendor/datatables/dataTables.bootstrap5.min.css">
    <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
    <!-- 侧边栏 -->
    <div class="sidebar">
        <div class="sidebar-header">
            <img src="/gw.png" alt="Logo" class="logo-icon">
            <h3>XCloud音乐</h3>
            <p class="item-text">管理系统</p>
        </div>
        <div class="sidebar-menu">
            <a href="#dashboard" id="dashboard-link" class="active" onclick="showDashboard(); return false;">
                <i class="bi bi-speedometer2"></i>
                <span class="item-text">控制台</span>
            </a>
            <a href="#users" id="users-link" onclick="showUserManagement(); return false;">
                <i class="bi bi-people"></i>
                <span class="item-text">用户管理</span>
            </a>
            <a href="#feedback" id="feedback-link" onclick="showFeedbackManagement(); return false;">
                <i class="bi bi-chat-left-text"></i>
                <span class="item-text">反馈处理</span>
            </a>
            <a href="#" data-bs-toggle="modal" data-bs-target="#passwordModal">
                <i class="bi bi-key"></i>
                <span class="item-text">修改密码</span>
            </a>
            <a href="logout.php">
                <i class="bi bi-box-arrow-right"></i>
                <span class="item-text">退出登录</span>
            </a>
        </div>
    </div>

    <!-- 主内容区域 -->
    <div class="main-content">
        <!-- 顶部栏 -->
        <div class="top-bar">
            <button class="toggle-sidebar" aria-label="折叠侧边栏">
                <i class="bi bi-list"></i>
            </button>
            <h1 id="page-title">控制台</h1>
            <div class="admin-info">
                <button id="refresh-data" class="btn btn-sm btn-outline-primary me-2" title="刷新数据">
                    <i class="bi bi-arrow-clockwise"></i>
                </button>
                <span class="admin-name"><?php echo htmlspecialchars($_SESSION['admin_username']); ?></span>
                <a href="logout.php" class="btn btn-sm btn-outline-secondary">
                    <i class="bi bi-box-arrow-right"></i> 退出
                </a>
            </div>
        </div>

        <!-- 主页内容 -->
        <div id="dashboard-content">
            <!-- 统计卡片 -->
            <div class="row">
                <div class="col-md-4">
                    <div class="card stat-card">
                        <div class="card-body">
                            <i class="bi bi-people stat-icon"></i>
                            <div class="stat-value"><?php echo $totalUsers; ?></div>
                            <div class="stat-label">总用户数</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card green">
                        <div class="card-body">
                            <i class="bi bi-person-plus stat-icon"></i>
                            <div class="stat-value"><?php echo $todayRegistrations; ?></div>
                            <div class="stat-label">今日注册</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card orange">
                        <div class="card-body">
                            <i class="bi bi-box-arrow-in-right stat-icon"></i>
                            <div class="stat-value"><?php echo $todayLogins; ?></div>
                            <div class="stat-label">今日登录</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row mt-4">
                <!-- 登录趋势图表 -->
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>近7日用户登录趋势</h5>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-secondary" id="view-login-statistics">
                                    <i class="bi bi-bar-chart-line"></i> 查看详细统计
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <div style="height: 300px;">
                                <canvas id="loginChart" data-stats='<?php echo json_encode($loginStats); ?>'></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- 最近登录用户 -->
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>最近登录用户</h5>
                            <div class="btn-group">
                                <button class="btn btn-sm btn-outline-secondary" id="view-all-logins">
                                    <i class="bi bi-search"></i> 查询登录记录
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <ul class="list-group list-group-flush">
                                <?php if (count($recentLogins) > 0): ?>
                                    <?php foreach ($recentLogins as $login): ?>
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center">
                                            <i class="bi bi-person-circle me-2" style="font-size: 24px;"></i>
                                            <div>
                                                <div><?php echo htmlspecialchars($login['username']); ?></div>
                                                <small class="text-muted"><?php echo date('Y-m-d H:i', strtotime($login['login_time'])); ?></small>
                                            </div>
                                        </div>
                                        <div>
                                            <button class="btn btn-sm btn-outline-info view-login-btn me-1" data-id="<?php echo $login['id']; ?>" title="查看登录记录">
                                                <i class="bi bi-clock-history"></i>
                                            </button>
                                            <button class="btn btn-sm btn-outline-primary edit-user-btn" data-id="<?php echo $login['id']; ?>" title="编辑用户">
                                                <i class="bi bi-pencil"></i>
                                            </button>
                                        </div>
                                    </li>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <li class="list-group-item text-center">暂无登录记录</li>
                                <?php endif; ?>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 播放源使用占比 -->
            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>播放源使用占比</h5>
                            <small class="text-muted">播放历史中近30天内活跃的记录</small>
                        </div>
                        <div class="card-body">
                            <div class="row align-items-center">
                                <div class="col-lg-5">
                                    <div style="height: 320px;">
                                        <canvas
                                            id="playbackSourceChart"
                                            data-stats="<?php echo htmlspecialchars(json_encode($playbackSourceStats, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'); ?>"
                                        ></canvas>
                                    </div>
                                </div>
                                <div class="col-lg-7">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <span class="text-muted">累计播放次数</span>
                                        <strong id="playback-source-total"><?php echo number_format($playbackSourceStats['total_plays']); ?></strong>
                                    </div>
                                    <div class="table-responsive">
                                        <table class="table table-hover align-middle mb-0">
                                            <thead>
                                                <tr>
                                                    <th>播放源</th>
                                                    <th>播放次数</th>
                                                    <th>使用人数</th>
                                                    <th>占比</th>
                                                </tr>
                                            </thead>
                                            <tbody id="playback-source-stats-body">
                                                <?php if (!empty($playbackSourceStats['sources'])): ?>
                                                    <?php foreach ($playbackSourceStats['sources'] as $sourceStat): ?>
                                                        <tr>
                                                            <td><?php echo htmlspecialchars($sourceStat['name']); ?></td>
                                                            <td><?php echo number_format($sourceStat['play_count']); ?></td>
                                                            <td><?php echo number_format($sourceStat['listener_count']); ?></td>
                                                            <td>
                                                                <div class="d-flex align-items-center gap-2">
                                                                    <div class="progress flex-grow-1" style="height: 8px; min-width: 90px;">
                                                                        <div class="progress-bar" style="width: <?php echo $sourceStat['percentage']; ?>%"></div>
                                                                    </div>
                                                                    <span><?php echo number_format($sourceStat['percentage'], 2); ?>%</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    <?php endforeach; ?>
                                                <?php else: ?>
                                                    <tr>
                                                        <td colspan="4" class="text-center text-muted py-4">暂无播放历史数据</td>
                                                    </tr>
                                                <?php endif; ?>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>终端访问来源</h5>
                            <small class="text-muted">匿名统计，访问次数 5 分钟内去重；日活按自然日去重</small>
                        </div>
                        <div class="card-body">
                            <div class="row g-3 mb-4">
                                 <div class="col-md-4"><div class="border rounded p-3 h-100"><div class="text-muted small">网页端</div><div class="fs-4 fw-bold" id="client-entry-web-visits">--</div><div class="small text-muted">今日访问次数</div><div class="small text-muted">近 30 日总访问次数 <span id="client-entry-web-30d-visits">--</span> · 近 30 日独立访客 <span id="client-entry-web-users">--</span></div></div></div>
                                 <div class="col-md-4"><div class="border rounded p-3 h-100"><div class="text-muted small">桌面程序</div><div class="fs-4 fw-bold" id="client-entry-desktop-visits">--</div><div class="small text-muted">今日访问次数</div><div class="small text-muted">近 30 日总访问次数 <span id="client-entry-desktop-30d-visits">--</span> · 近 30 日独立访客 <span id="client-entry-desktop-users">--</span></div></div></div>
                                 <div class="col-md-4"><div class="border rounded p-3 h-100"><div class="text-muted small">安卓 APP</div><div class="fs-4 fw-bold" id="client-entry-android-visits">--</div><div class="small text-muted">今日访问次数</div><div class="small text-muted">近 30 日总访问次数 <span id="client-entry-android-30d-visits">--</span> · 近 30 日独立访客 <span id="client-entry-android-users">--</span></div></div></div>
                            </div>
                            <div style="height: 280px;"><canvas id="clientEntryTrendChart"></canvas></div>
                            <small id="client-entry-status" class="text-muted d-block mt-2"></small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- XCloud热歌榜 -->
            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h5>XCloud热歌榜 Top100</h5>
                            <small class="text-muted" id="xcloud-hot-updated-at">缓存未生成</small>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover align-middle">
                                    <thead>
                                        <tr>
                                            <th style="width: 70px;">排名</th>
                                            <th>歌曲</th>
                                            <th style="width: 100px;">来源</th>
                                            <th style="width: 120px;">播放次数</th>
                                            <th style="width: 120px;">听众数</th>
                                        </tr>
                                    </thead>
                                    <tbody id="xcloud-hot-toplist-body">
                                        <tr>
                                            <td colspan="5" class="text-center text-muted">正在加载...</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="loginStatsModal" tabindex="-1" aria-labelledby="loginStatsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="loginStatsModalLabel">登录统计详情</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-4">
                                <div class="col-md-12">
                                    <div class="card">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <h6>时间范围选择</h6>
                                            <div class="btn-group" role="group">
                                                <button type="button" class="btn btn-sm btn-outline-primary time-range-btn active" data-days="7">7天</button>
                                                <button type="button" class="btn btn-sm btn-outline-primary time-range-btn" data-days="30">30天</button>
                                                <button type="button" class="btn btn-sm btn-outline-primary time-range-btn" data-days="90">90天</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row mb-4">
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6 class="card-title">总用户数</h6>
                                            <h2 id="stats-total-users">--</h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6 class="card-title">活跃用户数</h6>
                                            <h2 id="stats-active-users">--</h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-body text-center">
                                            <h6 class="card-title">活跃比例</h6>
                                            <h2 id="stats-active-percentage">--</h2>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-8">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>登录趋势</h6>
                                        </div>
                                        <div class="card-body">
                                            <div style="height: 400px;">
                                                <canvas id="detailedLoginChart"></canvas>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card">
                                        <div class="card-header">
                                            <h6>最活跃用户</h6>
                                        </div>
                                        <div class="card-body">
                                            <ul class="list-group list-group-flush" id="top-users-list">
                                                <li class="list-group-item text-center">
                                                    <div class="spinner-border text-primary" role="status">
                                                        <span class="visually-hidden">加载中...</span>
                                                    </div>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 用户管理内容 -->
        <div id="users-content" style="display: none;">
            <!-- 用户列表 -->
            <div class="card">
                <div class="card-header">
                    <h5>用户管理</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table id="userTable" class="table table-hover data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>用户名</th>
                                    <th>邮箱</th>
                                    <th>注册时间</th>
                                    <th>最后登录</th>
                                    <th>邮箱状态</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php 
                                // 按ID正序排列用户
                                usort($allUsers, function($a, $b) {
                                    return $a['id'] - $b['id'];
                                });
                                foreach ($allUsers as $user): 
                                ?>
                                <tr>
                                    <td><?php echo $user['id']; ?></td>
                                    <td>
                                        <div class="d-flex align-items-center">
                                            <i class="bi bi-person-circle me-2" style="font-size: 24px;"></i>
                                            <?php echo htmlspecialchars($user['username']); ?>
                                        </div>
                                    </td>
                                    <td><?php echo htmlspecialchars($user['email'] ?? ''); ?></td>
                                    <td><?php echo date('Y-m-d H:i', strtotime($user['created_at'])); ?></td>
                                    <td><?php echo $user['last_login'] ? date('Y-m-d H:i', strtotime($user['last_login'])) : '从未登录'; ?></td>
                                    <td>
                                        <?php 
                                        $status = $user['email_verified_status'] ?? 0;
                                        if ($status == 0) {
                                            echo '<span class="badge bg-secondary">无需验证</span>';
                                        } elseif ($status == 1) {
                                            echo '<span class="badge bg-warning">待验证</span>';
                                        } elseif ($status == 2) {
                                            echo '<span class="badge bg-success">已验证</span>';
                                        }
                                        ?>
                                    </td>
                                    <td class="actions">
                                        <button class="btn btn-sm btn-primary edit-user-btn" data-id="<?php echo $user['id']; ?>">
                                            <i class="bi bi-pencil"></i> 编辑
                                        </button>
                                        <?php if ($status == 0): ?>
                                        <button class="btn btn-sm btn-warning verify-email-btn" data-id="<?php echo $user['id']; ?>">
                                            <i class="bi bi-envelope-check"></i> 邮箱验证
                                        </button>
                                        <?php else: ?>
                                        <button class="btn btn-sm btn-secondary reset-verify-btn" data-id="<?php echo $user['id']; ?>">
                                            <i class="bi bi-x-circle"></i> 重置验证
                                        </button>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <div id="feedback-content" style="display: none;">
            <div class="card feedback-panel">
                <div class="card-header">
                    <h5>问题反馈</h5>
                    <span id="feedback-total" class="badge bg-secondary">0 条</span>
                </div>
                <div class="card-body">
                    <div id="feedback-warning" class="alert alert-warning py-2" style="display: none;"></div>
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead><tr><th>提交时间</th><th>反馈内容</th><th>联系方式</th><th>状态</th><th>操作</th></tr></thead>
                            <tbody id="feedback-table-body">
                                <tr><td colspan="5" class="text-center text-muted py-4">正在加载...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div id="feedback-pagination" class="d-flex justify-content-between align-items-center gap-3">
                        <button id="feedback-prev" type="button" class="btn btn-sm btn-outline-secondary"><i class="bi bi-chevron-left"></i> 上一页</button>
                        <span id="feedback-page-info" class="text-muted">第 1 / 1 页</span>
                        <button id="feedback-next" type="button" class="btn btn-sm btn-outline-secondary">下一页 <i class="bi bi-chevron-right"></i></button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 修改密码模态框 -->
    <div class="modal fade" id="passwordModal" tabindex="-1" aria-labelledby="passwordModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="passwordModalLabel">修改管理员密码</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                </div>
                <div class="modal-body">
                    <form id="changePasswordForm">
                        <div class="mb-3">
                            <label for="currentPassword" class="form-label">当前密码</label>
                            <input type="password" class="form-control" id="currentPassword" required>
                        </div>
                        <div class="mb-3">
                            <label for="newAdminPassword" class="form-label">新密码</label>
                            <input type="password" class="form-control" id="newAdminPassword" required>
                            <div class="password-strength mt-2">
                                <div class="password-strength-bar"></div>
                            </div>
                            <small class="text-muted">密码强度指示</small>
                        </div>
                        <div class="mb-3">
                            <label for="confirmPassword" class="form-label">确认新密码</label>
                            <input type="password" class="form-control" id="confirmPassword" required>
                        </div>
                        <div class="text-end">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="submit" class="btn btn-primary">保存</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- 编辑用户模态框 -->
    <div class="modal fade" id="editUserModal" tabindex="-1" aria-labelledby="editUserModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="editUserModalLabel">编辑用户</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                </div>
                <form id="editUserForm">
                    <div class="modal-body">
                        <!-- 表单内容将通过JavaScript动态加载 -->
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button type="submit" class="btn btn-primary">保存修改</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- 用户登录详情模态框 -->
    <div class="modal fade" id="userLoginModal" tabindex="-1" aria-labelledby="userLoginModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="userLoginModalLabel">用户登录记录</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                </div>
                <div class="modal-body">
                    <!-- 用户搜索表单 -->
                    <div class="card mb-4">
                        <div class="card-header">
                            <h6>查询登录记录</h6>
                        </div>
                        <div class="card-body">
                            <form id="loginSearchForm" class="row g-3 align-items-end">
                                <div class="col-md-3">
                                    <label for="search-user-id" class="form-label">用户ID</label>
                                    <input type="number" class="form-control" id="search-user-id" placeholder="输入用户ID">
                                </div>
                                <div class="col-md-3">
                                    <label for="search-start-date" class="form-label">开始日期</label>
                                    <input type="date" class="form-control" id="search-start-date">
                                </div>
                                <div class="col-md-3">
                                    <label for="search-end-date" class="form-label">结束日期</label>
                                    <input type="date" class="form-control" id="search-end-date">
                                </div>
                                <div class="col-md-3">
                                    <button type="submit" class="btn btn-primary w-100">查询</button>
                                </div>
                            </form>
                        </div>
                    </div>

                    <!-- 用户信息 -->
                    <div id="user-info-container" class="card mb-4" style="display: none;">
                        <div class="card-header">
                            <h6>用户信息</h6>
                        </div>
                        <div class="card-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <p><strong>用户名:</strong> <span id="user-detail-username"></span></p>
                                    <p><strong>邮箱:</strong> <span id="user-detail-email"></span></p>
                                </div>
                                <div class="col-md-6">
                                    <p><strong>用户ID:</strong> <span id="user-detail-id"></span></p>
                                    <p><strong>最后登录:</strong> <span id="user-detail-last-login"></span></p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 登录统计图表 -->
                    <div id="login-chart-container" class="card mb-4" style="display: none;">
                        <div class="card-header">
                            <h6>近30天登录统计</h6>
                        </div>
                        <div class="card-body">
                            <div style="height: 300px;">
                                <canvas id="userLoginChart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- 登录记录表格 -->
                    <div class="card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6>登录记录</h6>
                            <span id="login-record-count" class="badge bg-primary">0条记录</span>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table id="loginTable" class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>用户</th>
                                            <th>登录时间</th>
                                            <th>IP地址</th>
                                            <th>设备信息</th>
                                        </tr>
                                    </thead>
                                    <tbody id="login-records">
                                        <tr>
                                            <td colspan="5" class="text-center">请选择用户或日期范围查询</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="feedbackDetailModal" tabindex="-1" aria-labelledby="feedbackDetailModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="feedbackDetailModalLabel">反馈详情</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                </div>
                <div class="modal-body">
                    <dl class="row mb-0">
                        <dt class="col-sm-3">提交时间</dt><dd id="feedback-detail-time" class="col-sm-9"></dd>
                        <dt class="col-sm-3">联系方式</dt><dd id="feedback-detail-email" class="col-sm-9 text-break"></dd>
                        <dt class="col-sm-3">回复状态</dt><dd id="feedback-detail-status" class="col-sm-9"></dd>
                        <dt class="col-sm-3">反馈内容</dt><dd id="feedback-detail-message" class="col-sm-9 feedback-message"></dd>
                    </dl>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="feedbackReplyModal" tabindex="-1" aria-labelledby="feedbackReplyModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="feedbackReplyModalLabel">回复反馈</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="关闭"></button>
                </div>
                <form id="feedback-reply-form">
                    <div class="modal-body">
                        <input type="hidden" id="feedback-reply-id">
                        <div class="mb-3">
                            <label for="feedback-reply-email" class="form-label">收件邮箱</label>
                            <input type="email" id="feedback-reply-email" class="form-control" readonly>
                        </div>
                        <div class="mb-2">
                            <label for="feedback-reply-message" class="form-label">回复内容</label>
                            <textarea id="feedback-reply-message" class="form-control" rows="8" maxlength="4000" required></textarea>
                        </div>
                        <div id="feedback-reply-error" class="text-danger small" role="alert"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                        <button id="feedback-reply-submit" type="submit" class="btn btn-primary"><i class="bi bi-send"></i> 发送回复</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- JavaScript库 -->
    <script>
        // 添加调试日志
        window.onerror = function(message, source, lineno, colno, error) {
            console.error("Error: ", message, "at", source, ":", lineno, ":", colno);
            alert("JavaScript错误: " + message);
            return false;
        };
    </script>
    <script src="/vendor/bootstrap/bootstrap.bundle.min.js"></script>
    <script src="/vendor/chart/chart.umd.min.js"></script>
    <script src="/vendor/jquery/jquery.min.js"></script>
    <script src="/vendor/datatables/jquery.dataTables.min.js"></script>
    <script src="/vendor/datatables/dataTables.bootstrap5.min.js"></script>
    <script src="assets/js/admin.js?v=1.0.2-source-stats"></script>
</body>
</html> 
